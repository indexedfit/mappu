import { fal } from "@fal-ai/client";
import { mkdirSync } from "fs";
import { join } from "path";
import { DATA_DIR, requireEnv } from "../env";

// --- Types ---

export type FalMode = "image-to-video" | "text-to-video" | "video-to-video";

export interface ElementRef {
  referenceImageUrls?: string[];  // multiple angles of the character
  frontalImageUrl?: string;       // front-facing shot (best results)
  referenceImagePaths?: string[]; // local files — will be uploaded
  frontalImagePath?: string;      // local file — will be uploaded
}

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
  referenceImageUrls?: string[];  // style references (@Image1, @Image2 in prompt)
  elements?: ElementRef[];        // character refs (@Element1, @Element2 in prompt)

  // first-frame workflow: extract frame 0, use as basis for character swap
  extractFirstFrame?: boolean;    // auto-extract first frame from video

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

/** Extract first frame from a video as JPEG */
async function extractFirstFrame(videoPath: string): Promise<string> {
  const { $ } = await import("bun");
  const outputDir = join(DATA_DIR, "frames");
  mkdirSync(outputDir, { recursive: true });
  const framePath = join(outputDir, `first_frame_${Date.now()}.jpg`);
  await $`ffmpeg -i ${videoPath} -vframes 1 -q:v 2 -y ${framePath} -loglevel warning`.quiet();
  console.log(`  [fal] extracted first frame → ${framePath}`);
  return framePath;
}

/** Upload an ElementRef's local files and return resolved URLs */
async function resolveElement(el: ElementRef): Promise<{ reference_image_urls?: string[]; frontal_image_url?: string }> {
  const resolved: any = {};

  // Resolve frontal image
  if (el.frontalImageUrl) {
    resolved.frontal_image_url = el.frontalImageUrl;
  } else if (el.frontalImagePath) {
    resolved.frontal_image_url = await uploadFile(el.frontalImagePath);
  }

  // Resolve reference images
  const refUrls: string[] = [...(el.referenceImageUrls || [])];
  if (el.referenceImagePaths) {
    for (const p of el.referenceImagePaths) {
      refUrls.push(await uploadFile(p));
    }
  }
  if (refUrls.length) resolved.reference_image_urls = refUrls;

  return resolved;
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
    elements,
    extractFirstFrame: shouldExtractFirstFrame = false,
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

    case "video-to-video": {
      if (!videoUrl && !opts.videoPath) throw new Error("video-to-video requires videoPath or videoUrl");

      // First-frame workflow: extract frame 0 for reference
      if (shouldExtractFirstFrame && opts.videoPath) {
        const framePath = await extractFirstFrame(opts.videoPath);
        console.log(`  [fal] first-frame workflow: use this frame as character reference`);
        // Add as frontal reference if no elements provided
        if (!elements?.length) {
          console.log(`  [fal] tip: edit this frame to swap the character, then pass as element frontalImagePath`);
        }
      }

      // Upload video if local
      if (!videoUrl && opts.videoPath) {
        videoUrl = await uploadFile(opts.videoPath);
      }

      // Resolve elements (character references)
      const resolvedElements = elements?.length
        ? await Promise.all(elements.map(resolveElement))
        : undefined;

      input = {
        prompt,
        video_url: videoUrl,
        keep_audio: keepAudio,
        ...(referenceImageUrls?.length ? { image_urls: referenceImageUrls } : {}),
        ...(resolvedElements?.length ? { elements: resolvedElements } : {}),
      };
      break;
    }

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
