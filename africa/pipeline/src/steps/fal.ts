import { fal } from "@fal-ai/client";
import { mkdirSync } from "fs";
import { join } from "path";
import { DATA_DIR, requireEnv } from "../env";

// --- Types ---

export type FalMode = "image-to-video" | "text-to-video" | "video-to-video";

export interface FalOptions {
  mode: FalMode;
  prompt: string;

  // image-to-video
  imagePath?: string;       // local file — will be uploaded
  imageUrl?: string;        // or direct URL

  // video-to-video
  videoPath?: string;       // local file — will be uploaded
  videoUrl?: string;        // or direct URL
  keepAudio?: boolean;
  referenceImageUrls?: string[];  // style/character references for v2v edit

  // common
  duration?: "5" | "10";   // seconds (default "5")
  aspectRatio?: "16:9" | "9:16" | "1:1";  // text-to-video only
  generateAudio?: boolean;
  negativePrompt?: string;
  model?: "2.6" | "3.0";   // default "2.6" (cheaper)
  outputName?: string;      // filename without extension
}

export interface FalResult {
  videoUrl: string;         // fal.ai hosted URL (expires ~7 days)
  localPath: string;        // downloaded to data/renders/
  mode: FalMode;
  model: string;
  durationSec: number;
}

// --- Model IDs ---

const MODELS = {
  "2.6": {
    "image-to-video": "fal-ai/kling-video/v2.6/pro/image-to-video",
    "text-to-video": "fal-ai/kling-video/v2.6/pro/text-to-video",
    "video-to-video": "fal-ai/kling-video/o1/video-to-video/edit",
  },
  "3.0": {
    "image-to-video": "fal-ai/kling-video/v3/pro/image-to-video",
    "text-to-video": "fal-ai/kling-video/v3/pro/text-to-video",
    "video-to-video": "fal-ai/kling-video/o1/video-to-video/edit", // O1 is shared
  },
} as const;

// --- Helpers ---

/** Upload a local file to fal storage, return hosted URL */
async function uploadFile(localPath: string): Promise<string> {
  const file = Bun.file(localPath);
  const buffer = await file.arrayBuffer();
  const name = localPath.split("/").pop() || "upload";
  const type = name.endsWith(".mp4") ? "video/mp4"
    : name.endsWith(".png") ? "image/png"
    : "image/jpeg";
  const blob = new File([buffer], name, { type });
  const url = await fal.storage.upload(blob);
  console.log(`  [fal] uploaded ${name} → ${url}`);
  return url;
}

/** Download a URL to local path */
async function downloadVideo(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  await Bun.write(outputPath, await res.arrayBuffer());
}

// --- Main ---

export async function falGenerate(opts: FalOptions): Promise<FalResult> {
  requireEnv("FAL_KEY");
  fal.config({ credentials: process.env.FAL_KEY });

  const {
    mode,
    prompt,
    duration = "5",
    aspectRatio = "9:16",
    generateAudio = false,
    negativePrompt = "blur, distort, and low quality",
    model = "2.6",
    outputName = `fal_${mode}_${Date.now()}`,
    keepAudio = false,
    referenceImageUrls,
  } = opts;

  const modelId = MODELS[model][mode];
  console.log(`  [fal] mode: ${mode}, model: ${modelId}`);
  console.log(`  [fal] prompt: "${prompt.slice(0, 80)}${prompt.length > 80 ? "..." : ""}"`);

  // Resolve file inputs
  let imageUrl = opts.imageUrl;
  if (!imageUrl && opts.imagePath) {
    imageUrl = await uploadFile(opts.imagePath);
  }

  let videoUrl = opts.videoUrl;
  if (!videoUrl && opts.videoPath) {
    videoUrl = await uploadFile(opts.videoPath);
  }

  // Build input based on mode
  let input: Record<string, any>;

  switch (mode) {
    case "image-to-video":
      if (!imageUrl) throw new Error("image-to-video requires imagePath or imageUrl");
      input = {
        prompt,
        start_image_url: imageUrl,
        duration,
        generate_audio: generateAudio,
        negative_prompt: negativePrompt,
      };
      break;

    case "text-to-video":
      input = {
        prompt,
        duration,
        aspect_ratio: aspectRatio,
        cfg_scale: 0.5,
        generate_audio: generateAudio,
        negative_prompt: negativePrompt,
      };
      break;

    case "video-to-video":
      if (!videoUrl) throw new Error("video-to-video requires videoPath or videoUrl");
      input = {
        prompt,
        video_url: videoUrl,
        keep_audio: keepAudio,
        ...(referenceImageUrls?.length ? { image_urls: referenceImageUrls } : {}),
      };
      break;

    default:
      throw new Error(`Unknown mode: ${mode}`);
  }

  // Submit and wait
  console.log(`  [fal] submitting to queue...`);
  const result = await fal.subscribe(modelId, {
    input,
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === "IN_QUEUE") {
        console.log(`  [fal] queued (position: ${(update as any).queue_position ?? "?"})`);
      }
      if (update.status === "IN_PROGRESS") {
        const logs = (update as any).logs;
        if (logs?.length) {
          logs.slice(-1).forEach((l: any) => console.log(`  [fal] ${l.message}`));
        }
      }
    },
  });

  const video = (result.data as any).video;
  if (!video?.url) throw new Error("No video in response");

  console.log(`  [fal] generated: ${video.url}`);

  // Download to local
  const outputDir = join(DATA_DIR, "renders");
  mkdirSync(outputDir, { recursive: true });
  const localPath = join(outputDir, `${outputName}.mp4`);

  console.log(`  [fal] downloading to ${localPath}...`);
  await downloadVideo(video.url, localPath);

  // Probe duration
  const { $ } = await import("bun");
  const probe = await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${localPath}`.text();
  const durationSec = parseFloat(probe.trim()) || parseInt(duration);

  console.log(`  [fal] saved: ${localPath} (${durationSec.toFixed(1)}s)`);

  return {
    videoUrl: video.url,
    localPath,
    mode,
    model: modelId,
    durationSec,
  };
}

// --- CLI ---

if (import.meta.main) {
  await import("../env");
  const input = JSON.parse(process.argv[2] || await Bun.stdin.text());
  const result = await falGenerate(input);
  console.log(JSON.stringify(result, null, 2));
}
