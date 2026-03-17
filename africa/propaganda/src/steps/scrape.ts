import { ApifyClient } from "apify-client";
import type { Context, Step } from "../types";
import { requireEnv } from "../env";

// Actor IDs — tested and working
const APIFY_ACTORS: Record<string, string> = {
  tiktok: "clockworks/free-tiktok-scraper",
  instagram: "apify/instagram-scraper",  // returns childPosts[] for carousels
};

export const scrape: Step = async (ctx) => {
  // Spotify uses its own API, images don't need scraping
  if (ctx.platform === "spotify" || ctx.platform === "image") {
    return ctx;
  }

  const token = requireEnv("APIFY_TOKEN");
  const actorId = APIFY_ACTORS[ctx.platform];
  if (!actorId) {
    console.log(`    no scraper for platform: ${ctx.platform}`);
    return ctx;
  }

  const client = new ApifyClient({ token });

  let input: Record<string, unknown>;

  switch (ctx.platform) {
    case "tiktok":
      input = {
        postURLs: [ctx.url],
        resultsPerPage: 1,
        shouldDownloadVideos: true,
      };
      break;
    case "instagram":
      input = {
        directUrls: [ctx.url],
        resultsLimit: 1,
        resultsType: "posts",
      };
      break;
    default:
      return ctx;
  }

  console.log(`    actor: ${actorId}`);
  const run = await client.actor(actorId).call(input);
  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  if (!items.length) {
    console.log("    no results from apify");
    return ctx;
  }

  const item = items[0] as Record<string, any>;

  // Detect content type
  const isVideo = !!(item.videoUrl || item.videoMeta || item.videos?.length || item.content_type === "Reel" || item.type === "Video");
  const isCarousel = !!(item.type === "Sidecar" || (item.childPosts?.length && item.childPosts.length > 1));

  // Extract media URLs — carousel gets ALL slides
  let mediaUrls: string[];

  if (isCarousel && item.childPosts?.length) {
    // Carousel/sidecar: extract every child's media URL
    mediaUrls = [];
    for (const child of item.childPosts as Record<string, any>[]) {
      if (child.type === "Video" && child.videoUrl) {
        mediaUrls.push(child.videoUrl);
      } else if (child.displayUrl) {
        mediaUrls.push(child.displayUrl);
      }
    }
    console.log(`    carousel: ${mediaUrls.length} slides from childPosts`);

    // Fallback: if childPosts didn't have URLs, try images[]
    if (!mediaUrls.length && item.images?.length) {
      mediaUrls = [...item.images];
      console.log(`    carousel: ${mediaUrls.length} slides from images[]`);
    }
  } else {
    // Single post — video or image
    mediaUrls = [
      ...(item.mediaUrls || []),           // TikTok: Apify stores video here
      ...(item.videos || []),              // IG: video CDN URLs
      item.videoUrl,
      item.videoPlayUrl,
      ...(item.photos || []),
      ...(item.images || []),
      ...(item.displayUrl ? [item.displayUrl] : []),
    ].filter(Boolean);
  }

  const contentType = isVideo ? "video"
    : isCarousel ? "carousel"
    : (item.photos?.length || item.displayUrl || item.images?.length) ? "image"
    : "video";

  ctx.scrape = {
    type: contentType,
    title: item.text || item.caption || item.title || item.description?.slice(0, 100),
    description: item.description || item.text || item.caption,
    author: item.authorMeta?.name || item.user_posted || item.ownerUsername,
    authorUrl: item.authorMeta?.profileUrl || item.profile_url,
    likes: item.diggCount ?? item.likes ?? item.likesCount,
    views: item.playCount ?? item.video_play_count ?? item.video_view_count ?? item.videoViewCount,
    comments: item.commentCount ?? item.num_comments ?? item.commentsCount,
    hashtags: (item.hashtags || []).map((h: any) => typeof h === "string" ? h : h.name),
    musicTitle: item.musicMeta?.musicName || item.audio?.original_audio_title,
    musicAuthor: item.musicMeta?.musicAuthor || item.audio?.ig_artist_username,
    mediaUrls,
    thumbnailUrl: item.videoMeta?.coverUrl || item.thumbnail || item.display_url || item.displayUrl,
    raw: item,
  };

  console.log(`    type: ${ctx.scrape.type} (${mediaUrls.length} media urls)`);
  console.log(`    title: "${(ctx.scrape.title || "").slice(0, 60)}"`);
  return ctx;
};

// --- CLI mode: bun run src/steps/scrape.ts '{"url":"...","platform":"tiktok"}' ---
if (import.meta.main) {
  await import("../env");
  const input = JSON.parse(process.argv[2] || await Bun.stdin.text());
  const result = await scrape(input as Context);
  console.log(JSON.stringify(result, null, 2));
}
