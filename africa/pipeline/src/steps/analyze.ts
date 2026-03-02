import OpenAI from "openai";
import { $ } from "bun";
import { mkdirSync } from "fs";
import { join } from "path";
import type { Step } from "../types";
import { DATA_DIR, requireEnv } from "../env";

const FRAME_INTERVAL_SEC = 3;

// Groq vision via OpenAI-compatible API
const groq = () =>
  new OpenAI({
    apiKey: requireEnv("GROQ_API_KEY"),
    baseURL: "https://api.groq.com/openai/v1",
  });

async function extractFrames(videoPath: string): Promise<string[]> {
  const framesDir = join(DATA_DIR, "frames", String(Date.now()));
  mkdirSync(framesDir, { recursive: true });

  await $`ffmpeg -i ${videoPath} -vf fps=1/${FRAME_INTERVAL_SEC} -q:v 2 ${framesDir}/frame_%04d.jpg -loglevel quiet`.quiet();

  const glob = new Bun.Glob("*.jpg");
  const paths: string[] = [];
  for await (const path of glob.scan(framesDir)) {
    paths.push(join(framesDir, path));
  }
  return paths.sort();
}

async function analyzeFrame(
  client: OpenAI,
  framePath: string,
  timestampSec: number,
): Promise<{ timestampSec: number; path: string; description: string; tags: string[] }> {
  const base64 = Buffer.from(await Bun.file(framePath).arrayBuffer()).toString("base64");

  const res = await client.chat.completions.create({
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: 'Describe this video frame concisely. What\'s shown, any text visible, the setting, and mood. Also provide 3-5 tags. Reply as JSON only: {"description": "...", "tags": ["..."]}',
          },
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${base64}` },
          },
        ],
      },
    ],
  });

  const text = res.choices[0]?.message?.content || "{}";
  try {
    // Extract JSON from response (model might wrap it in markdown)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] || text);
    return { timestampSec, path: framePath, description: parsed.description || text, tags: parsed.tags || [] };
  } catch {
    return { timestampSec, path: framePath, description: text, tags: [] };
  }
}

export const analyze: Step = async (ctx) => {
  if (!ctx.media?.localPath || ctx.scrape?.type !== "video") {
    console.log("    skipping frame analysis (not a video)");
    return ctx;
  }

  const client = groq();

  console.log("    extracting frames...");
  const framePaths = await extractFrames(ctx.media.localPath);
  console.log(`    ${framePaths.length} frames, analyzing via groq vision...`);

  // Groq is fast — can do more parallelism, but respect rate limits
  ctx.frames = [];
  for (let i = 0; i < framePaths.length; i += 3) {
    const batch = framePaths.slice(i, i + 3);
    const results = await Promise.all(
      batch.map((path, j) =>
        analyzeFrame(client, path, (i + j) * FRAME_INTERVAL_SEC),
      ),
    );
    ctx.frames.push(...results);
  }

  // Summary from all gathered data
  const parts: string[] = [];
  if (ctx.scrape?.title) parts.push(`Title: ${ctx.scrape.title}`);
  if (ctx.transcription?.text) parts.push(`Transcript: ${ctx.transcription.text}`);
  if (ctx.frames.length) {
    parts.push(`Frames: ${ctx.frames.map((f) => f.description).join(" | ")}`);
  }
  if (ctx.scrape?.hashtags?.length) {
    parts.push(`Tags: ${ctx.scrape.hashtags.join(", ")}`);
  }
  ctx.summary = parts.join("\n\n");

  console.log(`    summary: ${ctx.summary.slice(0, 120)}...`);
  return ctx;
};

if (import.meta.main) {
  await import("../env");
  const input = JSON.parse(process.argv[2] || await Bun.stdin.text());
  const result = await analyze(input);
  console.log(JSON.stringify(result, null, 2));
}
