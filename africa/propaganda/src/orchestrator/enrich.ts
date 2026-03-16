import OpenAI from "openai";
import { db } from "../db/client";
import { requireEnv } from "../env";

const groq = () =>
  new OpenAI({
    apiKey: requireEnv("GROQ_API_KEY"),
    baseURL: "https://api.groq.com/openai/v1",
  });

interface ContentRow {
  id: number;
  platform: string;
  content_type: string;
  title: string | null;
  description: string | null;
  author: string | null;
  transcript: string | null;
  frames: any;
  top_comments: any;
  likes: number | null;
  views: number | null;
  comments: number | null;
  hashtags: string[] | null;
  music_title: string | null;
  summary: string | null;
}

export interface Enrichments {
  category: string;
  hook: string;
  script: { timecode: string; type: "narration" | "text_overlay" | "visual"; content: string }[];
  formatTemplate: string;
  viralitySignals: {
    likeRate: number | null;
    commentRate: number | null;
    engagement: string;
  };
  mood: string;
  targetAudience: string;
  replicableElements: string[];
}

export async function enrichContent(contentId: number): Promise<Enrichments> {
  const rows = await db`SELECT * FROM content WHERE id = ${contentId}`;
  if (!rows.length) throw new Error(`Content #${contentId} not found`);
  const row = rows[0] as ContentRow;

  const frames = typeof row.frames === "string" ? JSON.parse(row.frames) : row.frames;
  const comments = typeof row.top_comments === "string" ? JSON.parse(row.top_comments) : row.top_comments;

  // Build a rich context blob for the LLM
  const context = [
    `Platform: ${row.platform}`,
    `Type: ${row.content_type}`,
    row.title ? `Title: ${row.title}` : null,
    row.author ? `Author: ${row.author}` : null,
    row.transcript ? `Transcript: ${row.transcript}` : null,
    row.likes != null ? `Likes: ${row.likes.toLocaleString()}` : null,
    row.views != null ? `Views: ${row.views.toLocaleString()}` : null,
    row.comments != null ? `Comment count: ${row.comments}` : null,
    row.hashtags?.length ? `Hashtags: ${row.hashtags.join(", ")}` : null,
    row.music_title ? `Music: ${row.music_title}` : null,
    frames?.length
      ? `Frame-by-frame:\n${frames.map((f: any) => `  [${f.timestampSec}s] ${f.description}`).join("\n")}`
      : null,
    comments?.length
      ? `Top comments:\n${comments.map((c: any) => `  ${c.author}: ${c.text} (${c.likes} likes)`).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const client = groq();

  const res = await client.chat.completions.create({
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    max_tokens: 1500,
    messages: [
      {
        role: "system",
        content: `You are a content analyst for short-form video. Analyze the following content and return a JSON object with exactly these fields:

- "category": one of: "meme", "edit", "tutorial", "talking_head", "skit", "product", "lifestyle", "motivation", "music_video", "news", "other"
- "hook": what happens in the first 3 seconds that grabs attention (1 sentence)
- "script": array of objects {timecode, type, content} where type is "narration", "text_overlay", or "visual". Reconstruct the full script/storyboard from transcript + frame analysis.
- "formatTemplate": a reusable 1-2 sentence description of this content format that someone could follow to make a similar video (e.g. "Anime clips with motivational voiceover and text overlays synced to dramatic music")
- "viralitySignals": {likeRate (likes/views as decimal), commentRate (comments/views as decimal), engagement: "low"/"medium"/"high"/"viral"}
- "mood": the overall emotional tone (1-3 words)
- "targetAudience": who this is for (1 sentence)
- "replicableElements": array of 3-5 specific elements someone could reuse (e.g. "text overlay at bottom with quote", "dark moody color grading")

Return ONLY valid JSON. No markdown, no explanation.`,
      },
      { role: "user", content: context },
    ],
  });

  const text = res.choices[0]?.message?.content || "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const enrichments = JSON.parse(jsonMatch?.[0] || text) as Enrichments;

  // Compute virality signals from actual numbers if LLM missed them
  if (row.views && row.views > 0) {
    enrichments.viralitySignals.likeRate = row.likes ? +(row.likes / row.views).toFixed(4) : null;
    enrichments.viralitySignals.commentRate = row.comments ? +(row.comments / row.views).toFixed(6) : null;
    const rate = enrichments.viralitySignals.likeRate || 0;
    enrichments.viralitySignals.engagement =
      rate > 0.1 ? "viral" : rate > 0.05 ? "high" : rate > 0.02 ? "medium" : "low";
  }

  // Save enrichments
  await db`UPDATE content SET enrichments = ${JSON.stringify(enrichments)} WHERE id = ${contentId}`;

  return enrichments;
}
