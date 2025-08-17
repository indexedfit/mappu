// src/time/timeUtils.ts
import type { AnyAnno, TrackAnno } from '../annotations/types';

export function isVisibleAt(anno: AnyAnno, t: number | null): boolean {
  if (t == null) return true;
  if (anno.time != null) return Math.abs(anno.time - t) < 1e9; // +/- ~11 days tolerance? tune
  if (anno.timeStart != null && anno.timeEnd != null) return (anno.timeStart <= t && t <= anno.timeEnd);
  if (anno.timeStart != null && anno.timeEnd == null) return t >= anno.timeStart;
  if (anno.timeStart == null && anno.timeEnd != null) return t <= anno.timeEnd;
  return true;
}

export function interpolateTrack(track: TrackAnno, t: number) {
  const pts = track.points;
  if (!pts.length) return null;
  if (t <= pts[0].ts) return pts[0];
  if (t >= pts[pts.length - 1].ts) return pts[pts.length - 1];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i+1];
    if (t >= a.ts && t <= b.ts) {
      const u = (t - a.ts) / (b.ts - a.ts);
      return { ts: t, lng: a.lng + u * (b.lng - a.lng), lat: a.lat + u * (b.lat - a.lat) };
    }
  }
  return pts[pts.length - 1];
}