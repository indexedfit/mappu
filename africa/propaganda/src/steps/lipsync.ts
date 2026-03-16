import { mkdirSync } from "fs";
import { join } from "path";
import { DATA_DIR, requireEnv } from "../env";

// --- Types ---

export type LipSyncModel = "aurora" | "veed" | "omnihuman";

export interface LipSyncOptions {
  imagePath: string;        // character image (portrait, dark bg recommended)
  audioPath: string;        // speech audio (mp3/wav)
  model?: LipSyncModel;     // default: "veed" (best quality)
  resolution?: "720p" | "480p";
  segmented?: boolean;      // split audio at pauses, generate each separately (default: true)
  maxSegDuration?: number;  // max seconds per segment (default: 5)
  outputName?: string;
}

export interface LipSyncResult {
  videoPath: string;
  durationSec: number;
  model: string;
  segments?: number;        // how many segments were generated (if segmented)
}

export interface PresenterOptions {
  lipSyncVideo: string;       // lip-synced talking video (or segmented concat)
  lipSyncSegments?: string[]; // individual segment video paths (use instead of lipSyncVideo for greenscreen)
  matteVideos?: string[];     // BiRefNet matte videos matching lipSyncSegments
  backgroundVideo: string;    // background video (e.g. app screen recording)
  audioPath: string;          // TTS audio to lay on top
  segments?: number;          // how many position switches (default: auto from segments array or 3)
  pipScale?: number;          // PIP width in px (default: 420)
  cropRatio?: number;         // crop top N% of lip sync video (default: 0.76)
  compositeMode?: "pip" | "matte"; // "pip" = bordered rectangle, "matte" = BiRefNet bg removal (default: "matte")
  outputName?: string;
}

export interface PresenterResult {
  outputPath: string;
  durationSec: number;
}

// --- Helpers ---

const FAL_API = "https://queue.fal.run";
const FAL_STORAGE = "https://rest.alpha.fal.ai/storage/upload/initiate";

