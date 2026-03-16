import { $ } from "bun";
import { mkdirSync } from "fs";
import { join, basename } from "path";
import { DATA_DIR } from "../env";

// --- Types ---

export interface CutDetectOptions {
  videoPath: string;
  threshold?: number;      // scene change threshold 0-1 (default 0.25, lower = more sensitive)
  minSegmentSec?: number;  // merge cuts closer than this (default 0.2)
  outputDir?: string;      // where to write segments (default: data/segments/<videoName>/)
}

export interface Segment {
  index: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  path: string;            // local path to segment file
  thumbnailPath: string;   // first frame thumbnail
}

export interface CutDetectResult {
  source: string;
  totalDurationSec: number;
  segmentCount: number;
  segments: Segment[];
  outputDir: string;
}

// --- Scene detection ---

async function detectSceneChanges(videoPath: string, threshold: number): Promise<number[]> {
  // ffmpeg scene filter outputs frames where scene change score > threshold
  const raw = await $`ffmpeg -i ${videoPath} -vf "select='gt(scene,${threshold})',showinfo" -vsync vfr -f null - 2>&1`.text();

  const timestamps: number[] = [];
  for (const line of raw.split("\n")) {
    const match = line.match(/pts_time:([0-9.]+)/);
    if (match) {
      timestamps.push(parseFloat(match[1]));
    }
  }
  return timestamps;
}

// --- Get video info ---

async function getVideoInfo(videoPath: string): Promise<{ duration: number; fps: number }> {
  const durRaw = await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${videoPath}`.text();
  const fpsRaw = await $`ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 ${videoPath}`.text();
  const duration = parseFloat(durRaw.trim());
  // r_frame_rate is like "30/1" or "30000/1001"
  const [num, den] = fpsRaw.trim().split("/").map(Number);
  const fps = den ? num / den : 30;
  return { duration, fps };
}

// --- Main ---

export async function cutDetect(opts: CutDetectOptions): Promise<CutDetectResult> {
  const {
    videoPath,
    threshold = 0.25,
    minSegmentSec = 0.2,
  } = opts;

  const { duration: totalDuration, fps } = await getVideoInfo(videoPath);
  const frameDur = 1 / fps; // duration of 1 frame in seconds
  const videoName = basename(videoPath, ".mp4").replace(/[^a-zA-Z0-9_-]/g, "_");

  const outputDir = opts.outputDir || join(DATA_DIR, "segments", videoName);
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(join(outputDir, "thumbnails"), { recursive: true });

  console.log(`  [cutdetect] analyzing ${videoName} (${totalDuration.toFixed(1)}s, ${fps.toFixed(1)}fps)...`);
  console.log(`  [cutdetect] threshold: ${threshold}, min segment: ${minSegmentSec}s, frame offset: ${(frameDur * 1000).toFixed(1)}ms`);

  // Detect scene changes
  const rawCuts = await detectSceneChanges(videoPath, threshold);
  console.log(`  [cutdetect] raw scene changes: ${rawCuts.length}`);

  // Merge cuts that are too close together
  // Scene detection fires on the FIRST frame of the NEW scene.
  // Offset back by 1 frame so the bleed frame goes to the next segment, not the previous one.
  const cuts: number[] = [0]; // always start at 0
  for (const t of rawCuts) {
    const adjusted = Math.max(0, t - frameDur); // pull back 1 frame
    const lastCut = cuts[cuts.length - 1];
    if (adjusted - lastCut >= minSegmentSec) {
      cuts.push(adjusted);
    }
  }

  // Build segment list
  const segments: Segment[] = [];
  for (let i = 0; i < cuts.length; i++) {
    const startSec = cuts[i];
    const endSec = i + 1 < cuts.length ? cuts[i + 1] : totalDuration;
    const durationSec = endSec - startSec;

    const idx = i + 1;
    const num = String(idx).padStart(3, "0");
    const segPath = join(outputDir, `seg_${num}.mp4`);
    const thumbPath = join(outputDir, "thumbnails", `seg_${num}.jpg`);

    segments.push({
      index: idx,
      startSec: Math.round(startSec * 1000) / 1000,
      endSec: Math.round(endSec * 1000) / 1000,
      durationSec: Math.round(durationSec * 1000) / 1000,
      path: segPath,
      thumbnailPath: thumbPath,
    });
  }

  console.log(`  [cutdetect] splitting into ${segments.length} segments...`);

  // Split video into segments (parallel, batches of 4)
  const BATCH = 4;
  for (let b = 0; b < segments.length; b += BATCH) {
    const batch = segments.slice(b, b + BATCH);
    await Promise.all(batch.map(async (seg) => {
      // Extract video segment — re-encode for clean cuts
      await $`ffmpeg -y -ss ${seg.startSec} -i ${videoPath} -t ${seg.durationSec} -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 128k ${seg.path} -loglevel warning`.quiet();

      // Extract thumbnail (first frame of segment)
      await $`ffmpeg -y -ss ${seg.startSec} -i ${videoPath} -vframes 1 -q:v 3 ${seg.thumbnailPath} -loglevel warning`.quiet();
    }));
    console.log(`  [cutdetect] split ${Math.min(b + BATCH, segments.length)}/${segments.length}`);
  }

  // Summary
  const durations = segments.map(s => s.durationSec);
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  const shortest = Math.min(...durations);
  const longest = Math.max(...durations);

  console.log(`  [cutdetect] done! ${segments.length} segments`);
  console.log(`  [cutdetect] durations — avg: ${avg.toFixed(2)}s, min: ${shortest.toFixed(2)}s, max: ${longest.toFixed(2)}s`);
  console.log(`  [cutdetect] output: ${outputDir}`);

  const result: CutDetectResult = {
    source: videoPath,
    totalDurationSec: totalDuration,
    segmentCount: segments.length,
    segments,
    outputDir,
  };

  // Write manifest
  await Bun.write(join(outputDir, "manifest.json"), JSON.stringify(result, null, 2));

  return result;
}

// --- CLI ---

if (import.meta.main) {
  await import("../env");
  const input = process.argv[2];
  if (!input) {
    console.log(`Usage: bun run src/steps/cutdetect.ts <videoPath> [threshold]`);
    console.log(`       bun run src/steps/cutdetect.ts '{"videoPath":"...","threshold":0.3}'`);
    process.exit(1);
  }

  let opts: CutDetectOptions;
  if (input.startsWith("{")) {
    opts = JSON.parse(input);
  } else {
    opts = {
      videoPath: input,
      threshold: process.argv[3] ? parseFloat(process.argv[3]) : undefined,
    };
  }

  const result = await cutDetect(opts);
  console.log(JSON.stringify(result, null, 2));
}
