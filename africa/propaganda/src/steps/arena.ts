import { mkdirSync } from "fs";
import { join } from "path";
import { DATA_DIR } from "../env";

// --- Types ---

interface ArenaBlock {
  id: number;
  title: string | null;
  class: "Image" | "Text" | "Link" | "Media" | "Attachment";
  content: string | null;
  description: string | null;
  source: { url: string; title: string; provider?: { name: string } } | null;
  image: {
    filename: string;
    original: { url: string; file_size: number };
    display: { url: string };
  } | null;
  created_at: string;
  updated_at: string;
}

interface ArenaChannel {
  id: number;
  title: string;
  slug: string;
  length: number;
  status: string;
  contents: ArenaBlock[];
}

export interface ArenaResult {
  user?: string;
  channel: string;
  slug: string;
  totalBlocks: number;
  downloaded: { path: string; block: ArenaBlock }[];
  outputDir: string;
}

// --- API helpers ---

const API = "https://api.are.na/v2";
const DELAY_MS = 2100; // ~28 req/min, safely under 30/min unauthenticated limit

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiGet<T>(path: string): Promise<T> {
  const url = `${API}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

// --- Get user's channel slugs from RSS feed ---

async function getUserChannelSlugs(userSlug: string): Promise<string[]> {
  const rssUrl = `https://www.are.na/${userSlug}/feed/rss`;
  const res = await fetch(rssUrl);
  if (!res.ok) throw new Error(`RSS ${res.status}: ${rssUrl}`);
  const xml = await res.text();

  // Extract channel URLs (not block URLs) from RSS
  const slugs = new Set<string>();
  const re = new RegExp(`https://www\\.are\\.na/${userSlug}/([a-z0-9][a-z0-9-]*)`, "g");
  let match;
  while ((match = re.exec(xml)) !== null) {
    const slug = match[1];
    if (slug !== "feed") slugs.add(slug);
  }

  // RSS only shows recent activity. To get ALL channels, we also need the user profile.
  // The /users/:slug endpoint gives channel_count but not slugs.
  // Workaround: try the /users/:slug/channels endpoint (needs auth) — fall back to RSS-only.
  const token = process.env.ARENA_TOKEN;
  if (token) {
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      const url = `${API}/users/${userSlug}/channels?per=100`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const channels: ArenaChannel[] = await res.json();
        for (const ch of channels) slugs.add(ch.slug);
      }
    } catch {}
  }

  return [...slugs];
}

// --- Download a channel's contents ---

