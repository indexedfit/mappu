import { useEffect } from 'react';
import type { NetworkProvider } from '../types/provider';

export function usePresence(provider: NetworkProvider | null, selected: Set<string>) {
  useEffect(() => {
    if (!provider) return;
    
    const map = (window as any).mapRef?.current;
    if (!map) return;
    
    const updateCursor = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      
      // Save screen position for pan updates
      lastScreenX = e.clientX;
      lastScreenY = e.clientY;
      
      // Convert screen coordinates to map coordinates
      const point = map.unproject([e.clientX, e.clientY]);
      
      provider.awareness.setLocalStateField('cursor', {
        lng: point.lng,
        lat: point.lat,
        // Also send screen position for initial placement
        screenX: e.clientX,
        screenY: e.clientY,
      });
      
      // Broadcast our zoom level
      provider.awareness.setLocalStateField('zoom', map.getZoom());
      
      provider.awareness.setLocalStateField('sel', [...selected]);
    };
    
    const leave = () => {
      provider.awareness.setLocalStateField('cursor', null);
      provider.awareness.setLocalStateField('zoom', null);
    };
    
    // Track last known screen position
    let lastScreenX = 0;
    let lastScreenY = 0;
    
    // Update cursor position when map moves (pan/zoom)
    const updateOnMapMove = () => {
      // If we have a last known screen position, update the geographic position
      // This handles the case where the map moves but the mouse doesn't
      if (lastScreenX && lastScreenY) {
        const point = map.unproject([lastScreenX, lastScreenY]);
        provider.awareness.setLocalStateField('cursor', {
          lng: point.lng,
          lat: point.lat,
          screenX: lastScreenX,
          screenY: lastScreenY,
        });
      }
      
      // Update zoom
      provider.awareness.setLocalStateField('zoom', map.getZoom());
    };
    
    window.addEventListener('pointermove', updateCursor);
    window.addEventListener('pointerleave', leave);
    
    // Listen to map move events (pan and zoom)
    map.on('move', updateOnMapMove);
    map.on('zoom', updateOnMapMove);
    
    // Initial sync
    updateOnMapMove();
    
    return () => {
      window.removeEventListener('pointermove', updateCursor);
      window.removeEventListener('pointerleave', leave);
      map.off('move', updateOnMapMove);
      map.off('zoom', updateOnMapMove);
      // Clear cursor on unmount
      provider.awareness.setLocalStateField('cursor', null);
      provider.awareness.setLocalStateField('zoom', null);
    };
  }, [provider, selected]);
}