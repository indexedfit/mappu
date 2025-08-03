import React from "react";
import maplibregl from "maplibre-gl";

const PAN_SENSITIVITY = 1.25;
const WHEEL_ZOOM_DIVISOR = 80;
const PINCH_ZOOM_THRESHOLD = 0.03;

export function useGestures(
  map: maplibregl.Map | undefined,
  opts = { enableCustom: true },
) {
  React.useEffect(() => {
    if (!map || !opts.enableCustom) return;

    const c = map.getCanvasContainer();

    // Custom wheel handler for pan/zoom
    const handleWheel = (e: WheelEvent) => {
      const pinch = e.ctrlKey || e.metaKey;
      if (pinch) {
        const dz = -e.deltaY / WHEEL_ZOOM_DIVISOR;
        map.zoomTo(map.getZoom() + dz, {
          around: map.unproject([e.clientX, e.clientY]),
          animate: false,
        });
      } else {
        map.panBy([e.deltaX * PAN_SENSITIVITY, e.deltaY * PAN_SENSITIVITY], {
          animate: false,
        });
      }
      e.preventDefault();
    };

    c.addEventListener("wheel", handleWheel, { passive: false });
    return () => c.removeEventListener("wheel", handleWheel);
  }, [map, opts.enableCustom]);

  // Touch two-finger handler
  React.useEffect(() => {
    if (!map || !opts.enableCustom) return;

    const container = map.getCanvasContainer();
    const touches = new Map<number, PointerEvent>();
    let prevCenter: { x: number; y: number } | undefined;
    let prevDist: number | undefined;
    let prevSingle: PointerEvent | undefined;

    const mid = (a: PointerEvent, b: PointerEvent) => ({
      x: (a.clientX + b.clientX) / 2,
      y: (a.clientY + b.clientY) / 2,
    });
    const dist = (a: PointerEvent, b: PointerEvent) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      touches.set(e.pointerId, e);
      try {
        container.setPointerCapture(e.pointerId);
      } catch (err) {
        // Ignore capture errors in tests
      }
      if (touches.size === 1) {
        prevSingle = e;
      } else if (touches.size === 2) {
        const [p1, p2] = [...touches.values()];
        prevCenter = mid(p1, p2);
        prevDist = dist(p1, p2);
      }
      e.preventDefault();
    };

    const move = (e: PointerEvent) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, e);
      if (touches.size === 1 && prevSingle) {
        // Single finger pan for mobile (works in all modes)
        map.panBy(
          [prevSingle.clientX - e.clientX, prevSingle.clientY - e.clientY],
          {
            animate: false,
          },
        );
        prevSingle = e;
      } else if (touches.size === 2 && prevCenter && prevDist) {
        const [p1, p2] = [...touches.values()];
        const center = mid(p1, p2);
        const d = dist(p1, p2);
        // Pan with two fingers
        map.panBy([prevCenter.x - center.x, prevCenter.y - center.y], {
          animate: false,
        });
        prevCenter = center;
        // Pinch zoom
        const scale = d / prevDist;
        if (Math.abs(scale - 1) > PINCH_ZOOM_THRESHOLD) {
          map.zoomTo(map.getZoom() + Math.log2(scale), {
            around: map.unproject([center.x, center.y]),
            animate: false,
          });
          prevDist = d;
        }
      }
      e.preventDefault();
    };

    const upLeave = (e: PointerEvent) => {
      touches.delete(e.pointerId);
      if (touches.size === 0) {
        prevSingle = undefined;
      } else if (touches.size === 1) {
        // Reset to single touch mode
        const [remaining] = [...touches.values()];
        prevSingle = remaining;
        prevCenter = prevDist = undefined;
      }
      if (touches.size < 2) {
        prevCenter = prevDist = undefined;
      }
    };

    container.addEventListener("pointerdown", down, { passive: false });
    container.addEventListener("pointermove", move, { passive: false });
    ["pointerup", "pointercancel", "pointerleave"].forEach((ev) =>
      container.addEventListener(ev, upLeave as any),
    );
    return () => {
      container.removeEventListener("pointerdown", down);
      container.removeEventListener("pointermove", move);
      ["pointerup", "pointercancel", "pointerleave"].forEach((ev) =>
        container.removeEventListener(ev, upLeave as any),
      );
    };
  }, [map, opts.enableCustom]);
}
