import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { IndexeddbPersistence } from "y-indexeddb";

export const ydoc = new Y.Doc();
// room name could be configurable via env / url
export const provider = new WebrtcProvider("mappu-room", ydoc);

export const yAnnotations = ydoc.getArray<Annotation>("annotations");
export const yLog = ydoc.getArray<LogEntry>("log");

// Enable IndexedDB persistence
let persistence: IndexeddbPersistence | null = null;
try {
  persistence = new IndexeddbPersistence("mappu-room", ydoc);
  persistence.on("synced", () => {
    console.log("Content from IndexedDB loaded");
    // Force a re-render by updating observer timestamps
    yAnnotations.observe(() => {});
    yLog.observe(() => {});
  });
  
  // Handle errors during sync
  persistence.on("error", (error: any) => {
    console.error("IndexedDB persistence error:", error);
    // If data is corrupted, clear it
    if (error.message && error.message.includes("decoder.arr")) {
      console.warn("Clearing corrupted IndexedDB data...");
      persistence?.clearData();
    }
  });
} catch (error) {
  console.warn("Failed to initialize IndexedDB persistence:", error);
}
export { persistence };

export interface AnnotationBase {
  id: string;
  type: "rect" | "circle" | "line" | "text";
}
export interface RectAnnotation extends AnnotationBase {
  type: "rect";
  north: number;
  west: number;
  south: number;
  east: number;
}
export interface CircleAnnotation extends AnnotationBase {
  type: "circle";
  lat: number;
  lng: number;
  rLat: number;
  rLng: number;
}
export interface LineAnnotation extends AnnotationBase {
  type: "line";
  lat1: number;
  lng1: number;
  lat2: number;
  lng2: number;
}
export interface TextAnnotation extends AnnotationBase {
  type: "text";
  lat: number;
  lng: number;
  content: string;
  zoom?: number; // Zoom level when created
}
export type Annotation =
  | RectAnnotation
  | CircleAnnotation
  | LineAnnotation
  | TextAnnotation;

export interface LogEntry {
  id: string;
  ts: number; // epoch ms
  user: string;
  msg: string;
}
