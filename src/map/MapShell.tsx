import React from "react";
import type { PropsWithChildren } from "react";
import maplibregl from "maplibre-gl";
import { MapCtx } from "./MapContext";
import { useGestures } from "./useGestures";
import { usePageZoomGuard } from "./usePageZoomGuard";

// Initialize debug flags
if (typeof window !== "undefined" && !(window as any).debugFlags) {
  (window as any).debugFlags = { customGestures: true };
}

interface MapShellProps extends PropsWithChildren {
  ydoc?: any;
}

export default function MapShell({ children, ydoc }: MapShellProps) {
  const el = React.useRef<HTMLDivElement>(null);
  const [map, setMap] = React.useState<maplibregl.Map>();

  // Guard against browser/page zoom anywhere inside our map root
  usePageZoomGuard(el.current);

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
      // initial center from localStorage (fast), then URL, then fallback
      center: (() => {
        // First try localStorage for immediate restoration
        try {
          const savedView = localStorage.getItem('mappu.view');
          if (savedView) {
            const view = JSON.parse(savedView);
            if (view.lng !== undefined && view.lat !== undefined) {
              return [view.lng, view.lat] as [number, number];
            }
          }
        } catch {}
        
        // Then try URL
        const u = new URL(window.location.href);
        const q = u.searchParams.get('map');
        if (q) {
          const [lng, lat] = q.split(',').map(Number);
          if (isFinite(lng) && isFinite(lat)) return [lng, lat] as [number, number];
        }
        return [0, 20] as [number, number];
      })(),
      zoom: (() => {
        // First try localStorage for immediate restoration
        try {
          const savedView = localStorage.getItem('mappu.view');
          if (savedView) {
            const view = JSON.parse(savedView);
            if (view.zoom !== undefined) {
              return view.zoom;
            }
          }
        } catch {}
        
        // Then try URL
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
    
    // Attach ydoc to map for access in handlers
    if (ydoc) {
      (m as any)._ydoc = ydoc;
    }

    // Also restore bearing/pitch from localStorage then URL
    try {
      // First try localStorage
      const savedView = localStorage.getItem('mappu.view');
      if (savedView) {
        const view = JSON.parse(savedView);
        if (view.bearing !== undefined) m.setBearing(view.bearing);
        if (view.pitch !== undefined) m.setPitch(view.pitch);
      } else {
        // Fallback to URL
        const q = new URL(window.location.href).searchParams.get('map');
        if (q) {
          const parts = q.split(',').map(Number);
          if (isFinite(parts[3])) m.setBearing(parts[3]);
          if (isFinite(parts[4])) m.setPitch(parts[4]);
        }
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


  // Persist view to localStorage AND CRDT on moveend (no more URL pollution)
  React.useEffect(() => {
    if (!map) return;
    const onMove = () => {
      const c = map.getCenter();
      const z = map.getZoom();
      const b = map.getBearing();
      const p = map.getPitch();
      
      const viewState = {
        lng: parseFloat(c.lng.toFixed(6)),
        lat: parseFloat(c.lat.toFixed(6)),
        zoom: parseFloat(z.toFixed(2)),
        bearing: parseFloat(b.toFixed(1)),
        pitch: parseFloat(p.toFixed(1))
      };
      
      // Save to localStorage for fast restoration on reload
      try {
        localStorage.setItem('mappu.view', JSON.stringify(viewState));
      } catch {}
      
      // Also save to CRDT for collaboration
      if (ydoc) {
        const yMeta = ydoc.getMap('meta');
        yMeta.set('map.view', viewState);
      }
    };
    map.on('moveend', onMove);
    return () => { map.off('moveend', onMove); };
  }, [map, ydoc]);

  /* render --------------------------------------------------------------- */
  return (
    <MapCtx.Provider value={map!}>
      <div ref={el} className="absolute inset-0" />
      {map && children}
    </MapCtx.Provider>
  );
}
