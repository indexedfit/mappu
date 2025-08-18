import React from 'react';

/**
 * Prevents browser/page zoom when the user pinches (trackpad) or performs iOS gesture events.
 * We attach on window in capture phase with passive:false so preventDefault actually works.
 */
export function usePageZoomGuard(root?: HTMLElement | null) {
  React.useEffect(() => {
    const withinRoot = (target: EventTarget | null) => {
      if (!root) return true; // full screen app; block anyway
      if (!(target instanceof Node)) return false;
      return root.contains(target);
    };

    const onWheel = (e: WheelEvent) => {
      // Trackpad pinch → wheel with ctrl/meta
      if ((e.ctrlKey || e.metaKey) && withinRoot(e.target)) {
        e.preventDefault();
      }
    };

    // iOS Safari gesture events
    const onGesture = (e: Event) => {
      e.preventDefault();
    };

    // capture phase, passive:false is critical
    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    // @ts-ignore: gesture events exist on WebKit
    window.addEventListener('gesturestart', onGesture, { passive: false, capture: true });
    // @ts-ignore
    window.addEventListener('gesturechange', onGesture, { passive: false, capture: true });
    // @ts-ignore
    window.addEventListener('gestureend', onGesture, { passive: false, capture: true });

    return () => {
      window.removeEventListener('wheel', onWheel, { capture: true } as any);
      // @ts-ignore
      window.removeEventListener('gesturestart', onGesture, { capture: true } as any);
      // @ts-ignore
      window.removeEventListener('gesturechange', onGesture, { capture: true } as any);
      // @ts-ignore
      window.removeEventListener('gestureend', onGesture, { capture: true } as any);
    };
  }, [root]);
}