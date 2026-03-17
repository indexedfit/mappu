# Pipeline — Content Ingestion & Video Generation

Agent for scraping, transcribing, and analyzing social media content, then generating videos: talking head presenters, slideshows, AI clips, character swaps, remixes, and compilations.

## Critical Rules

- **Text overlays**: NEVER use raw ffmpeg drawtext. Use `remix.ts` or `render.ts` (both auto-wrap).
- **ffmpeg duration**: ALWAYS use `-t <seconds>`. Never rely on `-shortest`.
- **Short-form default**: Target 10-15s for reels unless explicitly asked otherwise. For pure hooks/memes, prefer 7-10s.
- **Speed changes**: ALWAYS use two-pass ffmpeg for speed-up workflows: trim first, then apply `setpts`.
- **ffmpeg quality**: `-crf 23 -movflags +faststart`. Use `-vn` for audio-only extraction.
- **9:16 normalize**: `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black`
- **Crop strategy**: If the subject is centered, prefer center-crop to fill frame. If edge content matters, use blur-background instead of hard crop.
- **Export validation**: Before handing off a final social video, verify duration with `ffprobe` and keep exports `yuv420p`.
- **Music bed**: Keep music under voice/dialogue, usually `0.6-0.8` volume, fade in ~0.5s and fade out ~1s before end.
- **Creative direction**: Present 2-3 options and wait for human pick before rendering.
- **Kling constraints**: Source 3-10s, 720-2160px, ≤200MB, MP4/MOV. Motion control: `"video"` ≤30s, `"image"` ≤10s.
- **Issue attachments**: ALWAYS upload key outputs to the Paperclip issue as attachments. Downloaded source videos, rendered outputs, extracted stills — anything someone reviewing the issue needs to see without SSH access. The issue is the record. Use the attachment upload API after each significant output.
- **Carousel/slideshow detection**: Instagram carousels (type `Sidecar`) are handled automatically by the pipeline. `scrape.ts` uses `apify/instagram-scraper` which returns `childPosts[]` with ALL slides. `download.ts` downloads every slide and stores them in `ctx.mediaFiles[]`. When processing carousels manually or outside the pipeline, check `item.type === "Sidecar"` or `item.childPosts.length > 1`. Download EVERY slide — never just the first. For video posts (`type === "Video"`), download the `videoUrl` field, NOT the thumbnail/photo.
- **yt-dlp first for videos**: For Instagram reels and TikTok videos, the pipeline uses yt-dlp first, falling back to Apify CDN URLs only if yt-dlp fails. yt-dlp is skipped for image posts and carousels (it can't download images). If running downloads manually outside the pipeline, always try `yt-dlp -o "data/media/%(title)s.%(ext)s" "<url>"` before resorting to Apify CDN fetch.
- **Attachment MIME types**: When uploading `.mp4` files, always set explicit MIME type: `curl -F "file=@path.mp4;type=video/mp4"`. Without it, curl sends `application/octet-stream` which is rejected.
- **Attachment verification**: After uploading an attachment, verify it's actually accessible by checking the issue's attachment list. Do NOT mark an issue as done until all claimed attachments are confirmed present.

## Short-Form Heuristics

Use these defaults for Instagram Reels / TikTok / Shorts style outputs:

- **Structure**: Aim for ~3-5s hook + ~7-10s payload/demo.
- **First 1-3 seconds**: Must have movement, a face, or a strong visual change. Static openings are weak.
- **Hook text**: 3-7 words per line, max 3 lines, punchy over clever.
- **Keep one core idea per video**: Do not cram multiple concepts into one 15s output.
- **Prefer variant batches**: Make 3-5 tight variations of one concept instead of one overcomplicated cut.
- **When combining multiple source links**: first produce a source summary, then make a synthesis cut. Do not jump straight into editing without selecting a unifying angle.

## Video Formats

Proven formats this pipeline can produce end-to-end. Each has a playbook below.

### Presenter Overlay
AI talking head composited over app demos, screen recordings, or any background. Character overlaid (bottom-left/right), alternating position at natural speech pauses.
- **Tools**: nano-banana (character) → ElevenLabs TTS → `lipsync.ts` (segmented lip sync) → `lipsync.ts presenter` (composite)
- **Composite modes**: `matte` (default — BiRefNet segmentation via `segment.ts`, clean edges) or `pip` (bordered rectangle)
- **Key insight**: Split audio at natural pauses, generate 2-4s lip sync segments separately, concat. Reduces degradation vs single long generation.
- **Lip sync models**: VEED Fabric (default, best), Aurora (natural alternative), OmniHuman (avoid — loses hand-held props)

### Character Swap
Replace a person in an existing video while preserving background, text overlays, and motion.
- **Tools**: nano-banana (inject character into first frame) → `fal.ts` motion-control → `segment.ts` (extract person) → `segment.ts composite` (overlay onto original)
- **Key insight**: Always inject character INTO the first frame (not raw photo). Composite at fgScale 1.05 to cover ghosting edges.

### Slideshow
Image sequence with text overlays and music. Good for aesthetic/mood content.
- **Tools**: `pinterest.ts` or `archive.ts` (source images) → `render.ts` (slideshow) → optionally `remix.ts` (audio)

### Compilation Remix
Cut-detect a source video, select segments, normalize resolution, concat with new music.
- **Tools**: `cutdetect.ts` → ffmpeg normalize → ffmpeg concat → `remix.ts` (audio + text)
- **Default target**: 10-15s total. Use 2-4 strongest segments, not every acceptable segment.

### Motion Transfer
Transfer dance/gesture from a reference video onto a character image.
- **Tools**: `fal.ts` motion-control with `characterOrientation:"video"`

### Video Style Transfer
Transform an existing video's visual style (watercolor, anime, etc.).
- **Tools**: `fal.ts` video-to-video with style prompt + optional `referenceImageUrls`

### Planned Formats (not yet built)
- **Podcast Studio** — two AI characters in a studio setting having a conversation. Needs: multi-character generation, dialogue TTS with speaker turns, studio background.
- **Street Interview** — character with mic in a real location. Needs: location background generation or real footage + presenter composite.
- **Split Screen / Before-After** — side-by-side comparison format.
- **Tutorial with Presenter** — screen recording with floating presenter explaining. Similar to Presenter/PIP but with tighter integration.

## Tools

```bash
# Full pipeline — scrape + download + transcribe + analyze + store
bun run src/index.ts "<url>" ["optional instruction"]

# Orchestrator — enrich content + process generation requests
bun run src/orchestrator/index.ts

# Lip sync — image + audio → talking video (segmented by default)
bun run src/steps/lipsync.ts '{"imagePath":"...","audioPath":"...","model":"veed"}'
# Presenter PIP — composite lip sync onto background with position switching
bun run src/steps/lipsync.ts presenter '{"lipSyncVideo":"...","backgroundVideo":"...","audioPath":"..."}'

# AI video generation via fal.ai (Kling)
bun run src/steps/fal.ts '{"mode":"image-to-video","imagePath":"...","prompt":"...","outputName":"..."}'
bun run src/steps/fal.ts '{"mode":"text-to-video","prompt":"...","aspectRatio":"9:16","outputName":"..."}'
bun run src/steps/fal.ts '{"mode":"video-to-video","videoPath":"...","prompt":"...","outputName":"..."}'
bun run src/steps/fal.ts '{"mode":"motion-control","imagePath":"...","videoPath":"...","characterOrientation":"video","outputName":"..."}'
# Kling models: "2.6" (default, cheaper) or "3.0" (better quality)

# Person segmentation + composite
bun run src/steps/segment.ts '{"videoPath":"...","model":"Matting","outputName":"..."}'
bun run src/steps/segment.ts composite '{"backgroundVideo":"...","foregroundVideo":"...","matteVideo":"...","fgScale":1.05,"outputName":"..."}'

# Remix video — swap audio + add text overlay
bun run src/steps/remix.ts '{"videoPath":"...","audioPath":"...","text":"...","outputName":"..."}'

# Render slideshow from images
bun run src/steps/render.ts '{"slides":[{"imagePath":"...","text":"..."}],"outputName":"..."}'

# Cut detection — split video at scene changes
bun run src/steps/cutdetect.ts <videoPath> [threshold]

# Subtitles — transcribe → SRT → burn onto video
bun run src/steps/subtitle.ts '{"transcriptPath":"...","videoPath":"...","outputName":"...","style":"bold"}'

# Image search
bun run src/steps/pinterest.ts "search query"
bun run src/steps/archive.ts "search query" image
bun run src/steps/flickr.ts "search query" [minDate] [maxDate] [maxImages]
# Flickr date range: great for finding authentic old photos (e.g. "computer" 1990 2008 10)

# Are.na scraper
bun run src/steps/arena.ts <channel-slug-or-url>

# Download any video
yt-dlp -o "data/media/%(title)s.%(ext)s" "<url>"
```

## FFmpeg Fallback Patterns

Use these only when the step scripts do not already cover the job.

```bash
# Center-crop landscape to vertical
ffmpeg -y -hide_banner -loglevel error \
  -i "INPUT" \
  -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30" \
  -an -c:v libx264 -preset fast -crf 18 -movflags +faststart \
  "OUTPUT"

# Blur-background vertical conversion
ffmpeg -y -hide_banner -loglevel error -i "INPUT" \
  -filter_complex "\
    [0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:5[bg];\
    [0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black@0[fg];\
    [bg][fg]overlay=0:0" \
  -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 128k -movflags +faststart \
  "OUTPUT"

# Two-pass speed-up
ffmpeg -y -hide_banner -loglevel error \
  -i "INPUT" -ss START -to END \
  -c copy "/tmp/segment.mp4"

ffmpeg -y -hide_banner -loglevel error \
  -i "/tmp/segment.mp4" \
  -vf "setpts=PTS_MULTIPLIER*PTS,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30" \
  -an -c:v libx264 -preset fast -crf 18 -movflags +faststart \
  "OUTPUT"

# Validate final duration
ffprobe -v quiet -print_format json -show_entries format=duration "OUTPUT" | \
  python3 -c "import sys,json; d=float(json.load(sys.stdin)['format']['duration']); print(f'{d:.1f}s')"
```

## Playbooks

### Presenter / PIP Overlay
1. Generate character with nano-banana: casual pose, wireless lapel mic in hand, dark background. **Checkpoint with user.**
2. Generate TTS: `curl -X POST "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}" -H "xi-api-key: $ELEVENLABS_API_KEY" -H "Content-Type: application/json" -d '{"text":"...","model_id":"eleven_multilingual_v2"}' -o data/audio/hook.mp3`
3. Lip sync: `bun run src/steps/lipsync.ts '{"imagePath":"character.png","audioPath":"hook.mp3"}'` (auto-segments at pauses)
4. Prep background: crop to 9:16 if needed (`ffmpeg -vf "crop=1080:1920:X:Y"`)
5. PIP composite: `bun run src/steps/lipsync.ts presenter '{"lipSyncVideo":"...","backgroundVideo":"...","audioPath":"..."}'`

### Character Swap
1. Download + trim source to ≤30s
2. Extract first frame: `ffmpeg -vframes 1 -q:v 2 first_frame.jpg`
3. nano-banana: inject new character INTO the first frame (preserve background/pose)
4. Motion control: `bun run src/steps/fal.ts '{"mode":"motion-control","imagePath":"edited_frame.png","videoPath":"source.mp4","characterOrientation":"video","model":"3.0"}'`
5. Segment swapped person: `bun run src/steps/segment.ts '{"videoPath":"swapped.mp4","model":"Matting"}'`
6. Composite onto original: `bun run src/steps/segment.ts composite '{"backgroundVideo":"original.mp4","foregroundVideo":"swapped.mp4","matteVideo":"matte.mp4","fgScale":1.05}'`

### Slideshow
1. Search images: `pinterest.ts` or `archive.ts`
2. Render: `bun run src/steps/render.ts '{"slides":[...],"outputName":"...","audioPath":"..."}'`
3. If meant for social distribution, keep the final under 15s unless storytelling requires longer.

### Compilation
1. `cutdetect.ts` on source → segments
2. Normalize: `ffmpeg -vf "scale=1080:1920:..." -crf 23`
3. Concat: `ffmpeg -f concat`
4. Audio: `ffmpeg -i video.mp4 -i audio.mp3 -c:v copy -c:a aac -t <seconds> -movflags +faststart`
5. Prefer the strongest emotional or visual transitions first; weak middle segments should be cut aggressively.

## When you receive a link

1. `bun run src/index.ts "<url>"` — scrape → download → transcribe → analyze → store
2. `bun run src/orchestrator/index.ts` — enrich + process pending generations

## Paperclip API

**Instance**: `https://paperclip.comms.fit`
**API base**: `https://paperclip.comms.fit/api`

```bash
AUTH="Authorization: Bearer $PAPERCLIP_API_KEY"
API="https://paperclip.comms.fit/api"

# Check assigned issues
curl -s "$API/companies/$COMPANY_ID/issues?assigneeAgentId=$AGENT_ID&status=todo,in_progress" -H "$AUTH"

# Comment progress on issue
curl -s -X POST "$API/issues/$ISSUE_ID/comments" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"body": "Processed 3 links. Extracted 12 images, 2 transcripts. Best hooks: ..."}'

# Upload output file as attachment
curl -s -X POST "$API/companies/$COMPANY_ID/issues/$ISSUE_ID/attachments" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -F "file=@data/renders/output.mp4"

# Mark issue done
curl -s -X PATCH "$API/issues/$ISSUE_ID" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"status": "done", "comment": "Rendered 3 slideshow variants. Attached outputs."}'
```

### When picking up an assigned issue:
1. Read the issue description and all comments for context (links, instructions, format)
2. Comment that you're starting work
3. Execute the pipeline tools as needed
4. **Upload downloaded source media as attachments immediately after download** — videos, images, audio. The issue must be self-contained; reviewers should be able to see/play everything from the board without SSH.
5. Comment with progress at natural checkpoints (include what was downloaded, analyzed, extracted)
6. Upload any rendered/processed outputs as attachments too
7. Mark done with summary of what was produced and what's attached

## Paperclip Issue Workflow

Use Paperclip issues as the operating system for this pipeline.

### Intake Issue

Use one rolling intake issue per campaign, account, or theme.

- The human may add links over time. Do not assume intake is complete after the first batch.
- Treat the issue description plus all comments as the current source-of-truth input.
- New comment with more links = new intake batch, not necessarily a new project.
- When a batch is processed, comment back with:
  - what links were processed
  - what assets were extracted
  - what looks most reusable
  - what content angles seem strongest

### Library Behavior

- If the intake issue is becoming a reusable source bank, treat it as a rolling library.
- Attach the best source media and intermediate outputs back to the issue or to the specific comment that introduced them.
- Keep comments organized by batch or angle: `batch 1`, `batch 2`, `best stills`, `good hooks`, `usable audio`, etc.
- If the human wants a clean synthesis, create or request a separate production issue instead of overloading the intake thread.

### Production Issue

Create or work from a separate production issue when the goal is synthesis:

- combine multiple intake batches
- generate concepts
- produce variants
- prepare drafts for review

Production issue should reference the intake issue and clearly state:

- target account/persona
- format
- number of variants
- objective: growth, trust, product bridge, etc.

### Working Rule

- Intake issue = collect and analyze source material
- Production issue = turn selected source material into publishable outputs
- Review happens on the production issue unless the human explicitly wants review on the intake issue

### Multi-Link / Multi-Batch Rule

If the human adds a third, fourth, or later source link after earlier processing:

- do not restart blindly
- process only the new additions
- update the running summary
- suggest synthesis options across all batches if a combined angle is emerging

## Account / Persona Strategy

When producing for a recurring account, think in terms of a stable content character.

- One account should usually have one consistent persona
- Keep face, voice, framing, tone, and setting stable unless the human asks for a deliberate pivot
- Consistency matters more than novelty for account trust
- Reuse proven structures, but vary hooks, examples, and visuals

For each account, maintain a lightweight operating brief inside Paperclip or the issue thread:

- persona name
- audience
- niche
- visual style
- voice style
- repeatable content pillars
- product or monetization angle

### Content Mix Defaults

Default to a value-heavy mix unless the human specifies otherwise:

- roughly 2 educational/value posts for every 1 product-bridge post
- educational posts build trust and reach
- product posts should still deliver real value before the ask

### Script Rules

- Benefits over features
- Sixth-grade reading level by default
- Simple, direct language beats clever language
- Reuse proven structures; do not reinvent formatting for every post
- For product bridges, make the transition feel like a logical next step, not a sudden ad pivot

### Persona Safety Rule

- Keep claims grounded and avoid overclaiming, especially in health, wellness, finance, or other sensitive niches
- If advice could be risky, soften the framing and present it as informational rather than authoritative

## Postiz Publishing

Use Postiz as the default scheduling/publishing layer when a draft is approved for posting.

### Default Rule

- Do not publish automatically just because a draft exists.
- Publish or schedule only when the issue clearly indicates the draft is approved and ready.
- After scheduling, always write the result back into the Paperclip issue as a comment.

### Environment

Expected env vars when Postiz is enabled:

- `POSTIZ_API_KEY` — required
- `POSTIZ_API_URL` — optional; use for self-hosted Postiz later

### CLI Preference

Prefer the official Postiz CLI over hand-rolled API calls when possible.

```bash
# Install once if missing
npm install -g postiz

# Verify
postiz --help

# Required auth
export POSTIZ_API_KEY=...

# Optional for self-hosted later
export POSTIZ_API_URL=https://your-postiz-server.com
```

### Basic Workflow

1. Identify the final approved caption
2. Identify the final approved media attachment(s)
3. Upload media to Postiz
4. Create a scheduled post against the target integration/account
5. Comment back on the Paperclip issue with:
   - target account/integration
   - scheduled time
   - Postiz post ID
   - any important provider settings used

### Typical Commands

```bash
# List connected accounts/integrations
postiz integrations:list

# Upload media first
RESULT=$(postiz upload path/to/media.mp4)
FILE_URL=$(echo "$RESULT" | jq -r '.path')

# Create a scheduled post
postiz posts:create \
  -c "Final caption here" \
  -m "$FILE_URL" \
  -s "2026-03-20T14:00:00Z" \
  -i "integration-id"

# Check analytics later
postiz analytics:post POST_ID
postiz analytics:platform INTEGRATION_ID
```

### Paperclip Reporting Rule

After scheduling in Postiz, add a Paperclip comment that includes:

- `Scheduled in Postiz`
- integration/account name
- scheduled timestamp
- Postiz post ID

After analytics review, add another comment with:

- impressions / views
- engagement
- click or conversion notes if available
- what should be repeated or changed next time

### V1 Publishing Policy

- Manual approval in Paperclip
- Scheduled through Postiz
- Analytics summarized back into Paperclip

This keeps Paperclip as the control plane and Postiz as the publishing/analytics layer.

## Environment

API keys in `.env`:
- `DATABASE_URL` — Postgres
- `APIFY_TOKEN` — scraping + Pinterest
- `GROQ_API_KEY` — Whisper + Llama 4 Scout + enrichment
- `FAL_KEY` — fal.ai (Kling, VEED, Aurora, BiRefNet)
- `ELEVENLABS_API_KEY` — TTS voices
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` — (optional)

## File layout

```
src/steps/lipsync.ts        — lip sync (segmented) + presenter PIP composite
src/steps/fal.ts            — AI video gen (Kling): i2v, t2v, v2v, motion-control
src/steps/segment.ts        — person segmentation (BiRefNet v2) + composite
src/steps/remix.ts          — remix video: swap audio + text overlay
src/steps/render.ts         — render slideshow from images + text
src/steps/cutdetect.ts      — scene detection + video splitting
src/steps/subtitle.ts       — transcribe → SRT → burn subtitles
src/steps/pinterest.ts      — Pinterest image search
src/steps/archive.ts        — Internet Archive search
src/steps/flickr.ts         — Flickr image search (keyword + date range, no API key)
src/steps/arena.ts          — Are.na channel scraper
src/steps/scrape.ts         — social media scraping (Apify)
src/steps/download.ts       — media download
src/steps/transcribe.ts     — Whisper transcription
src/steps/audio.ts          — ffmpeg audio extraction
src/steps/analyze.ts        — frame extraction + vision analysis

src/index.ts                — full pipeline CLI
src/orchestrator/index.ts   — enrichment + generation daemon
src/env.ts                  — .env loader
src/db/client.ts            — postgres connection

data/media/                 — downloaded videos
data/audio/                 — extracted audio
data/renders/               — output videos
data/frames/                — extracted frames
data/pinterest/             — Pinterest images
data/segments/              — cut-detected segments
data/arena/                 — Are.na channel data
```
