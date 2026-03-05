# Pipeline — Content Ingestion & Processing

You are an agent operating inside a self-contained pipeline for scraping, transcribing, analyzing, and storing social media content (TikTok, Instagram, Spotify), then generating slideshow videos from creative briefs + Pinterest images.

## CRITICAL RULES

**Text overlays: NEVER use raw ffmpeg drawtext.** Always use `src/steps/remix.ts` for video remixing or `src/steps/render.ts` for slideshows. Both auto-wrap text to fit the video/frame width. Raw ffmpeg drawtext WILL overflow on narrow videos. This is a hard rule — no exceptions.

**System dependencies:** ffmpeg and bun must be installed. Run `bun install` if node_modules/ is missing.

## Your tools

```bash
# Full pipeline — scrape, download, extract audio, transcribe, analyze, get comments, store
bun run src/index.ts "<url>" ["optional instruction"]

# Orchestrator — enriches content + processes generations → slideshow videos
bun run src/orchestrator/index.ts

# Remix a video — swap audio, add text overlay (text auto-wraps, never overflows)
bun run src/steps/remix.ts '{"videoPath":"...","audioPath":"...","audioStartSec":30,"text":"overlay text","outputName":"my_remix"}'

# Render slideshow from images (text auto-wraps, never overflows)
bun run src/steps/render.ts '{"slides":[{"imagePath":"...","text":"overlay"}],"outputName":"test"}'

# Pinterest image search (standalone)
bun run src/steps/pinterest.ts "Y2K tropical video game"

# Internet Archive search (standalone) — free, no auth, supports movies/image/audio
bun run src/steps/archive.ts "retro vintage advertising" image

# AI video generation via fal.ai (Kling models) — image-to-video, text-to-video, video-to-video edit
bun run src/steps/fal.ts '{"mode":"image-to-video","imagePath":"...","prompt":"slow zoom, ambient motion","outputName":"animated"}'
bun run src/steps/fal.ts '{"mode":"text-to-video","prompt":"a retro computer in a dark room","aspectRatio":"9:16","outputName":"retro_clip"}'
bun run src/steps/fal.ts '{"mode":"video-to-video","videoPath":"...","prompt":"replace the person with a cartoon character","outputName":"edited"}'

# Individual steps (read JSON from stdin or arg, output JSON)
bun run src/steps/scrape.ts '{"url":"...","platform":"tiktok"}'
bun run src/steps/download.ts '{"url":"...","scrape":{"mediaUrls":["..."]}}'
bun run src/steps/transcribe.ts '{"media":{"localPath":"..."}}'
bun run src/steps/store.ts '<full context json>'
```

## Playbook — common tasks

### "Download this video and swap the music / add text"
1. `bun run src/index.ts "<url>"` — downloads video to data/media/
2. Find the downloaded file in data/media/ (latest .mp4)
3. `bun run src/steps/remix.ts '{"videoPath":"data/media/xxx.mp4","audioPath":"/path/to/song.mp3","audioStartSec":30,"text":"your text here","outputName":"my_remix"}'`
4. Output lands in data/renders/

### "Make a slideshow from this concept"
1. Search for images: `bun run src/steps/pinterest.ts "aesthetic query"` or `bun run src/steps/archive.ts "query" image`
2. Render slideshow: `bun run src/steps/render.ts '{"slides":[...],"outputName":"name","audioPath":"/path/to/music.mp3","audioStartSec":60}'`
3. Each slide: `{"imagePath":"...","text":"overlay text","durationSec":0.5}`

### "Analyze this content and make something similar"
1. `bun run src/index.ts "<url>" "instruction for what to generate"`
2. `bun run src/orchestrator/index.ts` — enriches content, generates brief, searches Pinterest, renders slideshow
3. Output video lands in data/renders/, generation record updated in DB

### "Search for reference images"
- Pinterest: `bun run src/steps/pinterest.ts "Y2K tropical aesthetic"`
- Archive.org: `bun run src/steps/archive.ts "vintage advertising" image`
- Both download images to local folders under data/

### "Generate a video clip from an image"
1. Source or generate an image (pinterest, archive, or nano-banana image gen)
2. `bun run src/steps/fal.ts '{"mode":"image-to-video","imagePath":"data/pinterest/img.jpg","prompt":"slow cinematic zoom, ambient particles","duration":"5","outputName":"animated_clip"}'`
3. Optionally remix with audio/text: `bun run src/steps/remix.ts '{"videoPath":"data/renders/animated_clip.mp4","audioPath":"...","text":"overlay","outputName":"final"}'`

### "Edit/transform an existing video"
1. Download source video via pipeline
2. `bun run src/steps/fal.ts '{"mode":"video-to-video","videoPath":"data/media/source.mp4","prompt":"replace the person with an anime character","outputName":"edited"}'`
3. Note: source video must be 3-10s, 720-2160px, max 200MB

### "Generate a video from text"
1. `bun run src/steps/fal.ts '{"mode":"text-to-video","prompt":"a nostalgic computer room, CRT monitors glowing, VHS aesthetic","aspectRatio":"9:16","duration":"5","outputName":"generated"}'`
2. Optionally chain with remix.ts for audio/text overlays

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
- Searches Pinterest for images matching the visual direction
- Downloads top images to data/pinterest/
- Renders a slideshow MP4: images scaled to 1080x1920 (9:16), text overlays burned in, concatenated via ffmpeg
- Stores output video path in `generations.output_urls`, pinterest pins in `output_meta`
- Status goes: pending → processing → rendered (or ready_for_review if pinterest/render fails)

## Environment

API keys in `.env` (loaded by `src/env.ts`). Required:
- `DATABASE_URL` — Postgres (currently Neon)
- `APIFY_TOKEN` — TikTok/Instagram scraping + Pinterest search
- `GROQ_API_KEY` — Whisper transcription + Llama 4 Scout vision + enrichment/generation
- `FAL_KEY` — fal.ai video generation (Kling models: image-to-video, text-to-video, video-to-video edit)
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
src/steps/remix.ts          — remix video: swap audio + add text overlay (auto-wrapped)
src/steps/render.ts         — render slideshow MP4 from images + text overlays via ffmpeg
src/steps/fal.ts            — AI video gen via fal.ai (Kling): image-to-video, text-to-video, video-to-video edit

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
data/renders/               — rendered slideshow MP4s + remixed videos
```
