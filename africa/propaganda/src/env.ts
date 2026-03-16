import { join } from "path";

const ROOT = join(import.meta.dir, "..");

// Load .env from pipeline root, no bash dependency
const envPath = join(ROOT, ".env");
const envFile = Bun.file(envPath);

if (await envFile.exists()) {
  const text = await envFile.text();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

export const ROOT_DIR = ROOT;
export const DATA_DIR = join(ROOT, "data");

export function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env: ${key} — check .env file`);
  return val;
}
