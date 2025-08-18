import React from "react";
import maplibregl from "maplibre-gl";

const PAN_SENSITIVITY = 1.25;
const WHEEL_ZOOM_DIVISOR = 80;
const ZOOM_SENSITIVITY = 0.008; // More sensitive
const MIN_PINCH_DISTANCE = 15; // Lower threshold for small gestures

interface TouchState {
  touches: Map<number, PointerEvent>;
  lastCenter?: { x: number; y: number };
  lastDistance?: number;
  lastSingle?: PointerEvent;
}

export function useGestures(
  map: maplibregl.Map | undefined,
  opts = { enableCustom: true },
) {
  // Wheel handler for desktop
  React.useEffect(() => {
    if (!map || !opts.enableCustom) return;
    const container = map.getCanvasContainer();

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (e.ctrlKey || e.metaKey) {
        // Zoom with ctrl/cmd + wheel
        const delta = -e.deltaY / WHEEL_ZOOM_DIVISOR;
        map.zoomTo(map.getZoom() + delta, {
          around: map.unproject([e.clientX, e.clientY]),
          animate: false,
        });
      } else {
        // Pan with wheel
        map.panBy([e.deltaX * PAN_SENSITIVITY, e.deltaY * PAN_SENSITIVITY], {
          animate: false,
        });
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [map, opts.enableCustom]);

  // Touch handler for mobile
  React.useEffect(() => {
    if (!map || !opts.enableCustom) return;
    const container = map.getCanvasContainer();
    
    // iOS Safari still fires gesture*; make sure page never zooms
    const cancelGesture = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    // @ts-ignore
    container.addEventListener('gesturestart', cancelGesture, { passive: false });
    // @ts-ignore
    container.addEventListener('gesturechange', cancelGesture, { passive: false });
    // @ts-ignore
    container.addEventListener('gestureend', cancelGesture, { passive: false });

    const state: TouchState = {
      touches: new Map(),
    };

    const getCenter = (t1: PointerEvent, t2: PointerEvent) => ({
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    });

    const getDistance = (t1: PointerEvent, t2: PointerEvent) => 
      Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      
      // CRITICAL: Always prevent default to stop browser zoom
      e.preventDefault();
      e.stopPropagation();
      
      state.touches.set(e.pointerId, e);
      
      try {
        container.setPointerCapture(e.pointerId);
      } catch {
        // Ignore capture errors
      }

      if (state.touches.size === 1) {
        // Single finger - initialize pan
        state.lastSingle = e;
        state.lastCenter = undefined;
        state.lastDistance = undefined;
      } else if (state.touches.size === 2) {
        // Two fingers - initialize pinch
        const [t1, t2] = Array.from(state.touches.values());
        const distance = getDistance(t1, t2);
        
        if (distance >= MIN_PINCH_DISTANCE) {
          state.lastCenter = getCenter(t1, t2);
          state.lastDistance = distance;
          state.lastSingle = undefined;
        }
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!state.touches.has(e.pointerId)) return;
      
      // CRITICAL: Always prevent default
      e.preventDefault();
      e.stopPropagation();
      
      state.touches.set(e.pointerId, e);

      if (state.touches.size === 1 && state.lastSingle) {
        // Single finger pan
        const deltaX = state.lastSingle.clientX - e.clientX;
        const deltaY = state.lastSingle.clientY - e.clientY;
        
        map.panBy([deltaX, deltaY], { animate: false });
        state.lastSingle = e;
        
      } else if (state.touches.size === 2 && state.lastCenter && state.lastDistance) {
        // Two finger pinch/pan
        const [t1, t2] = Array.from(state.touches.values());
        const center = getCenter(t1, t2);
        const distance = getDistance(t1, t2);
        
        if (distance >= MIN_PINCH_DISTANCE) {
          // Pan based on center movement
          const panDeltaX = state.lastCenter.x - center.x;
          const panDeltaY = state.lastCenter.y - center.y;
          
          if (Math.abs(panDeltaX) > 1 || Math.abs(panDeltaY) > 1) {
            map.panBy([panDeltaX, panDeltaY], { animate: false });
          }
          
          // Zoom based on distance change
          const scale = distance / state.lastDistance;
          const zoomDelta = Math.log2(scale);
          
          if (Math.abs(zoomDelta) > ZOOM_SENSITIVITY) {
            map.zoomTo(map.getZoom() + zoomDelta, {
              around: map.unproject([center.x, center.y]),
              animate: false,
            });
            state.lastDistance = distance;
          }
          
          state.lastCenter = center;
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      // CRITICAL: Always prevent default
      e.preventDefault();
      e.stopPropagation();
      
      state.touches.delete(e.pointerId);

      if (state.touches.size === 0) {
        // No touches - reset all
        state.lastSingle = undefined;
        state.lastCenter = undefined;
        state.lastDistance = undefined;
      } else if (state.touches.size === 1) {
        // Back to single finger - reset for pan
        const remaining = Array.from(state.touches.values())[0];
        state.lastSingle = remaining;
        state.lastCenter = undefined;
        state.lastDistance = undefined;
      } else if (state.touches.size === 2) {
        // Still two fingers - reset pinch state
        const [t1, t2] = Array.from(state.touches.values());
        const distance = getDistance(t1, t2);
        
        if (distance >= MIN_PINCH_DISTANCE) {
          state.lastCenter = getCenter(t1, t2);
          state.lastDistance = distance;
          state.lastSingle = undefined;
        }
      }
    };

    // Add all touch event listeners with passive: false
    container.addEventListener("pointerdown", handlePointerDown, { passive: false });
    container.addEventListener("pointermove", handlePointerMove, { passive: false });
    container.addEventListener("pointerup", handlePointerUp, { passive: false });
    container.addEventListener("pointercancel", handlePointerUp, { passive: false });
    container.addEventListener("pointerleave", handlePointerUp, { passive: false });

    return () => {
      // @ts-ignore
      container.removeEventListener('gesturestart', cancelGesture);
      // @ts-ignore
      container.removeEventListener('gesturechange', cancelGesture);
      // @ts-ignore
      container.removeEventListener('gestureend', cancelGesture);
      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerup", handlePointerUp);
      container.removeEventListener("pointercancel", handlePointerUp);
      container.removeEventListener("pointerleave", handlePointerUp);
    };
  }, [map, opts.enableCustom]);
}
