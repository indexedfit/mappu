import { mkdirSync } from "fs";
import { join } from "path";
import { DATA_DIR } from "../env";

export interface PinResult {
  pinUrl: string;
  imageUrl: string;
  localPath: string;
  title: string;
  description: string;
}

/**
 * Search for images matching a query.
 * Strategy: Pinterest site search via Google (bypasses Pinterest's JS rendering).
 * Falls back to general Google Images scraping.
 * Downloads top N images to data/pinterest/{timestamp}/
 */
export async function searchPinterest(
  query: string,
  maxImages = 12,
): Promise<PinResult[]> {
  console.log(`  [pinterest] searching: "${query}" (max ${maxImages})`);

  // Strategy 1: Google Image search scoped to Pinterest
  let pins = await googleImageSearch(`${query} site:pinterest.com`, maxImages);

  // Strategy 2: Fall back to general image search if pinterest-scoped fails
  if (pins.length < 3) {
    console.log(`  [pinterest] pinterest-scoped got ${pins.length}, trying general image search`);
    const general = await googleImageSearch(`${query} aesthetic`, maxImages);
    pins = [...pins, ...general].slice(0, maxImages);
  }

  if (!pins.length) {
    console.log(`  [pinterest] no images found`);
    return [];
  }

  return downloadPins(pins, query);
}

/**
 * Scrape Google Images for image URLs.
 * Uses the &tbm=isch parameter.
 */
async function googleImageSearch(
  query: string,
  maxImages: number,
): Promise<Omit<PinResult, "localPath">[]> {
  const encoded = encodeURIComponent(query);
  const url = `https://www.google.com/search?q=${encoded}&tbm=isch&ijn=0`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!res.ok) {
    console.log(`  [pinterest] google images returned ${res.status}`);
    return [];
  }

  const html = await res.text();

  // Google Images embeds image URLs in data attributes and JSON blobs
  const pins: Omit<PinResult, "localPath">[] = [];

  // Pattern: extract full-res image URLs from the embedded JSON data
  // Google images page has URLs in various formats
  const patterns = [
    // Full resolution URLs in escaped JSON
    /\["(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))",\d+,\d+\]/gi,
    // Pinterest image CDN URLs
    /https:\/\/i\.pinimg\.com\/(?:originals|736x|564x)\/[a-f0-9/]+\.\w+/g,
    // General high-res image URLs in data
    /"ou":"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/gi,
  ];

  const seen = new Set<string>();

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      // Get the URL from capture group 1, or full match
      const imageUrl = (match[1] || match[0]).replace(/\\u003d/g, "=").replace(/\\u0026/g, "&");

      // Skip thumbnails and Google's own images
      if (
        imageUrl.includes("gstatic.com") ||
        imageUrl.includes("google.com") ||
        imageUrl.includes("encrypted-tbn") ||
        seen.has(imageUrl)
      ) continue;

      seen.add(imageUrl);
      pins.push({
        pinUrl: "",
        imageUrl,
        title: query,
        description: "",
      });

      if (pins.length >= maxImages) break;
    }
    if (pins.length >= maxImages) break;
  }

  console.log(`  [pinterest] found ${pins.length} image URLs from google`);
  return pins;
}

/**
 * Download images to local storage
 */
async function downloadPins(
  pins: Omit<PinResult, "localPath">[],
  query: string,
): Promise<PinResult[]> {
  const dir = join(DATA_DIR, "pinterest", `${Date.now()}-${query.replace(/\W+/g, "_").slice(0, 30)}`);
  mkdirSync(dir, { recursive: true });

  const results: PinResult[] = [];
  for (let i = 0; i < pins.length; i++) {
    const pin = pins[i];
    try {
      const res = await fetch(pin.imageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
          "Referer": "https://www.google.com/",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) continue;

      const ext = contentType.includes("png") ? "png" : "jpg";
      const localPath = join(dir, `${String(i).padStart(2, "0")}.${ext}`);
      await Bun.write(localPath, await res.arrayBuffer());
      results.push({ ...pin, localPath });
      console.log(`  [pinterest] ${i + 1}/${pins.length} downloaded`);
    } catch {
      // skip failed downloads silently
    }
  }

  console.log(`  [pinterest] ${results.length} images saved to ${dir}`);
  return results;
}

if (import.meta.main) {
  await import("../env");
  const query = process.argv[2];
  if (!query) {
    console.error("Usage: bun run src/steps/pinterest.ts \"search query\"");
    process.exit(1);
  }
  const results = await searchPinterest(query);
  console.log(JSON.stringify(results, null, 2));
}
