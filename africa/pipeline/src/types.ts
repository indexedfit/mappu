// --- Source types ---

export type Platform = "tiktok" | "instagram" | "spotify" | "image" | "unknown";

export type ContentType = "video" | "image" | "audio" | "carousel";

// --- Pipeline context ---

export interface Context {
  // Input
  url: string;
  instruction?: string;
  platform: Platform;

  // Scrape results
  scrape?: {
    type: ContentType;
    title?: string;
    description?: string;
    author?: string;
    authorUrl?: string;
    likes?: number;
    views?: number;
    comments?: number;
    hashtags?: string[];
    musicTitle?: string;
    musicAuthor?: string;
    mediaUrls: string[];     // video/image URLs
    thumbnailUrl?: string;
    raw?: Record<string, unknown>;
  };

  // Downloaded media
  media?: {
    localPath: string;       // path to downloaded mp4/image
    mimeType: string;
    sizeBytes: number;
  };

  // Transcription
  transcription?: {
    text: string;
    language?: string;
    segments?: { start: number; end: number; text: string }[];
  };

  // Vision analysis (screenshots + descriptions)
  frames?: {
    timestampSec: number;
    path: string;            // local file path to the extracted JPEG frame
    description: string;
    tags: string[];
  }[];

  // Extracted audio
  audioPath?: string;

  // Top comments
  topComments?: {
    text: string;
    author: string;
    likes: number;
    replies: number;
  }[];

  // Combined analysis summary
  summary?: string;

  // Storage
  contentId?: number;

  // Generation (future)
  generation?: {
    id?: number;
    prompt: string;
    status: "pending" | "processing" | "done" | "failed";
    outputUrls?: string[];
  };
}

// --- Step interface ---

export type Step = (ctx: Context) => Promise<Context>;

// --- Step metadata (for logging) ---

export interface StepDef {
  name: string;
  run: Step;
  when?: (ctx: Context) => boolean;  // skip if returns false
}
