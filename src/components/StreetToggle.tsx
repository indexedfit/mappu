import React from 'react';
import { useMap } from '../map/MapContext';

const LS_KEY = 'mappu.layers.streetsOn';
const OSM_SOURCE_ID = 'osm-streets-source';
const OSM_LAYER_ID  = 'osm-streets-layer';

export default function StreetToggle() {
  const map = useMap();
  const [on, setOn] = React.useState<boolean>(() => {
    try { return localStorage.getItem(LS_KEY) === '1'; } catch { return false; }
  });

  const ensureOsmLayer = React.useCallback(() => {
    if (!map.isStyleLoaded()) {
      map.once('load', ensureOsmLayer);
      return;
    }
    if (!map.getSource(OSM_SOURCE_ID)) {
      map.addSource(OSM_SOURCE_ID, {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/rastertiles/light_only_labels/{z}/{x}/{y}.png',
          'https://b.basemaps.cartocdn.com/rastertiles/light_only_labels/{z}/{x}/{y}.png',
          'https://c.basemaps.cartocdn.com/rastertiles/light_only_labels/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors, © CARTO'
      });
    }
    if (!map.getLayer(OSM_LAYER_ID)) {
      map.addLayer({
        id: OSM_LAYER_ID,
        type: 'raster',
        source: OSM_SOURCE_ID,
        paint: {
          'raster-fade-duration': 0,
          'raster-opacity': 0.9
        },
      });
    }
  }, [map]);

  const applyVisibility = React.useCallback((enable: boolean) => {
    if (map.getLayer(OSM_LAYER_ID)) {
      map.setLayoutProperty(OSM_LAYER_ID, 'visibility', enable ? 'visible' : 'none');
    }
  }, [map]);

  const doToggle = React.useCallback(() => {
    const next = !on;
    setOn(next);
    try { localStorage.setItem(LS_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    if (next) {
      ensureOsmLayer();
      const run = () => applyVisibility(true);
      if (!map.isStyleLoaded()) map.once('load', run); else run();
    } else {
      applyVisibility(false);
    }
  }, [on, ensureOsmLayer, applyVisibility, map]);

  React.useEffect(() => {
    if (!on) return;
    ensureOsmLayer();
    const run = () => applyVisibility(true);
    if (!map.isStyleLoaded()) map.once('load', run); else run();
  }, [on, ensureOsmLayer, applyVisibility, map]);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as Element)?.getAttribute?.('contenteditable') === 'true') return;
      if (e.key.toLowerCase() === 's') {
        doToggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [doToggle]);

  return (
    <button
      title="Toggle Streets (S)"
      onClick={doToggle}
      className={`absolute top-36 right-2 z-20 rounded px-3 py-1 text-sm transition-colors
        ${on ? 'bg-green-500 text-black hover:bg-green-400' : 'bg-black/60 text-white hover:bg-black/70'}`}
    >
      🗺️ Streets
    </button>
  );
}