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
      center: [0, 20],
      zoom: 3,
      attributionControl: false,
    });

    // Expose window.mapRef = { current: map } to keep tests happy
    (window as any).mapRef = { current: m };

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

  /* render --------------------------------------------------------------- */
  return (
    <MapCtx.Provider value={map!}>
      <div ref={el} className="absolute inset-0" />
      {map && children}
    </MapCtx.Provider>
  );
}
