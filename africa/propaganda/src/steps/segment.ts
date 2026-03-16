import { fal } from "@fal-ai/client";
import { mkdirSync } from "fs";
import { join } from "path";
import { DATA_DIR, requireEnv } from "../env";

// --- Types ---

export interface SegmentOptions {
  videoPath?: string;       // local video to segment person from
  videoUrl?: string;        // or remote URL
  model?: "Matting" | "Portrait" | "General Use (Light)" | "General Use (Heavy)";
  outputName?: string;
}

export interface SegmentResult {
  segmentedPath: string;    // webm with alpha (person only, transparent bg)
  mattePath: string;        // grayscale alpha matte
}

export type OverlayPosition = "center" | "bottom-left" | "bottom-right" | "top-left" | "top-right";

export interface CompositeOptions {
  backgroundVideo: string;  // video to use as background (or image sequence)
  foregroundVideo: string;  // segmented person (webm with alpha, or mp4 + matteVideo)
  matteVideo?: string;      // grayscale matte if foreground has no alpha channel
  fgScale?: number;         // scale the foreground person (1.0 = no change, 1.05 = 5% bigger)
  fgWidth?: number;         // explicit width for foreground (overrides fgScale)
  fgHeight?: number;        // explicit height for foreground (overrides fgScale)
  position?: OverlayPosition; // where to place the person (default: "center")
  padding?: number;         // padding from edges in px (default: 20)
  outputName?: string;
}

export interface CompositeResult {
  outputPath: string;
  durationSec: number;
}

// --- Helpers ---

async function uploadFile(localPath: string): Promise<string> {
  const file = Bun.file(localPath);
  const buffer = await file.arrayBuffer();
  const name = localPath.split("/").pop() || "upload";
  const type = name.endsWith(".mp4") ? "video/mp4"
    : name.endsWith(".webm") ? "video/webm"
    : name.endsWith(".mov") ? "video/quicktime"
    : "video/mp4";
  const blob = new File([buffer], name, { type });
  const url = await fal.storage.upload(blob);
  console.log(`  [segment] uploaded ${name} → ${url}`);
  return url;
}

// --- Segment person from video via BiRefNet v2 ---

export async function segmentPerson(opts: SegmentOptions): Promise<SegmentResult> {
  requireEnv("FAL_KEY");
  fal.config({ credentials: process.env.FAL_KEY });

  const { model = "Matting", outputName = `segmented_${Date.now()}` } = opts;

  let videoUrl = opts.videoUrl;
  if (!videoUrl && opts.videoPath) videoUrl = await uploadFile(opts.videoPath);
  if (!videoUrl) throw new Error("segment requires videoPath or videoUrl");

  console.log(`  [segment] BiRefNet v2 Video, model: ${model}`);
  console.log(`  [segment] submitting...`);

  const result = await fal.subscribe("fal-ai/birefnet/v2/video", {
    input: {
      video_url: videoUrl,
      model,
      output_mask: true,
      video_output_type: "VP9 (.webm)",
      refine_foreground: true,
    },
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === "IN_QUEUE") {
        console.log(`  [segment] queued (position: ${(update as any).queue_position ?? "?"})`);
      }
      if (update.status === "IN_PROGRESS") {
        const logs = (update as any).logs;
        if (logs?.length) logs.slice(-1).forEach((l: any) => console.log(`  [segment] ${l.message}`));
      }
    },
  });

  const data = result.data as any;
  const videoOut = data.video?.url;
  const maskOut = data.mask_video?.url;
  if (!videoOut) throw new Error("No segmented video in response");

  console.log(`  [segment] video URL: ${videoOut}`);
  if (maskOut) console.log(`  [segment] matte URL: ${maskOut}`);

  // Download via curl (Bun fetch times out on large webm files)
  const { $ } = await import("bun");
  const outputDir = join(DATA_DIR, "renders");
  mkdirSync(outputDir, { recursive: true });

  const segmentedPath = join(outputDir, `${outputName}.webm`);
  console.log(`  [segment] downloading segmented → ${segmentedPath}`);
  await $`curl -sL -o ${segmentedPath} ${videoOut}`.quiet();

  // Verify webm downloaded properly (fal upload lag can cause partial files)
  const segFile = Bun.file(segmentedPath);
  if ((await segFile.size) < 1000) {
    const text = await segFile.text();
    if (text.includes("Upload still in progress")) {
      console.log(`  [segment] webm not ready yet, will use matte fallback`);
    }
  }

  let mattePath = "";
  if (maskOut) {
    mattePath = join(outputDir, `${outputName}_matte.mp4`);
    console.log(`  [segment] downloading matte → ${mattePath}`);
    await $`curl -sL -o ${mattePath} ${maskOut}`.quiet();
  }

  console.log(`  [segment] done: ${segmentedPath}`);
  return { segmentedPath, mattePath };
}

