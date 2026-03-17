import { mkdirSync } from "fs";
import { join } from "path";
import { $ } from "bun";
import type { Step } from "../types";
import { DATA_DIR } from "../env";

/** Use yt-dlp for Instagram/TikTok videos, fetch CDN URLs for images/carousels. */
export const download: Step = async (ctx) => {
  const mediaDir = join(DATA_DIR, "media");
  mkdirSync(mediaDir, { recursive: true });

  const filename = `${Date.now()}-${ctx.platform}`;
  const outputTemplate = join(mediaDir, `${filename}.%(ext)s`);

  const isCarousel = ctx.scrape?.type === "carousel";
  const isImage = ctx.scrape?.type === "image";

  // yt-dlp only for video content (reels, tiktoks) — not images or carousels
  if (!isCarousel && !isImage && (ctx.platform === "instagram" || ctx.platform === "tiktok")) {
    console.log(`    yt-dlp: ${ctx.url}`);
    const result = await $`yt-dlp -o ${outputTemplate} --no-playlist --restrict-filenames ${ctx.url}`.quiet().nothrow();

    if (result.exitCode !== 0) {
      console.log(`    yt-dlp failed (exit ${result.exitCode}), stderr: ${result.stderr.toString().slice(0, 200)}`);
      // Fall through to CDN fetch if we have mediaUrls from scrape
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

  // Fetch from CDN URLs — carousel gets ALL, others get first
  if (!ctx.scrape?.mediaUrls.length) {
    console.log("    no media urls to download");
    return ctx;
  }

  const urls = isCarousel ? ctx.scrape.mediaUrls : [ctx.scrape.mediaUrls[0]];
  const downloaded: { localPath: string; mimeType: string; sizeBytes: number }[] = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    // Detect extension from URL or content type
    const urlExt = url.match(/\.(\w{3,4})(?:\?|$)/)?.[1];
    const ext = urlExt || (ctx.scrape.type === "video" ? "mp4"
      : ctx.scrape.type === "audio" ? "mp3"
      : "jpg");
    const suffix = urls.length > 1 ? `-${i + 1}` : "";
    const localPath = join(mediaDir, `${filename}${suffix}.${ext}`);

    console.log(`    fetching [${i + 1}/${urls.length}]: ${url.slice(0, 80)}...`);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.log(`    fetch failed: ${res.status}`);
        continue;
      }

      const buf = await res.arrayBuffer();
      await Bun.write(localPath, buf);

      const contentType = res.headers.get("content-type");
      const mimeType = contentType?.startsWith("image/") || contentType?.startsWith("video/")
        ? contentType
        : ext === "mp4" ? "video/mp4"
        : ext === "webm" ? "video/webm"
        : ext === "mp3" ? "audio/mpeg"
        : `image/${ext === "jpg" ? "jpeg" : ext}`;

      downloaded.push({ localPath, mimeType, sizeBytes: buf.byteLength });
      console.log(`    saved: ${localPath} (${(buf.byteLength / 1024 / 1024).toFixed(1)}MB)`);
    } catch (err: any) {
      console.log(`    download error: ${err.message}`);
    }
  }

  if (downloaded.length > 0) {
    // First file goes to ctx.media for backward compat
    ctx.media = downloaded[0];

    // All files go to ctx.mediaFiles for carousel-aware steps
    if (downloaded.length > 1) {
      ctx.mediaFiles = downloaded;
      console.log(`    carousel: ${downloaded.length} files downloaded`);
    }
  }

  return ctx;
};

if (import.meta.main) {
  await import("../env");
  const input = JSON.parse(process.argv[2] || await Bun.stdin.text());
  const result = await download(input);
  console.log(JSON.stringify(result, null, 2));
}
