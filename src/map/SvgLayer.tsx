import { useEffect } from "react";
import type { RefObject } from "react";
import { useMap } from "./MapContext";
import type { NetworkProvider } from "../types/provider";
import { usePresence } from "./usePresence";
import type { Annotation } from "../hooks/useYAnnotations";
import type { Tool } from "../components/MapCanvas";

// Crosshair cursor from crosshair.svg - scaled to 32x32 and centered
const TARGET_SVG = `
  <g data-cursor="1" transform="scale(2) translate(-8, -8)">
    <path d="M7 7h2v2H7V7zm0-7h2v5H7V0zm0 11h2v5H7v-5zm4-4h5v2h-5V7zM0 7h5v2H0V7z" fill="#ff0088" fill-rule="evenodd"/>
  </g>
`;

interface SvgLayerProps {
  svgRef: RefObject<SVGSVGElement | null>;
  annotations: Annotation[];
  selected: Set<string>;
  provider: NetworkProvider | null;
  tool: Tool;
}

export default function SvgLayer({
  svgRef,
  annotations,
  selected,
  provider,
  tool,
}: SvgLayerProps) {
  const map = useMap();
  
  // Track presence for awareness
  usePresence(provider, selected);

  // Initialize arrow defs
  useEffect(() => {
    if (!svgRef.current) return;

    if (!svgRef.current.querySelector("#arrow")) {
      const defs = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "defs",
      );
      defs.innerHTML = `
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 Z" fill="#00ff88"/>
        </marker>
        <marker id="arrow-selected" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 Z" fill="#ff0088"/>
        </marker>
      `;
      svgRef.current.appendChild(defs);
    }
  }, [svgRef]);

  // Render annotations
  useEffect(() => {
    if (!map || !svgRef.current) return;

    const svg = svgRef.current;

    const render = () => {
      const keep = new Set<string>();

      annotations.forEach((ev) => {
        keep.add(ev.id);
        let el = svg.querySelector<SVGElement>(`[id="${ev.id}"]`);
        if (!el) {
          const tag =
            ev.type === "text" ? "text" : ev.type === "line" ? "line" : ev.type;
          el = document.createElementNS("http://www.w3.org/2000/svg", tag);
          el.id = ev.id;
          el.dataset.anno = "1";
          svg.appendChild(el);
        }
        
        // Update pointer events based on current tool
        // Only make annotations clickable in cursor mode
        // In drawing modes, annotations should not block pointer events
        el.style.pointerEvents = tool === "cursor" ? "all" : "none";
        el.style.cursor = tool === "cursor" ? "pointer" : "default";

        // style
        if (ev.type !== "text") {
          el.setAttribute("fill", "none");
          el.setAttribute(
            "stroke",
            selected.has(ev.id) ? "#ff0088" : "#00ff88",
          );

          // Use consistent stroke width for all shapes
          el.setAttribute("stroke-width", "2");
          if (ev.type === "rect" || ev.type === "line")
            el.setAttribute("stroke-dasharray", "4 2");
        } else {
          el.setAttribute("fill", "#00ff88");
          // Calculate font size that scales with map
          const baseSize = 14; // Base font size in pixels
          const creationZoom = (ev as any).zoom || 10; // Default to zoom 10 if not stored
          const currentZoom = map.getZoom();
          // Scale based on zoom difference from creation time
          const zoomScale = Math.pow(2, currentZoom - creationZoom);
          const fontSize = baseSize * zoomScale;
          el.setAttribute(
            "font-size",
            `${Math.max(1, Math.min(fontSize, 200))}`,
          );
        }

        // geometry
        if (ev.type === "rect") {
          const p1 = map.project([ev.west, ev.north]);
          const p2 = map.project([ev.east, ev.south]);
          el.setAttribute("x", `${p1.x}`);
          el.setAttribute("y", `${p1.y}`);
          el.setAttribute("width", `${p2.x - p1.x}`);
          el.setAttribute("height", `${p2.y - p1.y}`);
        } else if (ev.type === "circle") {
          const c = map.project([ev.lng, ev.lat]);
          const edge = map.project([ev.lng + ev.rLng, ev.lat + ev.rLat]);
          const r = Math.hypot(edge.x - c.x, edge.y - c.y);
          el.setAttribute("cx", `${c.x}`);
          el.setAttribute("cy", `${c.y}`);
          el.setAttribute("r", `${r}`);
        } else if (ev.type === "line") {
          const p1 = map.project([ev.lng1, ev.lat1]);
          const p2 = map.project([ev.lng2, ev.lat2]);
          el.setAttribute("x1", `${p1.x}`);
          el.setAttribute("y1", `${p1.y}`);
          el.setAttribute("x2", `${p2.x}`);
          el.setAttribute("y2", `${p2.y}`);

          // Remove marker and create arrow head as a path
          el.removeAttribute("marker-end");

          // Calculate arrow head
          const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          const arrowLength = 10; // Fixed size arrow head
          const arrowAngle = Math.PI / 6; // 30 degrees

          // Arrow head points
          const arrowTip = p2;
          const arrowLeft = {
            x: arrowTip.x - arrowLength * Math.cos(angle - arrowAngle),
            y: arrowTip.y - arrowLength * Math.sin(angle - arrowAngle),
          };
          const arrowRight = {
            x: arrowTip.x - arrowLength * Math.cos(angle + arrowAngle),
            y: arrowTip.y - arrowLength * Math.sin(angle + arrowAngle),
          };

          // Create or update arrow head path
          let arrowHead = svg.querySelector(
            `#arrow-head-${ev.id}`,
          ) as SVGPathElement;
          if (!arrowHead) {
            arrowHead = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "path",
            );
            arrowHead.id = `arrow-head-${ev.id}`;
            arrowHead.dataset.anno = "1";
            svg.appendChild(arrowHead);
          }

          arrowHead.setAttribute(
            "d",
            `M ${arrowLeft.x} ${arrowLeft.y} L ${arrowTip.x} ${arrowTip.y} L ${arrowRight.x} ${arrowRight.y} Z`,
          );
          arrowHead.setAttribute(
            "fill",
            selected.has(ev.id) ? "#ff0088" : "#00ff88",
          );
          arrowHead.setAttribute("stroke", "none");
          
          // Update pointer events for arrow head too
          arrowHead.style.pointerEvents = tool === "cursor" ? "all" : "none";
          arrowHead.style.cursor = tool === "cursor" ? "pointer" : "default";

          // Add arrow head to keep set
          keep.add(`arrow-head-${ev.id}`);
        } else if (ev.type === "text") {
          const p = map.project([ev.lng, ev.lat]);
          el.textContent = ev.content;
          el.setAttribute("x", `${p.x}`);
          el.setAttribute("y", `${p.y}`);
        }
      });

      // prune deleted
      svg.querySelectorAll<SVGElement>("[data-anno]").forEach((n) => {
        if (!keep.has(n.id)) {
          n.remove();
          // Also remove arrow head if it's a line
          svg.querySelector(`#arrow-head-${n.id}`)?.remove();
        }
      });
    };

    map.on("move", render);
    render();

    return () => {
      map.off("move", render);
    };
  }, [map, svgRef, annotations, selected, tool]);

  // Render awareness cursors
  useEffect(() => {
    if (!svgRef.current || !provider) return;
    const svg = svgRef.current;

    const paint = () => {
      const states = Array.from(provider.awareness.getStates().entries());
      const keep = new Set<string>();
      const localId = provider.awareness.clientID;

      states.forEach((entry) => {
        const [clientId, state] = entry as [number, any];
        // Skip local client
        if (clientId === localId) return;
        
        const { cursor, user, zoom } = state;
        if (!cursor) return;
        
        const id = `cursor-${user?.pub?.slice(0, 8) ?? clientId}`;
        
        // Convert map coordinates to screen coordinates
        let x, y;
        if (cursor.lng !== undefined && cursor.lat !== undefined) {
          const point = map.project([cursor.lng, cursor.lat]);
          x = point.x;
          y = point.y;
        } else {
          // Fallback to screen coordinates if map coords not available
          x = cursor.x || cursor.screenX || 0;
          y = cursor.y || cursor.screenY || 0;
        }
        keep.add(id);

        let g = svg.querySelector(`#${id}`) as SVGGElement;
        if (!g) {
          g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          g.id = id;
          g.innerHTML = TARGET_SVG;
          
          // Color based on user pub key
          const color = user?.pub ? '#' + user.pub.slice(0, 6) : '#ff0088';
          // Color all stroke and fill elements within the cursor
          g.querySelectorAll('[stroke]').forEach(el => {
            el.setAttribute('stroke', color);
          });
          g.querySelectorAll('[fill]:not([fill="none"])').forEach(el => {
            el.setAttribute('fill', color);
          });
          
          svg.appendChild(g);
        }
        const remoteZoom = zoom ?? map.getZoom();
        const localZoom  = map.getZoom();
        // Correct scaling - cursor should appear same size relative to map features
        const scale = Math.pow(2, localZoom - remoteZoom);
        g.setAttribute('transform', `translate(${x},${y}) scale(${scale})`);
      });

      // Remove disconnected cursors
      svg.querySelectorAll('[id^="cursor-"]').forEach(n => {
        if (!keep.has(n.id)) n.remove();
      });
    };

    provider.awareness.on('change', paint);
    paint();
    
    // Also repaint cursors when map moves (pan/zoom)
    const repaintOnMove = () => paint();
    map.on('move', repaintOnMove);

    return () => {
      provider.awareness.off('change', paint);
      map.off('move', repaintOnMove);
      // Clean up all cursors on unmount
      svg.querySelectorAll('[id^="cursor-"]').forEach(n => n.remove());
    };
  }, [provider, svgRef, map]);

  // Handle wheel events on SVG overlay
  useEffect(() => {
    if (!map || !svgRef.current) return;

    const svg = svgRef.current;

    const handleWheel = (e: WheelEvent) => {
      const isPinch = e.ctrlKey || e.metaKey;
      if (isPinch) {
        const dz = -e.deltaY / 80;
        map.zoomTo(map.getZoom() + dz, {
          around: map.unproject([e.clientX, e.clientY]),
          animate: false,
        });
      } else {
        map.panBy([e.deltaX * 1.25, e.deltaY * 1.25], {
          animate: false,
        });
      }
      e.preventDefault();
    };

    svg.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      svg.removeEventListener("wheel", handleWheel);
    };
  }, [map, svgRef]);

  // Always allow pointer events on SVG
  useEffect(() => {
    if (svgRef.current) {
      svgRef.current.style.pointerEvents = "auto";
    }
  }, [svgRef]);

  return null; // This component only manages the SVG content
}
