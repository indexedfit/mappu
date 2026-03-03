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
  audioStartSec?: number;    // start offset into the audio file (default 0)
}

export interface RenderResult {
  videoPath: string;
  durationSec: number;
  slides: number;
}

// --- Text wrapping ---

/** Escape text for ffmpeg drawtext filter */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/'/g, "\u2019")
    .replace(/:/g, "\\:")
    .replace(/%/g, "%%")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

/**
 * Word-wrap text to fit within a given pixel width.
 * Estimates ~0.55 chars-per-pixel at the given fontsize for a bold sans-serif.
 * Returns array of lines.
 */
function wrapText(text: string, frameWidth: number, fontSize: number, padding = 80): string[] {
  const usableWidth = frameWidth - padding * 2;
  // Approximate: each char at fontsize N is roughly N*0.55 pixels wide for bold sans
  const charWidth = fontSize * 0.55;
  const maxChars = Math.floor(usableWidth / charWidth);

  if (text.length <= maxChars) return [text];

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (test.length <= maxChars) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  return lines;
}

/**
 * Build ffmpeg drawtext filter chain for wrapped, centered text.
 * Each line is rendered separately, all centered vertically as a block.
 */
function buildTextFilter(
  text: string,
  frameWidth: number,
  frameHeight: number,
  inputLabel: string,
  outputLabel: string,
): string {
  const fontSize = 60;
  const lineHeight = Math.round(fontSize * 1.4);
  const lines = wrapText(text, frameWidth, fontSize);

  if (!lines.length) return `;${inputLabel}null${outputLabel}`;

  // Total text block height
  const blockHeight = lines.length * lineHeight;
  // Start Y so the block is centered vertically
  const startY = Math.round((frameHeight - blockHeight) / 2);

  let prev = inputLabel;
  const filters: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const escaped = escapeDrawtext(lines[i]);
    const y = startY + i * lineHeight;
    const next = i === lines.length - 1 ? outputLabel : `[t${i}]`;

    filters.push(
      `;${prev}drawtext=text='${escaped}'` +
      `:fontsize=${fontSize}` +
      `:fontcolor=white` +
      `:borderw=4:bordercolor=black@0.8` +
      `:shadowcolor=black@0.6:shadowx=2:shadowy=2` +
      `:x=(w-text_w)/2` +
      `:y=${y}` +
      `:font=Montserrat Bold` +
      `${next}`,
    );

    prev = next;
  }

  return filters.join("");
}

/**
 * Render a slideshow video from images + optional text overlays.
 * Uses ffmpeg:
 *   - Scales/pads each image to fit output dimensions
 *   - Word-wraps and centers text overlays
 *   - Optionally mixes in background audio (with start offset)
 */
export async function renderSlideshow(opts: RenderOptions): Promise<RenderResult> {
  const {
    slides,
    outputName,
    width = 1080,
    height = 1920,
    fps = 30,
    audioPath,
    audioStartSec = 0,
  } = opts;

  if (!slides.length) throw new Error("No slides to render");

  const outputDir = join(DATA_DIR, "renders");
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, `${outputName}.mp4`);

  // Calculate per-slide duration
  const perSlide = slides.map((s) => s.durationSec || 3);
  const actualTotal = perSlide.reduce((a, b) => a + b, 0);

  console.log(`  [render] ${slides.length} slides, ${actualTotal}s total, ${width}x${height}`);

  // Step 1: Create individual slide videos with text overlays
  const slideVideos: string[] = [];
  const tempDir = join(DATA_DIR, "renders", `temp_${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const dur = perSlide[i];
    const slidePath = join(tempDir, `slide_${String(i).padStart(3, "0")}.mp4`);

    // Build ffmpeg filter: scale+pad image to fit
    let filter = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[base]`;

    if (slide.text) {
      filter += buildTextFilter(slide.text, width, height, "[base]", "[out]");
    } else {
      filter += `;[base]null[out]`;
    }

    await $`ffmpeg -loop 1 -i ${slide.imagePath} -filter_complex ${filter} -map [out] -t ${dur} -c:v libx264 -pix_fmt yuv420p -r ${fps} -y ${slidePath} -loglevel warning`.quiet();

    slideVideos.push(slidePath);
    console.log(`  [render] slide ${i + 1}/${slides.length} rendered (${dur.toFixed(1)}s)`);
  }

  // Step 2: Concatenate slides
  const concatFile = join(tempDir, "concat.txt");
  const lines = slideVideos.map((p) => `file '${p}'`).join("\n");
  await Bun.write(concatFile, lines);

  // Step 3: If audio, extract the needed segment and mix in
  if (audioPath && existsSync(audioPath)) {
    // Extract audio segment: start at audioStartSec, duration = video length
    const audioSegment = join(tempDir, "audio_segment.mp3");
    await $`ffmpeg -i ${audioPath} -ss ${audioStartSec} -t ${actualTotal} -c:a libmp3lame -q:a 2 -y ${audioSegment} -loglevel warning`.quiet();

    await $`ffmpeg -f concat -safe 0 -i ${concatFile} -i ${audioSegment} -c:v libx264 -c:a aac -pix_fmt yuv420p -shortest -y ${outputPath} -loglevel warning`.quiet();
  } else {
    await $`ffmpeg -f concat -safe 0 -i ${concatFile} -c:v libx264 -pix_fmt yuv420p -y ${outputPath} -loglevel warning`.quiet();
  }

  // Cleanup temp
  await $`rm -rf ${tempDir}`.quiet();

  // Get actual duration
  const probe = await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${outputPath}`.text();
  const finalDuration = parseFloat(probe.trim()) || actualTotal;

  console.log(`  [render] output: ${outputPath} (${finalDuration.toFixed(1)}s)`);

  return {
    videoPath: outputPath,
    durationSec: finalDuration,
    slides: slides.length,
  };
}

if (import.meta.main) {
  await import("../env");
  const input = JSON.parse(process.argv[2] || await Bun.stdin.text());
  const result = await renderSlideshow(input);
  console.log(JSON.stringify(result, null, 2));
}
