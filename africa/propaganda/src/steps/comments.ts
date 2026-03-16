import { ApifyClient } from "apify-client";
import type { Step } from "../types";
import { requireEnv } from "../env";

const MAX_COMMENTS = 10;

export const comments: Step = async (ctx) => {
  const token = requireEnv("APIFY_TOKEN");
  const client = new ApifyClient({ token });

  if (ctx.platform === "tiktok") {
    return await tiktokComments(ctx, client);
  }

  if (ctx.platform === "instagram") {
    return igComments(ctx);
  }

  return ctx;
};

async function tiktokComments(ctx: any, client: ApifyClient) {
  console.log("    fetching tiktok comments...");

  const run = await client.actor("clockworks/tiktok-comments-scraper").call({
    postURLs: [ctx.url],
    commentsPerPost: MAX_COMMENTS,
    maxRepliesPerComment: 0,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  ctx.topComments = items.slice(0, MAX_COMMENTS).map((c: any) => ({
    text: c.text,
    author: c.uniqueId || c.nickname,
    likes: c.diggCount ?? c.likes ?? 0,
    replies: c.replyCommentTotal ?? 0,
  }));

  console.log(`    got ${ctx.topComments.length} comments`);
  return ctx;
}

function igComments(ctx: any) {
  // IG scraper already returns latest_comments in raw_scrape
  const raw = ctx.scrape?.raw;
  if (!raw?.latest_comments?.length) {
    console.log("    no IG comments in scrape data");
    return ctx;
  }

  ctx.topComments = raw.latest_comments.slice(0, MAX_COMMENTS).map((c: any) => ({
    text: c.comments || c.text,
    author: c.user_commenting || c.username,
    likes: c.likes ?? 0,
    replies: 0,
  }));

  console.log(`    got ${ctx.topComments.length} comments (from scrape)`);
  return ctx;
}

if (import.meta.main) {
  await import("../env");
  const input = JSON.parse(process.argv[2] || await Bun.stdin.text());
  const result = await comments(input);
  console.log(JSON.stringify(result, null, 2));
}
