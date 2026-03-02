import { mkdirSync } from "fs";
import { join } from "path";
import type { Step } from "../types";
import { DATA_DIR } from "../env";

export const download: Step = async (ctx) => {
  if (!ctx.scrape?.mediaUrls.length) {
    console.log("    no media urls to download");
    return ctx;
  }

  const mediaDir = join(DATA_DIR, "media");
  mkdirSync(mediaDir, { recursive: true });

  const url = ctx.scrape.mediaUrls[0];
  const ext = ctx.scrape.type === "video" ? "mp4"
    : ctx.scrape.type === "audio" ? "mp3"
    : "jpg";
  const filename = `${Date.now()}-${ctx.platform}.${ext}`;
  const localPath = join(mediaDir, filename);

  console.log(`    downloading: ${url.slice(0, 80)}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);

  const buf = await res.arrayBuffer();
  await Bun.write(localPath, buf);

  ctx.media = {
    localPath,
    mimeType: res.headers.get("content-type") || `video/${ext}`,
    sizeBytes: buf.byteLength,
  };

  console.log(`    saved: ${localPath} (${(buf.byteLength / 1024 / 1024).toFixed(1)}MB)`);
  return ctx;
};

if (import.meta.main) {
  await import("../env");
  const input = JSON.parse(process.argv[2] || await Bun.stdin.text());
  const result = await download(input);
  console.log(JSON.stringify(result, null, 2));
}
