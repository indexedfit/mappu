// This file now only exports types - actual instances are created in BoardRouter
// Keeping this for backward compatibility during migration

export function throwDeprecatedError(): never {
  throw new Error('Direct import from ydoc.ts is deprecated. Use BoardRouter instead.');
}

// These exports will cause errors if accessed, helping identify places that need updating
export const ydoc = throwDeprecatedError as any;
export const provider = throwDeprecatedError as any;
export const yAnnotations = throwDeprecatedError as any;
export const yLog = throwDeprecatedError as any;
export const persistence = throwDeprecatedError as any;

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
  zoom?: number; // Zoom level when created
}
export interface CircleAnnotation extends AnnotationBase {
  type: "circle";
  lat: number;
  lng: number;
  rLat: number;
  rLng: number;
  zoom?: number; // Zoom level when created
}
export interface LineAnnotation extends AnnotationBase {
  type: "line";
  lat1: number;
  lng1: number;
  lat2: number;
  lng2: number;
  zoom?: number; // Zoom level when created
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
