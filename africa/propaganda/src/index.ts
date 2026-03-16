import "./env";
import { runPipeline } from "./pipeline";
import { ingest } from "./steps/ingest";
import { scrape } from "./steps/scrape";
import { spotify } from "./steps/spotify";
import { download } from "./steps/download";
import { transcribe } from "./steps/transcribe";
import { analyze } from "./steps/analyze";
import { extractAudio } from "./steps/audio";
import { comments } from "./steps/comments";
import { store } from "./steps/store";
import { generate } from "./steps/generate";
import type { Context, StepDef } from "./types";

const STEPS: StepDef[] = [
  { name: "ingest", run: ingest },
  {
    name: "scrape",
    run: scrape,
    when: (ctx) => ctx.platform === "tiktok" || ctx.platform === "instagram",
  },
  {
    name: "spotify",
    run: spotify,
    when: (ctx) => ctx.platform === "spotify",
  },
  {
    name: "download",
    run: download,
    when: (ctx) => !!ctx.scrape?.mediaUrls?.length,
  },
  {
    name: "extract-audio",
    run: extractAudio,
    when: (ctx) => !!ctx.media?.localPath,
  },
  {
    name: "transcribe",
    run: transcribe,
    when: (ctx) => ctx.scrape?.type === "video" || ctx.scrape?.type === "audio",
  },
  {
    name: "analyze",
    run: analyze,
    when: (ctx) => ctx.scrape?.type === "video",
  },
  {
    name: "comments",
    run: comments,
    when: (ctx) => ctx.platform === "tiktok" || ctx.platform === "instagram",
  },
  { name: "store", run: store },
  {
    name: "generate",
    run: generate,
    when: (ctx) => !!ctx.instruction,
  },
];

async function main() {
  const args = process.argv.slice(2);

  if (!args.length) {
    console.log("Usage: bun run src/index.ts <url> [instruction]");
    console.log("");
    console.log("Examples:");
    console.log('  bun run src/index.ts "https://tiktok.com/@user/video/123"');
    console.log('  bun run src/index.ts "https://instagram.com/reel/abc" "recreate this with cats"');
    console.log('  bun run src/index.ts "https://open.spotify.com/track/abc"');
    process.exit(1);
  }

  const [url, ...rest] = args;
  const instruction = rest.length ? rest.join(" ") : undefined;

  const initial: Context = {
    url,
    instruction,
    platform: "unknown",
  };

  console.log(`\npipeline: ${url}`);
  const result = await runPipeline(STEPS, initial);

  // Output structured result (readable by claude -p or other tools)
  const output = {
    contentId: result.contentId,
    platform: result.platform,
    type: result.scrape?.type,
    title: result.scrape?.title,
    author: result.scrape?.author,
    transcript: result.transcription?.text,
    frameCount: result.frames?.length || 0,
    summary: result.summary,
    generation: result.generation
      ? { id: result.generation.id, status: result.generation.status }
      : null,
  };

  console.log("\n" + JSON.stringify(output, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error("\nPipeline error:", err.message || err);
  process.exit(1);
});
