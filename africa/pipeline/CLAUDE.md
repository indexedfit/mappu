# Pipeline — Content Ingestion & Processing

You are an agent operating inside a self-contained pipeline for scraping, transcribing, analyzing, and storing social media content (TikTok, Instagram, Spotify), then generating slideshow videos from creative briefs + Pinterest images.

## Your tools

```bash
# Full pipeline — scrape, download, extract audio, transcribe, analyze, get comments, store
bun run src/index.ts "<url>" ["optional instruction"]

# Orchestrator — enriches content + processes generations → slideshow videos
bun run src/orchestrator/index.ts

# Pinterest image search (standalone)
bun run src/steps/pinterest.ts "Y2K tropical video game"

# Internet Archive search (standalone) — free, no auth, supports movies/image/audio
bun run src/steps/archive.ts "retro vintage advertising" image

# Render slideshow from images (standalone, takes JSON input)
bun run src/steps/render.ts '{"slides":[{"imagePath":"...","text":"overlay"}],"outputName":"test"}'

# Individual steps (read JSON from stdin or arg, output JSON)
bun run src/steps/scrape.ts '{"url":"...","platform":"tiktok"}'
bun run src/steps/download.ts '{"url":"...","scrape":{"mediaUrls":["..."]}}'
bun run src/steps/transcribe.ts '{"media":{"localPath":"..."}}'
bun run src/steps/store.ts '<full context json>'
```

## When you receive a link

1. Run `bun run src/index.ts "<url>"` — this handles everything automatically
2. If there's an instruction with the link, pass it: `bun run src/index.ts "<url>" "the instruction"`
3. The pipeline will: detect platform → scrape → download → extract MP3 → transcribe → vision-analyze frames (every 3s) → get top comments → store to postgres
4. If an instruction is present, it also queues a generation request
5. Run `bun run src/orchestrator/index.ts` to enrich new content and process pending generations

## Three reactive loops

The orchestrator does three things:

**Enrichment** — when new content is stored, it runs an LLM analysis pass that produces:
- Content category (meme, edit, tutorial, skit, etc.)
- Hook analysis (what grabs attention in the first 3s)
- Full script extraction (narration + text overlays + visuals with timecodes)
- Format template (reusable description of the content format)
- Virality signals (like rate, comment rate, engagement tier)
- Mood, target audience, replicable elements

**Generation** — when a generation request is pending (from an instruction), it:
- Reads the enriched source content
- Produces a creative brief with concept, script, visual/audio direction, text overlays, duration
- Generates a `pinterestQuery` — a concise search term for finding matching visuals

**Rendering** — after the brief is produced:
- Searches Pinterest via Apify for images matching the visual direction
- Downloads top images to data/pinterest/
- Renders a slideshow MP4: images scaled to 1080x1920 (9:16), text overlays burned in, concatenated via ffmpeg
- Stores output video path in `generations.output_urls`, pinterest pins in `output_meta`
- Status goes: pending → processing → rendered (or ready_for_review if pinterest/render fails)

## Environment

API keys in `.env` (loaded by `src/env.ts`). Required:
- `DATABASE_URL` — Postgres (currently Neon)
- `APIFY_TOKEN` — TikTok/Instagram scraping + Pinterest search
- `GROQ_API_KEY` — Whisper transcription + Llama 4 Scout vision + enrichment/generation
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` — Spotify metadata (optional)

## Database

Two tables:
- `content` — scraped/analyzed content + enrichments JSONB. Frames include file paths.
- `generations` — generation requests (status: pending → processing → rendered/ready_for_review). Has `brief` JSONB, `output_urls` TEXT[], `output_meta` JSONB (pinterest pins + render info).

Triggers: `new_content` and `new_generation` NOTIFY channels for real-time orchestrator.

## File layout

```
src/index.ts                — full pipeline CLI
src/pipeline.ts             — step runner
src/env.ts                  — .env loader, DATA_DIR, requireEnv()
src/types.ts                — Context type

src/steps/ingest.ts         — detect platform from URL
src/steps/scrape.ts         — Apify (TikTok: clockworks, IG: pratikdani)
src/steps/spotify.ts        — Spotify Web API
src/steps/download.ts       — download media to data/media/
src/steps/audio.ts          — ffmpeg MP4→MP3 extraction to data/audio/
src/steps/transcribe.ts     — Groq Whisper transcription
src/steps/analyze.ts        — ffmpeg frames every 3s + Groq Llama 4 Scout vision
src/steps/comments.ts       — top 10 comments (TikTok via Apify, IG from scrape)
src/steps/store.ts          — INSERT into postgres
src/steps/generate.ts       — queue generation request
src/steps/pinterest.ts      — image search (Google Images → Pinterest), download images
src/steps/archive.ts        — Internet Archive search + download (free, no auth, videos/images/audio)
src/steps/render.ts         — render slideshow MP4 from images + text overlays via ffmpeg

src/orchestrator/index.ts   — daemon: listens for new content/generations
src/orchestrator/enrich.ts  — LLM enrichment (hook, script, format, virality)
src/orchestrator/generate.ts — creative brief → pinterest search → slideshow render

src/db/client.ts            — postgres connection
src/db/migrate.ts           — tables + triggers

data/media/                 — downloaded MP4s
data/audio/                 — extracted MP3s
data/frames/                — extracted video frames (JPEGs every 3s)
data/pinterest/             — downloaded Pinterest images
data/archive/               — downloaded Internet Archive thumbnails/files
data/renders/               — rendered slideshow MP4s
```
