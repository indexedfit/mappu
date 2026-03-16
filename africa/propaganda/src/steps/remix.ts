import { $ } from "bun";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import { DATA_DIR } from "../env";

// --- Text wrapping (shared logic — must ALWAYS be used for any text overlay) ---

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
 * CRITICAL: always use this before any drawtext — never render text without wrapping.
 */
function wrapText(text: string, frameWidth: number, fontSize: number, padding = 60): string[] {
  const usableWidth = frameWidth - padding * 2;
  const charWidth = fontSize * 0.55; // approximate for bold sans-serif
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
 * Build a complete ffmpeg -filter_complex string that:
 *   1. Takes input video as-is (no scaling)
 *   2. Overlays word-wrapped, centered text
 *
 * Returns the full filter string and the output label.
 */
function buildVideoTextFilter(
  text: string,
  videoWidth: number,
  videoHeight: number,
): string {
  const fontSize = Math.min(56, Math.round(videoWidth / 14)); // scale font to video width
  const lineHeight = Math.round(fontSize * 1.45);
  const lines = wrapText(text, videoWidth, fontSize);

  if (!lines.length) return "[0:v]null[vout]";

  const blockHeight = lines.length * lineHeight;
  const startY = Math.round((videoHeight - blockHeight) / 2);

  const parts: string[] = [];
  let prev = "[0:v]";

  for (let i = 0; i < lines.length; i++) {
    const escaped = escapeDrawtext(lines[i]);
    const y = startY + i * lineHeight;
    const next = i === lines.length - 1 ? "[vout]" : `[t${i}]`;

    parts.push(
      `${prev}drawtext=text='${escaped}'` +
      `:fontsize=${fontSize}` +
      `:fontcolor=white` +
      `:borderw=4:bordercolor=black@0.8` +
      `:shadowcolor=black@0.5:shadowx=2:shadowy=2` +
      `:x=(w-text_w)/2` +
      `:y=${y}` +
      `:font=Montserrat Bold` +
      `${next}`,
    );

    prev = next;
  }

  return parts.join(";");
}

export interface RemixOptions {
  videoPath: string;         // source video
  audioPath?: string;        // replacement audio (if omitted, keeps original)
  audioStartSec?: number;    // where to start in the audio file
  text?: string;             // text overlay (auto-wrapped, centered)
  outputName: string;        // output filename without extension
}

export interface RemixResult {
  videoPath: string;
  durationSec: number;
}

/**
 * Remix a video: swap audio and/or add text overlay.
 * Text is always word-wrapped to fit the video width — no overflow possible.
 */
export async function remixVideo(opts: RemixOptions): Promise<RemixResult> {
  const { videoPath, audioPath, audioStartSec = 0, text, outputName } = opts;

  const outputDir = join(DATA_DIR, "renders");
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, `${outputName}.mp4`);

  // Get video dimensions and duration
  const probeJson = await $`ffprobe -v error -show_entries stream=width,height -show_entries format=duration -of json ${videoPath}`.json();
  const videoStream = probeJson.streams?.find((s: any) => s.width);
  const w = videoStream?.width || 1080;
  const h = videoStream?.height || 1920;
  const duration = parseFloat(probeJson.format?.duration || "30");

  console.log(`  [remix] video: ${w}x${h}, ${duration.toFixed(1)}s`);
  if (text) console.log(`  [remix] text: "${text}"`);
  if (audioPath) console.log(`  [remix] audio: ${audioPath} (from ${audioStartSec}s)`);

  // Build ffmpeg command
  const args: string[] = ["-i", videoPath];

  // Add audio input if swapping
  if (audioPath && existsSync(audioPath)) {
    args.push("-ss", String(audioStartSec), "-i", audioPath);
  }

  // Add text filter if needed
  if (text) {
    const filter = buildVideoTextFilter(text, w, h);
    args.push("-filter_complex", filter, "-map", "[vout]");
  } else {
    args.push("-map", "0:v");
  }

  // Map audio
  if (audioPath && existsSync(audioPath)) {
    args.push("-map", "1:a");
  } else {
    args.push("-map", "0:a?"); // keep original audio if exists
  }

  args.push(
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-t", String(duration), // match original video length
    "-shortest",
    "-y", outputPath,
    "-loglevel", "warning",
  );

  await $`ffmpeg ${args}`.quiet();

  // Verify
  const finalProbe = await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${outputPath}`.text();
  const finalDuration = parseFloat(finalProbe.trim()) || duration;

  console.log(`  [remix] output: ${outputPath} (${finalDuration.toFixed(1)}s)`);

  return { videoPath: outputPath, durationSec: finalDuration };
}

if (import.meta.main) {
  await import("../env");
  const input = JSON.parse(process.argv[2] || await Bun.stdin.text());
  const result = await remixVideo(input);
  console.log(JSON.stringify(result, null, 2));
}
