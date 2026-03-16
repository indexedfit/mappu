import type { Context, Platform, Step } from "../types";

const PLATFORM_PATTERNS: [RegExp, Platform][] = [
  [/tiktok\.com/, "tiktok"],
  [/instagram\.com/, "instagram"],
  [/spotify\.com/, "spotify"],
  [/\.(png|jpg|jpeg|gif|webp)$/i, "image"],
];

function detectPlatform(url: string): Platform {
  for (const [re, platform] of PLATFORM_PATTERNS) {
    if (re.test(url)) return platform;
  }
  return "unknown";
}

export const ingest: Step = async (ctx) => {
  ctx.platform = detectPlatform(ctx.url);

  if (ctx.platform === "unknown") {
    if (await Bun.file(ctx.url).exists()) {
      ctx.platform = "image";
    }
  }

  console.log(`    platform: ${ctx.platform}`);
  if (ctx.instruction) {
    console.log(`    instruction: "${ctx.instruction}"`);
  }

  return ctx;
};

if (import.meta.main) {
  await import("../env");
  const input = JSON.parse(process.argv[2] || await Bun.stdin.text());
  const result = await ingest(input as Context);
  console.log(JSON.stringify(result, null, 2));
}
