# Pipeline TODO

## High Priority — Optimization Loop (Layer 3)

From the AI UGC 3-layer framework: Concept → Execution → Optimization.
We have Layers 1+2 (enrichment + generation). Layer 3 is the compounding flywheel.

- [ ] **Multi-variant generation** — Same concept → 3-5 slideshow variants with different hooks, text overlays, and image sets. Run the brief → pinterest → render loop N times with slight prompt variations.
- [ ] **Performance tracking table** — `performance` table linking back to `generations`. After slideshows are posted, ingest performance data (views, likes, completion rate, CTR) back into the system.
- [ ] **Hook A/B testing** — Generate multiple first slides with different opening lines. `textOverlays[0]` is the hook — generate 5 variants per generation.
- [ ] **Concept validation step** — Before rendering, score the concept against successful patterns from our DB. Compare new briefs to top-performing past generations.
- [ ] **Winning pattern extraction** — After N generations have performance data, LLM pass to find meta-patterns: which hooks, overlays, image styles, durations perform best.

## Medium Priority — Content & Enrichment

- [ ] **Persona-specific briefs** — Enrich generation prompts with detailed persona definitions (demographics, psychographics, pain points) instead of just "recreate this."
- [ ] **YouTube Shorts ingestion** — Add platform detection + Apify actor for YouTube Shorts scraping. Huge content source we're missing.
- [ ] **Twitter/X clip ingestion** — Viral clips often surface on X first. Apify actor for tweet scraping.
- [ ] **Archive.org as image source for slideshows** — Use archive.org search alongside Pinterest for retro/vintage/aesthetic content. Step already built (`src/steps/archive.ts`).
- [ ] **Google Trends integration** — Free API, no auth. Detect trending topics to inform content direction. `google-trends-api` npm package.

## Low Priority — Future Video Phase

- [ ] **Speech-to-speech voiceover** — When moving beyond slideshows to video: record real voice, use AI to map onto AI actors. TTS sounds artificial; speech-to-speech preserves natural delivery.
- [ ] **AI actor integration** — ElevenLabs for voiceover generation, Suno/Udio for background music.
- [ ] **Music identification** — AudD API (free tier: 300 req/month) to identify songs in ingested videos when metadata is missing.
- [ ] **Reverse image search** — SerpAPI Google Lens endpoint for "find me more like this" workflows.
- [ ] **Stock footage search** — Pexels / Unsplash free APIs for supplementary footage.

## Done

- [x] TikTok ingestion (Apify clockworks actor)
- [x] Instagram ingestion (Apify pratikdani actor)
- [x] Spotify metadata (Web API)
- [x] Audio extraction (ffmpeg MP4→MP3)
- [x] Transcription (Groq Whisper)
- [x] Frame analysis every 3s (Groq Llama 4 Scout vision)
- [x] Top comments extraction
- [x] Postgres storage with NOTIFY triggers
- [x] LLM enrichment (hook, script, format, virality, mood, audience)
- [x] Creative brief generation
- [x] Pinterest image search (Google Images → pinimg.com)
- [x] Slideshow rendering (ffmpeg, 1080x1920, text overlays)
- [x] Archive.org search + download
- [x] End-to-end: URL → enrich → brief → pinterest → slideshow MP4
