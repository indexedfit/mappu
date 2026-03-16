import { mkdirSync } from "fs";
import { join } from "path";
import { DATA_DIR } from "../env";

// --- Types ---

export interface SubtitleOptions {
  transcriptPath?: string;   // path to Whisper verbose_json transcript
  videoPath: string;         // video to burn subtitles onto
  srtPath?: string;          // pre-made SRT file (skip generation)
  maxWords?: number;         // max words per subtitle line (default 6)
  outputName?: string;
  style?: "default" | "bold" | "outline";  // subtitle style preset
}

export interface SubtitleResult {
  srtPath: string;
  outputPath: string;
  durationSec: number;
}

// --- SRT Generation from Whisper transcript ---

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

export function generateSrt(words: WhisperWord[], maxWords = 6): string {
  const lines: string[] = [];
  let idx = 1;
  let i = 0;

  while (i < words.length) {
    const chunk: WhisperWord[] = [];
    const start = words[i].start;
    let end = words[i].end;

    // Group words into chunks
    while (chunk.length < maxWords && i < words.length) {
      chunk.push(words[i]);
      end = words[i].end;
      i++;
    }

    const text = chunk.map(w => w.word.trim()).join(" ").trim();
    if (!text) continue;

    lines.push(`${idx}`);
    lines.push(`${formatTime(start)} --> ${formatTime(end)}`);
    lines.push(text);
    lines.push("");
    idx++;
  }

  return lines.join("\n");
}

// --- Burn subtitles onto video ---

export async function burnSubtitles(opts: SubtitleOptions): Promise<SubtitleResult> {
  const {
    transcriptPath,
    videoPath,
    maxWords = 6,
    outputName = `subtitled_${Date.now()}`,
    style = "default",
  } = opts;

  const { $ } = await import("bun");
  const outputDir = join(DATA_DIR, "renders");
  mkdirSync(outputDir, { recursive: true });

  // Generate or use existing SRT
  let srtPath = opts.srtPath || "";

  if (!srtPath && transcriptPath) {
    const transcript = JSON.parse(await Bun.file(transcriptPath).text());
    const words: WhisperWord[] = transcript.words || [];

    if (!words.length) {
      // Fall back to segments if no word-level timestamps
      const segments = transcript.segments || [];
      const srtLines: string[] = [];
      let idx = 1;
      for (const seg of segments) {
        srtLines.push(`${idx}`);
        srtLines.push(`${formatTime(seg.start)} --> ${formatTime(seg.end)}`);
        srtLines.push(seg.text.trim());
        srtLines.push("");
        idx++;
      }
      const srt = srtLines.join("\n");
      srtPath = join(DATA_DIR, "audio", `${outputName}.srt`);
      await Bun.write(srtPath, srt);
    } else {
      const srt = generateSrt(words, maxWords);
      srtPath = join(DATA_DIR, "audio", `${outputName}.srt`);
      await Bun.write(srtPath, srt);
    }

    console.log(`  [subtitle] generated SRT: ${srtPath}`);
  }

  if (!srtPath) throw new Error("Need transcriptPath or srtPath");

  // Style presets for ASS subtitle filter
  const styles: Record<string, string> = {
    default: "FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Shadow=1,Alignment=2,MarginV=40",
    bold: "FontName=Arial,FontSize=22,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=3,Shadow=2,Alignment=2,MarginV=50",
    outline: "FontName=Arial,FontSize=20,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=4,Shadow=0,Alignment=2,MarginV=40",
  };

  const forceStyle = styles[style] || styles.default;
  const outputPath = join(outputDir, `${outputName}.mp4`);

  // Get duration for -t cap
  const probe = await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${videoPath}`.text();
  const duration = parseFloat(probe.trim());

  // Burn subtitles using ffmpeg subtitles filter
  // ffmpeg subtitles filter needs colons escaped and the whole -vf as a single string
  const escapedSrt = srtPath.replace(/\\/g, "/").replace(/:/g, "\\\\:");
  const vf = `subtitles=${escapedSrt}:force_style='${forceStyle}'`;
  console.log(`  [subtitle] burning subtitles onto video...`);

  // Use Bun.spawn directly to avoid shell escaping issues
  const proc = Bun.spawn(
    ["ffmpeg", "-y", "-i", videoPath, "-vf", vf, "-c:v", "libx264", "-crf", "23", "-c:a", "copy", "-t", String(duration), "-movflags", "+faststart", outputPath],
    { stdout: "pipe", stderr: "pipe" }
  );
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`ffmpeg subtitle burn failed (exit ${exitCode}): ${stderr.slice(-500)}`);
  }

  // Probe output
  const outProbe = await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${outputPath}`.text();
  const durationSec = parseFloat(outProbe.trim()) || duration;

  console.log(`  [subtitle] saved: ${outputPath} (${durationSec.toFixed(1)}s)`);
  return { srtPath, outputPath, durationSec };
}

// --- CLI ---

if (import.meta.main) {
  await import("../env");
  const input = JSON.parse(process.argv[2] || await Bun.stdin.text());
  const result = await burnSubtitles(input);
  console.log(JSON.stringify(result, null, 2));
}
