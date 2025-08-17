export type AnnoKind = "rect" | "circle" | "line" | "text" | "track" | "timepin";

export interface BaseAnno {
  id: string;
  type: AnnoKind;
  // Optional time dimension:
  time?: number;                // timestamp (ms) for point-in-time
  timeStart?: number;           // range start (ms)
  timeEnd?: number;             // range end   (ms)
  trackId?: string;             // to associate multiple keyframes across time
  label?: string;
  z?: number;                   // z-index
  locked?: boolean;
  hidden?: boolean;
}

export interface RectAnno extends BaseAnno {
  type: "rect";
  north: number; west: number; south: number; east: number;
  zoom?: number;
}
export interface CircleAnno extends BaseAnno {
  type: "circle";
  lat: number; lng: number; rLat: number; rLng: number;
  zoom?: number;
}
export interface LineAnno extends BaseAnno {
  type: "line";
  lat1: number; lng1: number; lat2: number; lng2: number;
  zoom?: number;
}
export interface TextAnno extends BaseAnno {
  type: "text";
  lat: number; lng: number; content: string;
  zoom?: number;
}
export interface TrackAnno extends BaseAnno {
  type: "track";
  points: { ts: number; lat: number; lng: number }[]; // ordered by ts
}

export interface TimePin extends BaseAnno {
  type: "timepin";
  ts: number;
  // optionally a view (for camera keyframes):
  view?: { lng: number; lat: number; zoom?: number; bearing?: number; pitch?: number };
}

export type AnyAnno = RectAnno | CircleAnno | LineAnno | TextAnno | TrackAnno | TimePin;

export interface Group {
  id: string;
  name?: string;
  children: string[];      // annotation IDs
  parentId?: string | null;
  locked?: boolean;
  hidden?: boolean;
}