export const GState = {
  Idle: 'idle',
  OneFingerPan: 'oneFingerPan',
  PinchZoom: 'pinchZoom'
} as const;

export type GState = typeof GState[keyof typeof GState];

export interface State {
  kind: GState;
  touches: Map<number, PointerEvent>;
}

export function next(st: State, ev: 'down' | 'move' | 'up', e: PointerEvent): State {
  const touches = new Map(st.touches);

  if (ev === 'down') {
    touches.set(e.pointerId, e);
    
    if (touches.size === 1) {
      return { kind: GState.OneFingerPan, touches };
    } else if (touches.size === 2) {
      return { kind: GState.PinchZoom, touches };
    }
    return { kind: st.kind, touches };
  }

  if (ev === 'up') {
    touches.delete(e.pointerId);
    
    if (touches.size === 0) {
      return { kind: GState.Idle, touches };
    } else if (touches.size === 1) {
      // Transition from pinch to pan - reset the single touch position
      const remaining = Array.from(touches.values())[0];
      touches.set(remaining.pointerId, remaining);
      return { kind: GState.OneFingerPan, touches };
    }
    return { kind: st.kind, touches };
  }

  if (ev === 'move') {
    if (touches.has(e.pointerId)) {
      touches.set(e.pointerId, e);
    }
    
    // Maintain current state based on touch count
    if (touches.size === 1 && st.kind !== GState.OneFingerPan) {
      return { kind: GState.OneFingerPan, touches };
    } else if (touches.size === 2 && st.kind !== GState.PinchZoom) {
      return { kind: GState.PinchZoom, touches };
    }
    
    return { kind: st.kind, touches };
  }

  return st;
}

export function getTouchDistance(touches: Map<number, PointerEvent>): number | null {
  if (touches.size !== 2) return null;
  
  const [t1, t2] = Array.from(touches.values());
  return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
}

export function getTouchCenter(touches: Map<number, PointerEvent>): { x: number; y: number } | null {
  if (touches.size !== 2) return null;
  
  const [t1, t2] = Array.from(touches.values());
  return {
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2
  };
}