import React from 'react';
import maplibregl from 'maplibre-gl';

export const MapCtx = React.createContext<maplibregl.Map | null>(null);

export const useMap = () => {
  const map = React.useContext(MapCtx);
  if (!map) {
    throw new Error('useMap must be used within MapCtx.Provider');
  }
  return map;
};