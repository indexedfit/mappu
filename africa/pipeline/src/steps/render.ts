import { $ } from "bun";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import { DATA_DIR } from "../env";

export interface SlideInput {
  imagePath: string;
  text?: string;           // text overlay for this slide
  durationSec?: number;    // how long this slide shows (default 3)
}

export interface RenderOptions {
  slides: SlideInput[];
  outputName: string;       // filename without extension
  totalDurationSec?: number; // if set, auto-calculates per-slide duration
  width?: number;            // output width (default 1080)
  height?: number;           // output height (default 1920). Common: 1920=9:16, 1350=4:5, 1080=1:1
  fps?: number;              // default 30
  audioPath?: string;        // optional background audio
  fontPath?: string;         // optional font file for text overlays
}

export interface RenderResult {
  videoPath: string;
  durationSec: number;
  slides: number;
}

/**
 * Render a slideshow video from images + optional text overlays.
 * Uses ffmpeg:
 *   - Scales/pads each image to fit output dimensions
 *   - Adds crossfade transitions between slides
 *   - Burns text overlays at the bottom
 *   - Optionally mixes in background audio
 */
export async function renderSlideshow(opts: RenderOptions): Promise<RenderResult> {
  const {
    slides,
    outputName,
    width = 1080,
    height = 1920,
    fps = 30,
    audioPath,
  } = opts;

  if (!slides.length) throw new Error("No slides to render");

  const outputDir = join(DATA_DIR, "renders");
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, `${outputName}.mp4`);

  // Calculate per-slide duration
  const totalDuration = opts.totalDurationSec || slides.length * 3;
  const perSlide = slides.map((s) => s.durationSec || totalDuration / slides.length);
  const transitionDur = 0.5; // crossfade duration between slides

  console.log(`  [render] ${slides.length} slides, ${totalDuration}s total, ${width}x${height}`);

  // Strategy: create a concat file with each image as a "video" of N seconds,
  // then apply crossfade transitions and text overlays.
  // For simplicity and reliability, we use the concat demuxer approach.

  // Step 1: Create individual slide videos with text overlays
  const slideVideos: string[] = [];
  const tempDir = join(DATA_DIR, "renders", `temp_${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const dur = perSlide[i];
    const slidePath = join(tempDir, `slide_${String(i).padStart(3, "0")}.mp4`);

    // Build ffmpeg filter: scale+pad image to fit, optionally add text
    let filter = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[base]`;

    if (slide.text) {
      // Escape special chars for ffmpeg drawtext
      const escaped = slide.text
        .replace(/\\/g, "\\\\\\\\")
        .replace(/'/g, "\u2019")
        .replace(/:/g, "\\:")
        .replace(/%/g, "%%");

      // TikTok-style: bold sans-serif, centered, white with black shadow
      // Montserrat Bold is commonly available and closest to TikTok's Classic font
      // Text centered both horizontally and vertically
      filter += `;[base]drawtext=text='${escaped}':fontsize=64:fontcolor=white:borderw=4:bordercolor=black@0.8:shadowcolor=black@0.6:shadowx=3:shadowy=3:x=(w-text_w)/2:y=(h-text_h)/2:font=Montserrat Bold[out]`;
    } else {
      filter += `;[base]null[out]`;
    }

    await $`ffmpeg -loop 1 -i ${slide.imagePath} -filter_complex ${filter} -map [out] -t ${dur} -c:v libx264 -pix_fmt yuv420p -r ${fps} -y ${slidePath} -loglevel warning`.quiet();

    slideVideos.push(slidePath);
    console.log(`  [render] slide ${i + 1}/${slides.length} rendered (${dur.toFixed(1)}s)`);
  }

  // Step 2: If only one slide, just copy it
  if (slideVideos.length === 1) {
    if (audioPath && existsSync(audioPath)) {
      await $`ffmpeg -i ${slideVideos[0]} -i ${audioPath} -c:v copy -c:a aac -shortest -y ${outputPath} -loglevel warning`.quiet();
    } else {
      await $`cp ${slideVideos[0]} ${outputPath}`.quiet();
    }
  } else {
    // Step 3: Concatenate with crossfade transitions using xfade filter
    // For many slides, use concat demuxer (simpler, more reliable)
    const concatFile = join(tempDir, "concat.txt");
    const lines = slideVideos.map((p) => `file '${p}'`).join("\n");
    await Bun.write(concatFile, lines);

    if (audioPath && existsSync(audioPath)) {
      await $`ffmpeg -f concat -safe 0 -i ${concatFile} -i ${audioPath} -c:v libx264 -c:a aac -pix_fmt yuv420p -shortest -y ${outputPath} -loglevel warning`.quiet();
    } else {
      await $`ffmpeg -f concat -safe 0 -i ${concatFile} -c:v libx264 -pix_fmt yuv420p -y ${outputPath} -loglevel warning`.quiet();
    }
  }

  // Cleanup temp
  await $`rm -rf ${tempDir}`.quiet();

  // Get actual duration
  const probe = await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${outputPath}`.text();
  const actualDuration = parseFloat(probe.trim()) || totalDuration;

  console.log(`  [render] output: ${outputPath} (${actualDuration.toFixed(1)}s)`);

  return {
    videoPath: outputPath,
    durationSec: actualDuration,
    slides: slides.length,
  };
}

if (import.meta.main) {
  await import("../env");
  const input = JSON.parse(process.argv[2] || await Bun.stdin.text());
  const result = await renderSlideshow(input);
  console.log(JSON.stringify(result, null, 2));
}
