import { db } from "../db/client";
import type { Step } from "../types";

// Stub — queues generation. When ready, this calls nano-banana-pro / midjourney / etc.

export const generate: Step = async (ctx) => {
  if (!ctx.instruction) return ctx;

  const prompt = [
    ctx.instruction,
    ctx.summary ? `\nContext:\n${ctx.summary}` : "",
  ].join("");

  const result = await db`
    INSERT INTO generations (
      content_id, prompt, status
    ) VALUES (
      ${ctx.contentId || null},
      ${prompt},
      'pending'
    )
    RETURNING id
  `;

  ctx.generation = {
    id: result[0].id,
    prompt,
    status: "pending",
  };

  console.log(`    queued generation #${ctx.generation.id}`);
  return ctx;
};

if (import.meta.main) {
  await import("../env");
  const input = JSON.parse(process.argv[2] || await Bun.stdin.text());
  const result = await generate(input);
  console.log(JSON.stringify(result, null, 2));
}
