import { $ } from "bun";
import { join, basename } from "path";
import { mkdirSync } from "fs";
import type { Step } from "../types";
import { DATA_DIR } from "../env";

export const extractAudio: Step = async (ctx) => {
  if (!ctx.media?.localPath) {
    console.log("    no media to extract audio from");
    return ctx;
  }

  const audioDir = join(DATA_DIR, "audio");
  mkdirSync(audioDir, { recursive: true });

  const name = basename(ctx.media.localPath, ".mp4");
  const mp3Path = join(audioDir, `${name}.mp3`);

  console.log(`    extracting audio: ${ctx.media.localPath}`);
  await $`ffmpeg -i ${ctx.media.localPath} -vn -acodec libmp3lame -q:a 2 ${mp3Path} -y -loglevel quiet`.quiet();

  const file = Bun.file(mp3Path);
  if (await file.exists()) {
    const size = file.size;
    ctx.audioPath = mp3Path;
    console.log(`    saved: ${mp3Path} (${(size / 1024).toFixed(0)}KB)`);
  } else {
    console.log("    ffmpeg produced no output");
  }

  return ctx;
};

if (import.meta.main) {
  await import("../env");
  const input = JSON.parse(process.argv[2] || await Bun.stdin.text());
  const result = await extractAudio(input);
  console.log(JSON.stringify(result, null, 2));
}
