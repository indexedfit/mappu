import { useEffect } from 'react';
import type { NetworkProvider } from '../types/provider';

export function usePresence(provider: NetworkProvider, selected: Set<string>) {
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      
      provider.awareness.setLocalStateField('cursor', {
        x: e.clientX,
        y: e.clientY,
      });
      
      // also broadcast our zoom – cheap but effective
      provider.awareness.setLocalStateField('zoom', (window as any).mapRef?.current?.getZoom() ?? 0);
      
      provider.awareness.setLocalStateField('sel', [...selected]);
    };
    
    const leave = () => {
      provider.awareness.setLocalStateField('cursor', null);
      provider.awareness.setLocalStateField('zoom', null);
    };
    
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerleave', leave);
    
    // keep zoom up-to-date
    const map = (window as any).mapRef?.current;
    const syncZoom = () => provider.awareness.setLocalStateField('zoom', map?.getZoom() ?? 0);
    map?.on('zoom', syncZoom);
    syncZoom();
    
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerleave', leave);
      map?.off('zoom', syncZoom);
      // Clear cursor on unmount
      provider.awareness.setLocalStateField('cursor', null);
    };
  }, [provider, selected]);
}