async function downloadChannel(
  slug: string,
  outputDir: string
): Promise<ArenaResult> {
  // Get channel metadata + first page
  const channel = await apiGet<ArenaChannel>(`/channels/${slug}?per=100`);
  const totalBlocks = channel.length;
  const title = channel.title;

  console.log(`  [arena] "${title}" — ${totalBlocks} blocks`);

  // Collect all blocks with pagination
  let allBlocks: ArenaBlock[] = channel.contents || [];
  const totalPages = Math.ceil(totalBlocks / 100);

  for (let page = 2; page <= totalPages; page++) {
    await sleep(DELAY_MS);
    console.log(`  [arena] page ${page}/${totalPages}...`);
    const ch = await apiGet<ArenaChannel>(
      `/channels/${slug}/contents?per=100&page=${page}`
    );
    allBlocks.push(...(ch as any));
  }

  // Create output dirs
  const imagesDir = join(outputDir, "images");
  const linksDir = outputDir;
  mkdirSync(imagesDir, { recursive: true });

  const downloaded: { path: string; block: ArenaBlock }[] = [];
  let imgIdx = 0;

  // Process blocks
  for (const block of allBlocks) {
    if (block.class === "Image" && block.image?.original?.url) {
      imgIdx++;
      const ext =
        block.image.filename?.split(".").pop()?.toLowerCase() || "jpg";
      const safeName = `${String(imgIdx).padStart(3, "0")}_${(block.title || block.id).toString().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60)}.${ext}`;
      const outPath = join(imagesDir, safeName);

      try {
        const res = await fetch(block.image.original.url);
        if (res.ok) {
          await Bun.write(outPath, await res.arrayBuffer());
          downloaded.push({ path: outPath, block });
        }
      } catch (e: any) {
        console.log(`  [arena] failed to download ${block.id}: ${e.message}`);
      }

      // Throttle image downloads lightly
      if (imgIdx % 10 === 0) {
        console.log(`  [arena] downloaded ${imgIdx} images...`);
        await sleep(500);
      }
    }
  }

  // Save metadata for all blocks (images, text, links, media)
  const manifest = {
    channel: title,
    slug,
    totalBlocks,
    blocks: allBlocks.map((b) => ({
      id: b.id,
      class: b.class,
      title: b.title,
      content: b.content,
      description: b.description,
      sourceUrl: b.source?.url || null,
      imageUrl: b.image?.original?.url || null,
      createdAt: b.created_at,
    })),
    downloadedImages: downloaded.length,
    scrapedAt: new Date().toISOString(),
  };

  await Bun.write(join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(
    `  [arena] done — ${downloaded.length} images, ${allBlocks.length} total blocks`
  );

  return {
    channel: title,
    slug,
    totalBlocks,
    downloaded,
    outputDir,
  };
}

// --- Main exports ---

/** Scrape a single Are.na channel by slug or URL */
export async function arenaChannel(input: string): Promise<ArenaResult> {
  // Parse input — could be URL or slug
  let slug: string;
  const urlMatch = input.match(/are\.na\/[^/]+\/([a-z0-9][a-z0-9-]*)/);
  if (urlMatch) {
    slug = urlMatch[1];
  } else {
    slug = input.replace(/\s+/g, "-").toLowerCase();
  }

  const outputDir = join(DATA_DIR, "arena", slug);
  return downloadChannel(slug, outputDir);
}

/** Scrape all public channels for an Are.na user */
export async function arenaUser(userSlug: string): Promise<ArenaResult[]> {
  console.log(`  [arena] fetching channels for ${userSlug}...`);
  const slugs = await getUserChannelSlugs(userSlug);
  console.log(`  [arena] found ${slugs.length} channels`);

  const results: ArenaResult[] = [];
  for (const slug of slugs) {
    await sleep(DELAY_MS);
    try {
      const result = await downloadChannel(
        slug,
        join(DATA_DIR, "arena", userSlug, slug)
      );
      results.push({ ...result, user: userSlug });
    } catch (e: any) {
      console.log(`  [arena] error on "${slug}": ${e.message}`);
    }
  }

  // Summary manifest
  const summaryDir = join(DATA_DIR, "arena", userSlug);
  mkdirSync(summaryDir, { recursive: true });
  await Bun.write(
    join(summaryDir, "summary.json"),
    JSON.stringify(
      {
        user: userSlug,
        channels: results.map((r) => ({
          channel: r.channel,
          slug: r.slug,
          totalBlocks: r.totalBlocks,
          downloadedImages: r.downloaded.length,
          outputDir: r.outputDir,
        })),
        scrapedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  return results;
}

// --- CLI ---

if (import.meta.main) {
  await import("../env");
  const input = process.argv[2];
  if (!input) {
    console.log(`Usage:`);
    console.log(`  bun run src/steps/arena.ts <channel-slug-or-url>`);
    console.log(`  bun run src/steps/arena.ts --user <username>`);
    console.log(`\nExamples:`);
    console.log(`  bun run src/steps/arena.ts distinct-web`);
    console.log(`  bun run src/steps/arena.ts https://www.are.na/blaze-smith/distinct-web`);
    console.log(`  bun run src/steps/arena.ts --user blaze-smith`);
    process.exit(1);
  }

  if (input === "--user") {
    const user = process.argv[3];
    if (!user) {
      console.log("Usage: bun run src/steps/arena.ts --user <username>");
      process.exit(1);
    }
    const results = await arenaUser(user);
    console.log(
      `\nScraped ${results.length} channels, ${results.reduce((s, r) => s + r.downloaded.length, 0)} total images`
    );
  } else {
    const result = await arenaChannel(input);
    console.log(JSON.stringify(result, null, 2));
  }
}
