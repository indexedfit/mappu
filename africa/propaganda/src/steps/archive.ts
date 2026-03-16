import { mkdirSync } from "fs";
import { join } from "path";
import { DATA_DIR } from "../env";

const IA_SEARCH = "https://archive.org/advancedsearch.php";

export interface ArchiveResult {
  identifier: string;
  title: string;
  description: string;
  creator: string;
  date: string;
  mediatype: string;
  downloads: number;
  thumbnailUrl: string;
  downloadUrl: string | null; // direct URL to best media file
  localPath: string | null;   // downloaded file path
}

interface SearchDoc {
  identifier: string;
  title?: string;
  description?: string;
  creator?: string | string[];
  date?: string;
  mediatype?: string;
  downloads?: number;
  format?: string[];
}

/**
 * Run a single search against archive.org advancedsearch API.
 */
async function runSearch(q: string, maxResults: number): Promise<SearchDoc[]> {
  console.log(`  [archive] query: "${q}"`);

  const url = new URL(IA_SEARCH);
  url.searchParams.set("q", q);
  url.searchParams.set("output", "json");
  url.searchParams.set("rows", String(maxResults));
  url.searchParams.set("page", "1");
  url.searchParams.set("sort[]", "downloads desc");
  for (const f of ["identifier", "title", "description", "creator", "date", "mediatype", "downloads", "format"]) {
    url.searchParams.append("fl[]", f);
  }

  const res = await fetch(url.toString());
  if (!res.ok) return [];

  const json = (await res.json()) as { response: { numFound: number; docs: SearchDoc[] } };
  console.log(`  [archive] → ${json.response.numFound} total, got ${json.response.docs.length}`);
  return json.response.docs;
}

/**
 * Search Internet Archive for content matching a query.
 * Free, no auth needed. Returns items with download URLs.
 * Tries the exact query first, then progressively simpler fallbacks.
 */
export async function searchArchive(
  query: string,
  opts: {
    mediatype?: "movies" | "image" | "audio" | "texts";
    collection?: string;
    maxResults?: number;
    download?: boolean; // download thumbnails/files to local
  } = {},
): Promise<ArchiveResult[]> {
  const { mediatype, collection, maxResults = 12, download = true } = opts;

  console.log(`  [archive] searching: "${query}" (max ${maxResults})`);

  // Build query variants — try exact first, then progressively simpler
  const mediaFilter = mediatype ? ` mediatype:${mediatype}` : "";
  const collFilter = collection ? ` collection:${collection}` : "";

  const queries = [
    // Exact query with filters
    `${query}${mediaFilter}${collFilter}`,
    // Without collection filter
    collFilter ? `${query}${mediaFilter}` : null,
    // Individual words OR'd (broader match)
    query.split(/\s+/).length > 2
      ? `(${query.split(/\s+/).slice(0, 3).join(" OR ")})${mediaFilter}`
      : null,
    // Without mediatype filter (any media)
    mediaFilter ? `${query}` : null,
  ].filter(Boolean) as string[];

  let docs: SearchDoc[] = [];
  for (const q of queries) {
    docs = await runSearch(q, maxResults);
    if (docs.length >= 3) break;
    // Accumulate partial results
    if (docs.length > 0) {
      const more = await runSearch(queries[queries.indexOf(q) + 1] || q, maxResults - docs.length);
      const seen = new Set(docs.map((d) => d.identifier));
      docs.push(...more.filter((d) => !seen.has(d.identifier)));
      if (docs.length >= 3) break;
    }
  }

  console.log(`  [archive] final: ${docs.length} results`);

  // Build results with thumbnail + download URLs
  const results: ArchiveResult[] = docs.map((doc) => ({
    identifier: doc.identifier,
    title: doc.title || "",
    description: typeof doc.description === "string" ? doc.description.slice(0, 300) : "",
    creator: Array.isArray(doc.creator) ? doc.creator.join(", ") : doc.creator || "",
    date: doc.date || "",
    mediatype: doc.mediatype || "",
    downloads: doc.downloads || 0,
    thumbnailUrl: `https://archive.org/services/img/${doc.identifier}`,
    downloadUrl: null,
    localPath: null,
  }));

  // Fetch metadata for top results to get actual file URLs
  const topN = results.slice(0, Math.min(maxResults, 8));
  await Promise.all(
    topN.map(async (item) => {
      try {
        const meta = await fetch(`https://archive.org/metadata/${item.identifier}`);
        if (!meta.ok) return;
        const data = (await meta.json()) as { files: { name: string; format: string; size: string }[] };

        // Find best file — prefer mp4 for video, jpg/png for images
        const files = data.files || [];
        let best: string | null = null;

        if (item.mediatype === "movies") {
          const mp4 = files.find((f) => f.format === "h.264" || f.name.endsWith(".mp4"));
          const ogv = files.find((f) => f.name.endsWith(".ogv"));
          best = (mp4 || ogv)?.name || null;
        } else if (item.mediatype === "image") {
          const img = files.find((f) =>
            /\.(jpg|jpeg|png|gif)$/i.test(f.name) && f.format !== "Thumbnail",
          );
          best = img?.name || null;
        } else if (item.mediatype === "audio") {
          const mp3 = files.find((f) => f.name.endsWith(".mp3"));
          const ogg = files.find((f) => f.name.endsWith(".ogg"));
          best = (mp3 || ogg)?.name || null;
        }

        if (best) {
          item.downloadUrl = `https://archive.org/download/${item.identifier}/${encodeURIComponent(best)}`;
        }
      } catch {
        // skip metadata fetch errors
      }
    }),
  );

  // Download thumbnails if requested
  if (download) {
    const dir = join(DATA_DIR, "archive", `${Date.now()}-${query.replace(/\W+/g, "_").slice(0, 30)}`);
    mkdirSync(dir, { recursive: true });

    for (let i = 0; i < topN.length; i++) {
      const item = topN[i];
      try {
        const imgRes = await fetch(item.thumbnailUrl, { signal: AbortSignal.timeout(10000) });
        if (!imgRes.ok) continue;
        const localPath = join(dir, `${String(i).padStart(2, "0")}_${item.identifier.slice(0, 30)}.jpg`);
        await Bun.write(localPath, await imgRes.arrayBuffer());
        item.localPath = localPath;
      } catch {
        // skip
      }
    }
    console.log(`  [archive] downloaded ${topN.filter((r) => r.localPath).length} thumbnails to ${dir}`);
  }

  return results;
}

if (import.meta.main) {
  await import("../env");
  const query = process.argv[2];
  const mediatype = process.argv[3] as "movies" | "image" | "audio" | undefined;
  if (!query) {
    console.error('Usage: bun run src/steps/archive.ts "search query" [movies|image|audio]');
    process.exit(1);
  }
  const results = await searchArchive(query, { mediatype });
  console.log(JSON.stringify(results, null, 2));
}
