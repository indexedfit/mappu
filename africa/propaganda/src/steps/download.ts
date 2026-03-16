import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import { $ } from "bun";
import type { Step } from "../types";
import { DATA_DIR } from "../env";

/** Use yt-dlp for Instagram/TikTok, fall back to fetch for direct CDN URLs. */
export const download: Step = async (ctx) => {
  const mediaDir = join(DATA_DIR, "media");
  mkdirSync(mediaDir, { recursive: true });

  const filename = `${Date.now()}-${ctx.platform}`;
  const outputTemplate = join(mediaDir, `${filename}.%(ext)s`);

  // Instagram/TikTok: use yt-dlp directly from the source URL
  if (ctx.platform === "instagram" || ctx.platform === "tiktok") {
    console.log(`    yt-dlp: ${ctx.url}`);
    const result = await $`yt-dlp -o ${outputTemplate} --no-playlist --restrict-filenames ${ctx.url}`.quiet().nothrow();

    if (result.exitCode !== 0) {
      console.log(`    yt-dlp failed (exit ${result.exitCode}), stderr: ${result.stderr.toString().slice(0, 200)}`);
      // Fall through to fetch if we have mediaUrls from scrape
      if (!ctx.scrape?.mediaUrls.length) return ctx;
    } else {
      // yt-dlp succeeded — find the output file
      const { stdout } = await $`ls -t ${mediaDir}/${filename}.*`.quiet().nothrow();
      const files = stdout.toString().trim().split("\n").filter(Boolean);
      if (files.length > 0) {
        const localPath = files[0];
        const stat = Bun.file(localPath);
        ctx.media = {
          localPath,
          mimeType: localPath.endsWith(".mp4") ? "video/mp4" : localPath.endsWith(".webm") ? "video/webm" : "video/mp4",
          sizeBytes: stat.size,
        };
        console.log(`    saved: ${localPath} (${(stat.size / 1024 / 1024).toFixed(1)}MB)`);
        return ctx;
      }
    }
  }

  // Fallback: fetch from CDN URLs (for other platforms or if yt-dlp failed)
  if (!ctx.scrape?.mediaUrls.length) {
    console.log("    no media urls to download");
    return ctx;
  }

  const url = ctx.scrape.mediaUrls[0];
  const ext = ctx.scrape.type === "video" ? "mp4"
    : ctx.scrape.type === "audio" ? "mp3"
    : "jpg";
  const localPath = join(mediaDir, `${filename}.${ext}`);

  console.log(`    fetching: ${url.slice(0, 80)}...`);
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