async function falUpload(localPath: string): Promise<string> {
  const key = requireEnv("FAL_KEY");
  const fileName = localPath.split("/").pop() || "upload";
  const ext = fileName.split(".").pop() || "";
  const contentType = ext === "mp3" ? "audio/mpeg"
    : ext === "wav" ? "audio/wav"
    : ext === "png" ? "image/png"
    : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
    : "application/octet-stream";

  // Initiate upload
  const initRes = await fetch(FAL_STORAGE, {
    method: "POST",
    headers: { "Authorization": `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ file_name: fileName, content_type: contentType }),
  });
  const { upload_url, file_url } = await initRes.json() as any;

  // Upload file
  const fileData = await Bun.file(localPath).arrayBuffer();
  await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: fileData,
  });

  console.log(`  [lipsync] uploaded ${fileName} → ${file_url}`);
  return file_url;
}

async function falSubmit(model: string, input: Record<string, any>): Promise<string> {
  const key = requireEnv("FAL_KEY");
  const res = await fetch(`${FAL_API}/${model}`, {
    method: "POST",
    headers: { "Authorization": `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json() as any;
  if (data.status === "IN_QUEUE" || data.request_id) {
    console.log(`  [lipsync] queued: ${data.request_id}`);
    return data.request_id;
  }
  throw new Error(`Failed to queue: ${JSON.stringify(data)}`);
}

async function falPoll(model: string, requestId: string, maxWaitMs = 600000): Promise<any> {
  const key = requireEnv("FAL_KEY");
  const statusUrl = `${FAL_API}/${model}/requests/${requestId}/status`;
  const resultUrl = `${FAL_API}/${model}/requests/${requestId}`;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(statusUrl, { headers: { "Authorization": `Key ${key}` } });
    const data = await res.json() as any;

    if (data.status === "COMPLETED") {
      const result = await fetch(resultUrl, { headers: { "Authorization": `Key ${key}` } });
      return result.json();
    }
    if (data.status === "FAILED" || data.status === "ERROR") {
      throw new Error(`Job failed: ${JSON.stringify(data)}`);
    }

    console.log(`  [lipsync] ${data.status}...`);
    await Bun.sleep(10000);
  }
  throw new Error("Timed out waiting for result");
}

// --- Model configs ---

const MODEL_MAP: Record<LipSyncModel, { falModel: string; buildInput: (imageUrl: string, audioUrl: string, res: string) => Record<string, any> }> = {
  aurora: {
    falModel: "fal-ai/creatify/aurora",
    buildInput: (imageUrl, audioUrl, resolution) => ({ image_url: imageUrl, audio_url: audioUrl, resolution }),
  },
  veed: {
    falModel: "veed/fabric-1.0",
    buildInput: (imageUrl, audioUrl, resolution) => ({ image_url: imageUrl, audio_url: audioUrl, resolution }),
  },
  omnihuman: {
    falModel: "fal-ai/bytedance/omnihuman/v1.5",
    buildInput: (imageUrl, audioUrl, resolution) => ({ image_url: imageUrl, audio_url: audioUrl, resolution }),
  },
};

// --- Silence detection: find natural pause points in audio ---

export async function detectPauses(audioPath: string, minSilenceDur = 0.3, noiseDb = -30): Promise<number[]> {
  const { $ } = await import("bun");
  const output = await $`ffmpeg -i ${audioPath} -af silencedetect=noise=${noiseDb}dB:d=${minSilenceDur} -f null - 2>&1`.text();

  const cuts: number[] = [];
  const lines = output.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const startMatch = lines[i].match(/silence_start:\s+([\d.]+)/);
    const endMatch = lines[i + 1]?.match(/silence_end:\s+([\d.]+)/);
    if (startMatch && endMatch) {
      // Cut at midpoint of silence
      const mid = (parseFloat(startMatch[1]) + parseFloat(endMatch[1])) / 2;
      cuts.push(Math.round(mid * 100) / 100);
    }
  }

  return cuts;
}

// --- Lip sync: image + audio → talking video ---

async function lipSyncSingle(
  imageUrl: string,
  audioPath: string,
  config: typeof MODEL_MAP[LipSyncModel],
  resolution: string,
  outputPath: string,
): Promise<{ videoPath: string; durationSec: number }> {
  const { $ } = await import("bun");
  const audioUrl = await falUpload(audioPath);
  const input = config.buildInput(imageUrl, audioUrl, resolution);
  const requestId = await falSubmit(config.falModel, input);
  const result = await falPoll(config.falModel, requestId);
  const videoUrl = result?.video?.url;
  if (!videoUrl) throw new Error(`No video URL in response`);

  await $`curl -sL -o ${outputPath} ${videoUrl}`.quiet();
  const probe = await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${outputPath}`.text();
  return { videoPath: outputPath, durationSec: parseFloat(probe.trim()) };
}

export async function lipSync(opts: LipSyncOptions): Promise<LipSyncResult> {
  requireEnv("FAL_KEY");

  const {
    model = "veed",
    resolution = "720p",
    segmented = true,
    maxSegDuration = 5,
    outputName = `lipsync_${Date.now()}`,
  } = opts;

  const config = MODEL_MAP[model];
  if (!config) throw new Error(`Unknown model: ${model}. Options: ${Object.keys(MODEL_MAP).join(", ")}`);

  const { $ } = await import("bun");
  const outputDir = join(DATA_DIR, "renders");
  mkdirSync(outputDir, { recursive: true });

  // Upload image once
  const imageUrl = await falUpload(opts.imagePath);

  // Probe audio duration
  const audioDur = parseFloat(
    (await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${opts.audioPath}`.text()).trim()
  );

  // If short enough or segmented disabled, do single generation
  if (!segmented || audioDur <= maxSegDuration) {
    console.log(`  [lipsync] single-shot, model: ${model}, ${audioDur.toFixed(1)}s`);
    const videoPath = join(outputDir, `${outputName}.mp4`);
    const result = await lipSyncSingle(imageUrl, opts.audioPath, config, resolution, videoPath);
    console.log(`  [lipsync] saved: ${result.videoPath} (${result.durationSec.toFixed(1)}s)`);
    return { ...result, model };
  }

  // Segmented: detect pauses and split audio
  console.log(`  [lipsync] segmented mode, model: ${model}, ${audioDur.toFixed(1)}s`);
  const pauses = await detectPauses(opts.audioPath);

  // Filter pauses to ensure segments aren't too short (<1.5s) or too long (>maxSegDuration)
  const cuts: number[] = [0];
  for (const p of pauses) {
    const lastCut = cuts[cuts.length - 1];
    if (p - lastCut >= 1.5 && p < audioDur - 0.5) {
      cuts.push(p);
    }
  }
  cuts.push(audioDur);

  // Merge segments that are too short
  const segments: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const seg = { start: cuts[i], end: cuts[i + 1] };
    if (segments.length > 0 && seg.end - seg.start < 1.5) {
      segments[segments.length - 1].end = seg.end; // merge into previous
    } else {
      segments.push(seg);
    }
  }

  console.log(`  [lipsync] ${segments.length} segments: ${segments.map(s => `${(s.end - s.start).toFixed(1)}s`).join(", ")}`);

  // Split audio and generate each segment
  const audioDir = join(DATA_DIR, "audio");
  mkdirSync(audioDir, { recursive: true });
  const segPaths: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const dur = seg.end - seg.start;
    const segAudioPath = join(audioDir, `${outputName}_seg${i}.mp3`);
    const segVideoPath = join(outputDir, `${outputName}_seg${i}.mp4`);

    // Split audio
    if (i === segments.length - 1) {
      await $`ffmpeg -y -i ${opts.audioPath} -ss ${seg.start} -c copy ${segAudioPath}`.quiet();
    } else {
      await $`ffmpeg -y -i ${opts.audioPath} -ss ${seg.start} -t ${dur} -c copy ${segAudioPath}`.quiet();
    }

    console.log(`  [lipsync] seg ${i + 1}/${segments.length}: ${dur.toFixed(1)}s`);
    const result = await lipSyncSingle(imageUrl, segAudioPath, config, resolution, segVideoPath);
    segPaths.push(result.videoPath);

    // Cleanup audio segment
    await $`rm -f ${segAudioPath}`.quiet();
  }

  // Concat all segments
  const concatFile = `/tmp/${outputName}_concat.txt`;
  await Bun.write(concatFile, segPaths.map(p => `file '${p}'`).join("\n"));
  const videoPath = join(outputDir, `${outputName}.mp4`);
  await $`ffmpeg -y -f concat -safe 0 -i ${concatFile} -c copy ${videoPath}`.quiet();

  // Cleanup segment videos and concat file
  for (const p of segPaths) await $`rm -f ${p}`.quiet();
  await $`rm -f ${concatFile}`.quiet();

  const probe = await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${videoPath}`.text();
  const durationSec = parseFloat(probe.trim());

  console.log(`  [lipsync] saved: ${videoPath} (${durationSec.toFixed(1)}s, ${segments.length} segments)`);
  return { videoPath, durationSec, model, segments: segments.length };
}

// --- Presenter: lip sync video + background → composite with position switching ---

export async function presenter(opts: PresenterOptions): Promise<PresenterResult> {
  const {
    lipSyncVideo,
    lipSyncSegments,
    matteVideos,
    backgroundVideo,
    audioPath,
    pipScale = 420,
    cropRatio = 0.76,
    compositeMode = "matte",
    outputName = `presenter_${Date.now()}`,
  } = opts;

  const numSegments = opts.segments ?? lipSyncSegments?.length ?? 3;

  const { $ } = await import("bun");
  const outputDir = join(DATA_DIR, "renders");
  mkdirSync(outputDir, { recursive: true });

  // Probe first segment or full video for dimensions/duration
  const probeVideo = lipSyncSegments?.[0] ?? lipSyncVideo;
  const lsDim = (await $`ffprobe -v error -show_entries stream=width,height -of csv=p=0:s=x ${probeVideo}`.text()).trim();
  const [lsW, lsH] = lsDim.split("x").map(Number);

  // Get total duration: sum of segments or probe the full video
  let totalDur: number;
  const segDurs: number[] = [];
  if (lipSyncSegments?.length) {
    for (const seg of lipSyncSegments) {
      const d = parseFloat((await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${seg}`.text()).trim());
      segDurs.push(d);
    }
    totalDur = segDurs.reduce((a, b) => a + b, 0);
  } else {
    totalDur = parseFloat((await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${lipSyncVideo}`.text()).trim());
    const segDur = totalDur / numSegments;
    for (let i = 0; i < numSegments; i++) segDurs.push(segDur);
  }

  // Crop dimensions for person
  const cropW = Math.round(lsW * 0.75);
  const cropH_gs = Math.round(lsH * 0.69);
  const cropX = Math.round((lsW - cropW) / 2);
  const cropY = Math.round(lsH * 0.04);
  const cropH_pip = Math.round(lsH * cropRatio);
  const positions = ["left", "right"];

  console.log(`  [presenter] ${numSegments} segments, ${compositeMode} mode, scale ${pipScale}px`);

  const partPaths: string[] = [];
  let bgOffset = 0;

  for (let i = 0; i < numSegments; i++) {
    const pos = positions[i % 2];
    const dur = segDurs[i];
    const partPath = join(outputDir, `${outputName}_part${i}.mp4`);
    partPaths.push(partPath);
    const overlayX = pos === "left" ? "20" : "W-w-20";

    if (compositeMode === "matte" && lipSyncSegments && matteVideos) {
      // BiRefNet matte: use individual segment + matte for alphamerge
      const segPath = lipSyncSegments[i];
      const mattePath = matteVideos[i];
      const filter = `[1:v]crop=${cropW}:${cropH_gs}:${cropX}:${cropY},scale=${pipScale}:-1[person];[2:v]crop=${cropW}:${cropH_gs}:${cropX}:${cropY},scale=${pipScale}:-1[matte];[person][matte]alphamerge[fg];[0:v][fg]overlay=${overlayX}:H-h-40:shortest=1[out]`;
      await $`ffmpeg -y -ss ${bgOffset} -t ${dur} -i ${backgroundVideo} -i ${segPath} -i ${mattePath} -filter_complex ${filter} -map "[out]" -c:v libx264 -crf 23 -t ${dur} -movflags +faststart ${partPath}`.quiet();
    } else {
      // PIP: bordered rectangle, seek into full lip sync video
      const filter = `[1:v]crop=${lsW}:${cropH_pip}:0:0,scale=${pipScale}:-1,pad=w=iw+4:h=ih+4:x=2:y=2:color=white@0.6[fg];[0:v][fg]overlay=${overlayX}:H-h-100:shortest=1[out]`;
      await $`ffmpeg -y -ss ${bgOffset} -t ${dur} -i ${backgroundVideo} -ss ${bgOffset} -t ${dur} -i ${lipSyncVideo} -filter_complex ${filter} -map "[out]" -c:v libx264 -crf 23 -t ${dur} -movflags +faststart ${partPath}`.quiet();
    }

    console.log(`  [presenter] part ${i + 1}/${numSegments}: ${pos}, ${dur.toFixed(1)}s`);
    bgOffset += dur;
  }

  // Concat
  const concatPath = join(outputDir, `${outputName}_concat.mp4`);
  const concatList = partPaths.map(p => `file '${p}'`).join("\n");
  const concatFile = `/tmp/${outputName}_concat.txt`;
  await Bun.write(concatFile, concatList);
  await $`ffmpeg -y -f concat -safe 0 -i ${concatFile} -c copy ${concatPath}`.quiet();

  // Add audio
  const finalPath = join(outputDir, `${outputName}.mp4`);
  await $`ffmpeg -y -i ${concatPath} -i ${audioPath} -c:v copy -c:a aac -t ${totalDur} -movflags +faststart ${finalPath}`.quiet();

  // Cleanup temp files
  for (const p of partPaths) await $`rm -f ${p}`.quiet();
  await $`rm -f ${concatPath} ${concatFile}`.quiet();

  const outProbe = await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${finalPath}`.text();
  const durationSec = parseFloat(outProbe.trim());

  console.log(`  [presenter] final: ${finalPath} (${durationSec.toFixed(1)}s)`);
  return { outputPath: finalPath, durationSec };
}

// --- CLI ---

if (import.meta.main) {
  await import("../env");
  const arg = process.argv[2];

  if (!arg) {
    console.log("Usage:");
    console.log('  bun run src/steps/lipsync.ts \'{"imagePath":"...","audioPath":"...","model":"aurora"}\'');
    console.log('  bun run src/steps/lipsync.ts presenter \'{"lipSyncVideo":"...","backgroundVideo":"...","audioPath":"..."}\'');
    console.log("");
    console.log("Models: veed (best, default), aurora, omnihuman");
    process.exit(1);
  }

  if (arg === "presenter") {
    const input = JSON.parse(process.argv[3] || await Bun.stdin.text());
    const result = await presenter(input);
    console.log(JSON.stringify(result, null, 2));
  } else {
    const input = JSON.parse(arg);
    const result = await lipSync(input);
    console.log(JSON.stringify(result, null, 2));
  }
}
