import type { Context, Step } from "../types";
import { requireEnv } from "../env";

// Spotify Web API — free tier, just needs client credentials
// No Apify needed. Get client_id + client_secret from https://developer.spotify.com/dashboard

async function getSpotifyToken(): Promise<string> {
  const clientId = requireEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = requireEnv("SPOTIFY_CLIENT_SECRET");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) throw new Error(`Spotify auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

function extractSpotifyId(url: string): { type: string; id: string } | null {
  // https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh
  const m = url.match(/spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/);
  if (!m) return null;
  return { type: m[1], id: m[2] };
}

export const spotify: Step = async (ctx) => {
  if (ctx.platform !== "spotify") return ctx;

  const parsed = extractSpotifyId(ctx.url);
  if (!parsed) {
    console.log("    could not parse spotify URL");
    return ctx;
  }

  const token = await getSpotifyToken();

  const res = await fetch(`https://api.spotify.com/v1/${parsed.type}s/${parsed.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Spotify API: ${res.status}`);
  const item = await res.json();

  ctx.scrape = {
    type: "audio",
    title: item.name,
    description: item.description || undefined,
    author: item.artists?.map((a: any) => a.name).join(", ") || item.show?.name,
    likes: item.popularity,
    hashtags: item.genres || [],
    musicTitle: item.name,
    musicAuthor: item.artists?.map((a: any) => a.name).join(", "),
    mediaUrls: [item.preview_url].filter(Boolean),
    thumbnailUrl: item.album?.images?.[0]?.url || item.images?.[0]?.url,
    raw: item,
  };

  console.log(`    spotify: "${ctx.scrape.title}" by ${ctx.scrape.author}`);
  return ctx;
};

if (import.meta.main) {
  await import("../env");
  const input = JSON.parse(process.argv[2] || await Bun.stdin.text());
  const result = await spotify(input as Context);
  console.log(JSON.stringify(result, null, 2));
}
