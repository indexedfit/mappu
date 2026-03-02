import OpenAI, { toFile } from "openai";
import { readFileSync } from "fs";
import { basename } from "path";
import type { Step } from "../types";
import { requireEnv } from "../env";

// Groq's Whisper — same API shape as OpenAI, way faster, cheaper
const groq = () =>
  new OpenAI({
    apiKey: requireEnv("GROQ_API_KEY"),
    baseURL: "https://api.groq.com/openai/v1",
  });

export const transcribe: Step = async (ctx) => {
  if (!ctx.media?.localPath) {
    console.log("    no media to transcribe");
    return ctx;
  }

  const client = groq();

  console.log(`    transcribing via groq: ${ctx.media.localPath}`);

  const buf = readFileSync(ctx.media.localPath);
  const file = await toFile(buf, basename(ctx.media.localPath));
  const response = await client.audio.transcriptions.create({
    model: "whisper-large-v3-turbo",
    file,
    response_format: "verbose_json",
  });

  ctx.transcription = {
    text: response.text,
    language: response.language,
    segments: (response as any).segments?.map((s: any) => ({
      start: s.start,
      end: s.end,
      text: s.text,
    })),
  };

  console.log(`    transcribed: ${ctx.transcription.text.slice(0, 100)}...`);
  return ctx;
};

if (import.meta.main) {
  await import("../env");
  const input = JSON.parse(process.argv[2] || await Bun.stdin.text());
  const result = await transcribe(input);
  console.log(JSON.stringify(result, null, 2));
}
