import React from "react";
import type { PropsWithChildren } from "react";
import maplibregl from "maplibre-gl";
import { MapCtx } from "./MapContext";
import { useGestures } from "./useGestures";

// Initialize debug flags
if (typeof window !== "undefined" && !(window as any).debugFlags) {
  (window as any).debugFlags = { customGestures: true };
}

export default function MapShell({ children }: PropsWithChildren) {
  const el = React.useRef<HTMLDivElement>(null);
  const [map, setMap] = React.useState<maplibregl.Map>();

  /* mount once ---------------------------------------------------------- */
  React.useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: {
        version: 8,
        sources: {
          sat: {
            type: "raster",
            tiles: [
              "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            attribution: "Tiles © Esri & contributors",
          },
        },
        layers: [{ id: "sat", type: "raster", source: "sat" }],
      },
      // initial center from URL (?map=lng,lat,zoom,bearing,pitch) or fallback
      center: (() => {
        const u = new URL(window.location.href);
        const q = u.searchParams.get('map');
        if (q) {
          const [lng, lat] = q.split(',').map(Number);
          if (isFinite(lng) && isFinite(lat)) return [lng, lat] as [number, number];
        }
        return [0, 20] as [number, number];
      })(),
      zoom: (() => {
        const q = new URL(window.location.href).searchParams.get('map');
        if (q) {
          const parts = q.split(',').map(Number);
          if (isFinite(parts[2])) return parts[2];
        }
        return 3;
      })(),
      attributionControl: false,
    });

    // Expose window.mapRef = { current: map } to keep tests happy
    (window as any).mapRef = { current: m };

    // Also restore bearing/pitch if present
    try {
      const q = new URL(window.location.href).searchParams.get('map');
      if (q) {
        const parts = q.split(',').map(Number);
        if (isFinite(parts[3])) m.setBearing(parts[3]);
        if (isFinite(parts[4])) m.setPitch(parts[4]);
      }
    } catch {}

    // Disable built-in handlers - we'll implement custom ones
    m.dragPan.disable();
    m.scrollZoom.disable();
    m.touchZoomRotate.disable();
    m.doubleClickZoom.enable();

    setMap(m);

    // Ensure the map size recalculates when parent flexbox finishes
    requestAnimationFrame(() => m.resize());

    return () => {
      m.remove();
      (window as any).mapRef = null;
    };
  }, []);

  /* plug-ins ------------------------------------------------------------- */
  const enableCustom = (window as any).debugFlags?.customGestures !== false;
  useGestures(map, { enableCustom });

  // Persist view to URL on moveend
  React.useEffect(() => {
    if (!map) return;
    const onMove = () => {
      const c = map.getCenter();
      const z = map.getZoom();
      const b = map.getBearing();
      const p = map.getPitch();
      const u = new URL(window.location.href);
      u.searchParams.set('map', `${c.lng.toFixed(6)},${c.lat.toFixed(6)},${z.toFixed(2)},${b.toFixed(1)},${p.toFixed(1)}`);
      // keep hash (#inv, #peer) intact
      window.history.replaceState({}, '', u.toString());
    };
    map.on('moveend', onMove);
    return () => { map.off('moveend', onMove); };
  }, [map]);

  /* render --------------------------------------------------------------- */
  return (
    <MapCtx.Provider value={map!}>
      <div ref={el} className="absolute inset-0" />
      {map && children}
    </MapCtx.Provider>
  );
}
