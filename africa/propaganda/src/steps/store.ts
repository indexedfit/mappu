import { db } from "../db/client";
import type { Step } from "../types";

export const store: Step = async (ctx) => {
  const result = await db`
    INSERT INTO content (
      url, platform, content_type, title, description,
      author, author_url,
      likes, views, comments,
      hashtags, music_title, music_author,
      media_urls, thumbnail_url,
      transcript, transcript_language,
      frames, summary,
      audio_path, top_comments,
      instruction, raw_scrape
    ) VALUES (
      ${ctx.url},
      ${ctx.platform},
      ${ctx.scrape?.type || null},
      ${ctx.scrape?.title || null},
      ${ctx.scrape?.description || null},
      ${ctx.scrape?.author || null},
      ${ctx.scrape?.authorUrl || null},
      ${ctx.scrape?.likes ?? null},
      ${ctx.scrape?.views ?? null},
      ${ctx.scrape?.comments ?? null},
      ${ctx.scrape?.hashtags || null},
      ${ctx.scrape?.musicTitle || null},
      ${ctx.scrape?.musicAuthor || null},
      ${ctx.scrape?.mediaUrls || null},
      ${ctx.scrape?.thumbnailUrl || null},
      ${ctx.transcription?.text || null},
      ${ctx.transcription?.language || null},
      ${JSON.stringify(ctx.frames || null)},
      ${ctx.summary || null},
      ${ctx.audioPath || null},
      ${JSON.stringify(ctx.topComments || null)},
      ${ctx.instruction || null},
      ${JSON.stringify(ctx.scrape?.raw || null)}
    )
    RETURNING id
  `;

  ctx.contentId = result[0].id;
  console.log(`    stored: content #${ctx.contentId}`);
  return ctx;
};

if (import.meta.main) {
  await import("../env");
  const input = JSON.parse(process.argv[2] || await Bun.stdin.text());
  const result = await store(input);
  console.log(JSON.stringify(result, null, 2));
}
