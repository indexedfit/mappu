import { useEffect } from 'react';
import { WebrtcProvider } from 'y-webrtc';

export function usePresence(provider: WebrtcProvider, selected: Set<string>) {
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      
      provider.awareness.setLocalStateField('cursor', {
        x: e.clientX,
        y: e.clientY,
      });
      
      provider.awareness.setLocalStateField('sel', [...selected]);
    };
    
    const leave = () => {
      provider.awareness.setLocalStateField('cursor', null);
    };
    
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerleave', leave);
    
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerleave', leave);
      // Clear cursor on unmount
      provider.awareness.setLocalStateField('cursor', null);
    };
  }, [provider, selected]);
}