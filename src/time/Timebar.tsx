// src/time/Timebar.tsx
import React from 'react';
import * as Y from 'yjs';
import { useAnnotations } from '../hooks/useYAnnotations';

function useMetaTime(ydoc: Y.Doc) {
  const yMeta = ydoc.getMap<any>('meta');
  const [now, setNow] = React.useState<number | null>(yMeta.get('time.current') ?? null);
  React.useEffect(() => {
    const sub = () => setNow(yMeta.get('time.current') ?? null);
    ydoc.on('update', sub);
    return () => { ydoc.off('update', sub); };
  }, [ydoc, yMeta]);
  const set = (t: number | null) => yMeta.set('time.current', t);
  return [now, set] as const;
}

export default function Timebar({ ydoc }: { ydoc: Y.Doc }) {
  const { annotations } = useAnnotations(ydoc);
  const [t, setT] = useMetaTime(ydoc);
  const [min, max] = React.useMemo(() => {
    const times: number[] = [];
    for (const a of annotations as any[]) {
      if (typeof a.time === 'number') times.push(a.time);
      if (typeof a.timeStart === 'number') times.push(a.timeStart);
      if (typeof a.timeEnd === 'number') times.push(a.timeEnd);
      if (a.type === 'track' && Array.isArray(a.points)) {
        a.points.forEach((p: any) => times.push(p.ts));
      }
      if (a.type === 'timepin' && typeof a.ts === 'number') times.push(a.ts);
    }
    if (times.length === 0) return [0, 0];
    return [Math.min(...times), Math.max(...times)];
  }, [annotations]);

  const map = (window as any).mapRef?.current;

  const onInput: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const next = parseInt(e.target.value, 10);
    setT(next);

    // Optional: if there is a TimePin near this ts with a view, ease camera
    const pins = (annotations as any[]).filter(a => a.type === 'timepin' && a.view);
    if (map && pins.length) {
      const best = pins.reduce((acc, p) => {
        const d = Math.abs(p.ts - next);
        return !acc || d < acc.d ? { p, d } : acc;
      }, null as any);
      if (best && best.p.view) {
        const v = best.p.view;
        map.easeTo({
          center: [v.lng, v.lat],
          zoom: v.zoom ?? map.getZoom(),
          bearing: v.bearing ?? map.getBearing(),
          pitch: v.pitch ?? map.getPitch(),
          duration: 250
        });
      }
    }
  };

  if (min === max) return null;

  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-3 z-40 bg-black/60 text-white px-3 py-2 rounded">
      <input
        type="range"
        min={min}
        max={max}
        value={t ?? min}
        onChange={onInput}
        style={{ width: 320 }}
      />
      <span className="ml-3 text-xs opacity-80">{new Date(t ?? min).toLocaleString()}</span>
    </div>
  );
}