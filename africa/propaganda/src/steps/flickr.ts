import { mkdirSync } from "fs";
import { join } from "path";
import { DATA_DIR } from "../env";

export interface FlickrResult {
  flickrUrl: string;
  imageUrl: string;
  localPath: string;
  title: string;
  dateTaken: string;
  owner: string;
  width: number;
  height: number;
}

export interface FlickrSearchOptions {
  query: string;
  maxImages?: number;
  minDate?: string; // YYYY-MM-DD or YYYY
  maxDate?: string; // YYYY-MM-DD or YYYY
  sort?: "relevance" | "date-taken-asc" | "date-taken-desc" | "interestingness-desc";
}

/**
 * Search Flickr for photos by keyword + date range.
 * Scrapes the search page directly — no API key needed.
 * Flickr embeds full photo data as JSON in the HTML (modelExport).
 */
export async function searchFlickr(opts: FlickrSearchOptions): Promise<FlickrResult[]> {
  const {
    query,
    maxImages = 12,
    minDate,
    maxDate,
    sort = "interestingness-desc",
  } = opts;

  console.log(`  [flickr] searching: "${query}" (${minDate || "any"} → ${maxDate || "any"}, max ${maxImages})`);

  const params = new URLSearchParams({ text: query });

  if (minDate) {
    params.set("min_taken_date", minDate.length === 4 ? `${minDate}-01-01` : minDate);
  }
  if (maxDate) {
    params.set("max_taken_date", maxDate.length === 4 ? `${maxDate}-12-31` : maxDate);
  }

  // Map sort options to Flickr URL param
  const sortMap: Record<string, string> = {
    "relevance": "relevance",
    "date-taken-asc": "date-taken-asc",
    "date-taken-desc": "date-taken-desc",
    "interestingness-desc": "interestingness-desc",
  };
  if (sort && sort !== "relevance") {
    params.set("sort", sortMap[sort] || sort);
  }

  const url = `https://www.flickr.com/search/?${params}`;
  console.log(`  [flickr] fetching: ${url}`);

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!res.ok) {
    console.error(`  [flickr] page returned ${res.status}`);
    return [];
  }

  const html = await res.text();

  // Flickr embeds photo data in a modelExport JS object
  const match = html.match(/modelExport:\s*(\{[\s\S]*?\})\s*,\s*auth/);
  if (!match) {
    console.error(`  [flickr] no modelExport found in page`);
    return [];
  }

  let data: any;
  try {
    data = JSON.parse(match[1]);
  } catch (e) {
    console.error(`  [flickr] failed to parse modelExport JSON`);
    return [];
  }

  const photos = data.main?.["search-photos-lite-models"]?.[0]?.data?.photos?.data?._data;
  if (!photos?.length) {
    console.log(`  [flickr] no photos in response`);
    return [];
  }

  console.log(`  [flickr] found ${photos.length} results on page`);

  // Pick best size: l (1024) > c (800) > z (640) > m (500)
  const sizePriority = ["l", "c", "z", "m"];
  const candidates: { photo: any; imageUrl: string; width: number; height: number }[] = [];

  for (const item of photos) {
    const p = item.data;
    if (!p?.sizes?.data) continue;

    let best = null;
    for (const s of sizePriority) {
      if (p.sizes.data[s]?.data?.displayUrl) {
        best = p.sizes.data[s].data;
        break;
      }
    }
    if (!best) continue;

    const imageUrl = best.displayUrl.startsWith("//") ? `https:${best.displayUrl}` : best.displayUrl;
    candidates.push({ photo: p, imageUrl, width: best.width, height: best.height });
    if (candidates.length >= maxImages) break;
  }

  if (!candidates.length) {
    console.log(`  [flickr] no downloadable photos found`);
    return [];
  }

  // Download
  const dateSlug = [minDate, maxDate].filter(Boolean).join("-") || "all";
  const dir = join(DATA_DIR, "flickr", `${query.replace(/\W+/g, "_").slice(0, 30)}_${dateSlug}`);
  mkdirSync(dir, { recursive: true });

  const results: FlickrResult[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const { photo, imageUrl, width, height } = candidates[i];
    try {
      const resp = await fetch(imageUrl, {
        signal: AbortSignal.timeout(15000),
        headers: { "Referer": "https://www.flickr.com/" },
      });
      if (!resp.ok) continue;

      const title = (photo.title || "untitled").replace(/\W+/g, "_").slice(0, 40);
      const localPath = join(dir, `${String(i).padStart(2, "0")}_${title}.jpg`);
      await Bun.write(localPath, await resp.arrayBuffer());

      results.push({
        flickrUrl: `https://www.flickr.com/photos/${photo.ownerNsid}/${photo.id || ""}`,
        imageUrl,
        localPath,
        title: photo.title || "",
        dateTaken: photo.datetaken || "",
        owner: photo.username || photo.realname || "",
        width,
        height,
      });
      console.log(`  [flickr] ${i + 1}/${candidates.length} downloaded: "${photo.title}" (${photo.datetaken || "?"})`);
    } catch {
      // skip failed downloads
    }
  }

  console.log(`  [flickr] ${results.length} images saved to ${dir}`);
  return results;
}

if (import.meta.main) {
  await import("../env");
  const args = process.argv.slice(2);

  if (!args.length) {
    console.error(`Usage: bun run src/steps/flickr.ts "search query" [minDate] [maxDate] [maxImages]

Examples:
  bun run src/steps/flickr.ts "office party" 1990 2008
  bun run src/steps/flickr.ts "computer" 1990 2008 10
  bun run src/steps/flickr.ts "vintage car" 1950 1970 20`);
    process.exit(1);
  }

  const [query, minDate, maxDate, maxStr] = args;
  const results = await searchFlickr({
    query,
    minDate,
    maxDate,
    maxImages: maxStr ? parseInt(maxStr) : 10,
  });

  console.log(`\n--- Results ---`);
  for (const r of results) {
    console.log(`  ${r.dateTaken} | ${r.title} | ${r.width}x${r.height} | ${r.localPath}`);
  }
}