// --- Composite: overlay segmented person onto background video ---

export async function composite(opts: CompositeOptions): Promise<CompositeResult> {
  const {
    backgroundVideo,
    foregroundVideo,
    matteVideo,
    fgScale = 1.0,
    position = "center",
    padding = 20,
    outputName = `composite_${Date.now()}`,
  } = opts;

  const outputDir = join(DATA_DIR, "renders");
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, `${outputName}.mp4`);

  const { $ } = await import("bun");

  // Probe background video
  const probe = await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${backgroundVideo}`.text();
  const duration = parseFloat(probe.trim());
  const dimProbe = await $`ffprobe -v error -show_entries stream=width,height -of csv=p=0:s=x ${backgroundVideo}`.text();
  const [w, h] = dimProbe.trim().split("x").map(Number);

  // Probe foreground dimensions
  const fgDimProbe = await $`ffprobe -v error -show_entries stream=width,height -of csv=p=0:s=x ${foregroundVideo}`.text();
  const [fgW, fgH] = fgDimProbe.trim().split("x").map(Number);

  const isWebm = foregroundVideo.endsWith(".webm");

  // Calculate foreground size
  let sw: number, sh: number;
  if (opts.fgWidth && opts.fgHeight) {
    sw = opts.fgWidth;
    sh = opts.fgHeight;
  } else if (opts.fgWidth) {
    sw = opts.fgWidth;
    sh = Math.round(fgH * (sw / fgW));
  } else if (opts.fgHeight) {
    sh = opts.fgHeight;
    sw = Math.round(fgW * (sh / fgH));
  } else {
    sw = Math.round(w * fgScale);
    sh = Math.round(h * fgScale);
  }

  // Calculate position offset
  let ox: number, oy: number;
  switch (position) {
    case "bottom-left":
      ox = padding;
      oy = h - sh - padding;
      break;
    case "bottom-right":
      ox = w - sw - padding;
      oy = h - sh - padding;
      break;
    case "top-left":
      ox = padding;
      oy = padding;
      break;
    case "top-right":
      ox = w - sw - padding;
      oy = padding;
      break;
    case "center":
    default:
      ox = Math.round((w - sw) / 2);
      oy = Math.round((h - sh) / 2);
      break;
  }

  console.log(`  [composite] bg: ${w}x${h}, ${duration.toFixed(1)}s | fg: ${sw}x${sh} @ ${position} (${ox},${oy})`);

  if (isWebm) {
    console.log(`  [composite] webm with alpha → overlay`);
    await $`ffmpeg -y -i ${backgroundVideo} -i ${foregroundVideo} -filter_complex "[1:v]scale=${sw}:${sh}[fg];[0:v][fg]overlay=${ox}:${oy}:shortest=1[out]" -map "[out]" -map 0:a? -c:v libx264 -crf 23 -t ${duration} -movflags +faststart ${outputPath}`.quiet();
  } else if (matteVideo) {
    console.log(`  [composite] matte + alphamerge → overlay`);
    await $`ffmpeg -y -i ${backgroundVideo} -i ${foregroundVideo} -i ${matteVideo} -filter_complex "[1:v]scale=${sw}:${sh}[fg];[2:v]scale=${sw}:${sh}[mask];[fg][mask]alphamerge[person];[0:v][person]overlay=${ox}:${oy}:shortest=1[out]" -map "[out]" -map 0:a? -c:v libx264 -crf 23 -t ${duration} -movflags +faststart ${outputPath}`.quiet();
  } else {
    throw new Error("Foreground must be .webm with alpha or provide a matteVideo");
  }

  const outProbe = await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${outputPath}`.text();
  const durationSec = parseFloat(outProbe.trim()) || duration;

  console.log(`  [composite] saved: ${outputPath} (${durationSec.toFixed(1)}s)`);
  return { outputPath, durationSec };
}

// --- CLI ---

if (import.meta.main) {
  await import("../env");
  const arg = process.argv[2];

  if (!arg) {
    console.log("Usage:");
    console.log('  bun run src/steps/segment.ts \'{"videoPath":"..."}\'');
    console.log('  bun run src/steps/segment.ts composite \'{"backgroundVideo":"...","foregroundVideo":"...","fgScale":1.05}\'');
    process.exit(1);
  }

  if (arg === "composite") {
    const input = JSON.parse(process.argv[3] || await Bun.stdin.text());
    const result = await composite(input);
    console.log(JSON.stringify(result, null, 2));
  } else {
    const input = JSON.parse(arg);
    const result = await segmentPerson(input);
    console.log(JSON.stringify(result, null, 2));
  }
}
