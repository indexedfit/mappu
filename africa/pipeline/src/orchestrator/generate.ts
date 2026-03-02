import OpenAI from "openai";
import { db } from "../db/client";
import { requireEnv } from "../env";
import { searchPinterest, type PinResult } from "../steps/pinterest";
import { renderSlideshow, type RenderResult } from "../steps/render";

const groq = () =>
  new OpenAI({
    apiKey: requireEnv("GROQ_API_KEY"),
    baseURL: "https://api.groq.com/openai/v1",
  });

interface GenerationRow {
  id: number;
  content_id: number | null;
  prompt: string;
  status: string;
}

export interface Brief {
  concept: string;
  script: { timecode: string; type: string; content: string }[];
  visualDirection: string;
  audioDirection: string;
  textOverlays: string[];
  duration: string;
  referenceNotes: string;
  pinterestQuery: string;   // what to search on Pinterest for visuals
}

export async function processGeneration(generationId: number): Promise<Brief> {
  // Mark as processing
  await db`UPDATE generations SET status = 'processing', updated_at = NOW() WHERE id = ${generationId}`;

  const rows = await db`SELECT * FROM generations WHERE id = ${generationId}`;
  if (!rows.length) throw new Error(`Generation #${generationId} not found`);
  const gen = rows[0] as GenerationRow;

  // Get source content if linked
  let sourceContext = "";
  if (gen.content_id) {
    const content = await db`SELECT * FROM content WHERE id = ${gen.content_id}`;
    if (content.length) {
      const c = content[0] as any;
      const enrichments = typeof c.enrichments === "string" ? JSON.parse(c.enrichments) : c.enrichments;

      sourceContext = [
        `\n--- SOURCE CONTENT ---`,
        `Platform: ${c.platform}`,
        `Title: ${c.title}`,
        `Author: ${c.author}`,
        `Transcript: ${c.transcript}`,
        c.summary ? `Summary: ${c.summary}` : null,
        enrichments?.formatTemplate ? `Format: ${enrichments.formatTemplate}` : null,
        enrichments?.hook ? `Hook: ${enrichments.hook}` : null,
        enrichments?.script
          ? `Script:\n${enrichments.script.map((s: any) => `  [${s.timecode}] ${s.type}: ${s.content}`).join("\n")}`
          : null,
        enrichments?.mood ? `Mood: ${enrichments.mood}` : null,
        enrichments?.replicableElements?.length
          ? `Replicable elements: ${enrichments.replicableElements.join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n");
    }
  }

  const client = groq();

  // Step 1: Generate creative brief (now includes pinterestQuery)
  console.log(`  [generate] creating creative brief...`);
  const res = await client.chat.completions.create({
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    max_tokens: 2000,
    messages: [
      {
        role: "system",
        content: `You are a creative director for short-form video content (slideshows). Given a user's instruction and optionally a source piece of content to reference, produce a detailed creative brief.

The output will be a SLIDESHOW — a sequence of images with text overlays and optional background audio. NOT filmed video.

Return a JSON object with exactly these fields:
- "concept": 1-2 sentence pitch
- "script": array of {timecode, type, content} — the storyboard. type is "text_overlay", "visual" (describe what image should show), or "music_cue"
- "visualDirection": describe the visual aesthetic, color palette, image style to search for
- "audioDirection": describe background music mood, tempo
- "textOverlays": array of exact text strings to show on screen (one per slide ideally)
- "duration": target duration like "15s" or "30s"
- "referenceNotes": what to borrow from source and what to change
- "pinterestQuery": a concise Pinterest search query (2-5 words) to find images matching the visual direction. Be specific and aesthetic-focused. Examples: "Y2K anime aesthetic", "dark moody cityscape", "motivational sunrise mountain"

Return ONLY valid JSON.`,
      },
      {
        role: "user",
        content: `Instruction: ${gen.prompt}${sourceContext}`,
      },
    ],
  });

  const text = res.choices[0]?.message?.content || "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const brief = JSON.parse(jsonMatch?.[0] || text) as Brief;

  console.log(`  [generate] concept: "${brief.concept?.slice(0, 80)}"`);
  console.log(`  [generate] pinterest query: "${brief.pinterestQuery}"`);
  console.log(`  [generate] ${brief.textOverlays?.length || 0} text overlays, duration: ${brief.duration}`);

  // Save brief
  await db`
    UPDATE generations
    SET brief = ${JSON.stringify(brief)}, updated_at = NOW()
    WHERE id = ${generationId}
  `;

  // Step 2: Search Pinterest for images
  let pins: PinResult[] = [];
  if (brief.pinterestQuery) {
    try {
      const numSlides = Math.max(brief.textOverlays?.length || 4, 4);
      pins = await searchPinterest(brief.pinterestQuery, numSlides + 4); // extra for selection
    } catch (err) {
      console.error(`  [generate] pinterest search failed:`, err);
    }
  }

  // Step 3: Render slideshow if we have images
  let render: RenderResult | null = null;
  if (pins.length > 0) {
    try {
      // Match text overlays to images — one per slide
      const overlays = brief.textOverlays || [];
      const numSlides = Math.max(overlays.length, Math.min(pins.length, 8));
      const durationMatch = brief.duration?.match(/(\d+)/);
      const totalDuration = durationMatch ? parseInt(durationMatch[1]) : numSlides * 3;

      const slides = [];
      for (let i = 0; i < numSlides && i < pins.length; i++) {
        slides.push({
          imagePath: pins[i].localPath,
          text: overlays[i] || undefined,
          durationSec: totalDuration / numSlides,
        });
      }

      render = await renderSlideshow({
        slides,
        outputName: `gen_${generationId}_${Date.now()}`,
        totalDurationSec: totalDuration,
      });

      console.log(`  [generate] slideshow rendered: ${render.videoPath}`);
    } catch (err) {
      console.error(`  [generate] render failed:`, err);
    }
  }

  // Step 4: Update generation with results
  const outputUrls = render ? [render.videoPath] : [];
  const outputMeta = {
    pinterestPins: pins.map((p) => ({
      pinUrl: p.pinUrl,
      imageUrl: p.imageUrl,
      localPath: p.localPath,
      title: p.title,
    })),
    render: render || null,
  };

  const status = render ? "rendered" : "ready_for_review";

  await db`
    UPDATE generations
    SET status = ${status},
        output_urls = ${outputUrls},
        output_meta = ${JSON.stringify(outputMeta)},
        updated_at = NOW()
    WHERE id = ${generationId}
  `;

  console.log(`  [generate] #${generationId} status: ${status}`);
  return brief;
}
