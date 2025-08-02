import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import Toolbar from "./Toolbar";
import { useAnnotations } from "../hooks/useYAnnotations";

export type Tool = "cursor" | "rect" | "circle" | "line" | "text";

// Figma‑like interaction tuning
const PAN_SENSITIVITY = 1.25;
const WHEEL_ZOOM_DIVISOR = 80;
const PINCH_ZOOM_THRESHOLD = 0.03;

export default function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { annotations, add, remove } = useAnnotations();

  const [tool, setTool] = useState<Tool>("cursor");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Hold map instance in ref for other hooks
  const mapRef = useRef<maplibregl.Map | null>(null);

  /* ================= Map init ================= */
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          sat: {
            type: "raster",
            tiles: [
              "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            attribution: "Tiles © Esri & contributors",
          },
        },
        layers: [{ id: "sat", type: "raster", source: "sat" }],
      },
      center: [0, 20],
      zoom: 3,
      attributionControl: false,
    });

    mapRef.current = map;
    
    // Expose map for testing
    (window as any).mapRef = mapRef;
    
    // Disable built-in handlers - we'll implement custom ones
    map.dragPan.disable();
    map.scrollZoom.disable();
    map.touchZoomRotate.disable();
    map.doubleClickZoom.enable();
    
    // Custom wheel handler for pan/zoom
    const handleWheel = (e: WheelEvent) => {
      const isPinch = e.ctrlKey || e.metaKey;
      if (isPinch) {
        const dz = -e.deltaY / WHEEL_ZOOM_DIVISOR;
        map.zoomTo(map.getZoom() + dz, {
          around: map.unproject([e.clientX, e.clientY]),
          animate: false
        });
      } else {
        map.panBy([e.deltaX * PAN_SENSITIVITY, e.deltaY * PAN_SENSITIVITY], {
          animate: false
        });
      }
      e.preventDefault();
    };
    
    // Add wheel handler immediately
    const container = map.getCanvasContainer();
    container.addEventListener('wheel', handleWheel, { passive: false });

    /* -------- Arrow defs -------- */
    if (svgRef.current && !svgRef.current.querySelector("#arrow")) {
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

    // Ensure the map size recalculates when parent flexbox finishes
    requestAnimationFrame(() => map.resize());

    return () => {
      const container = map.getCanvasContainer();
      container.removeEventListener('wheel', handleWheel);
      map.remove();
      mapRef.current = null;
    };
  }, []); // Only create map once!

  /* ================= Render annotations ================= */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !svgRef.current) return;
    
    const svg = svgRef.current;
    
    const render = () => {
      const keep = new Set<string>();
      let selectionBounds: DOMRect | null = null;
      
      annotations.forEach((ev) => {
        keep.add(ev.id);
        let el = svg.querySelector<SVGElement>(`[id="${ev.id}"]`);
        if (!el) {
          const tag =
            ev.type === "text" ? "text" : ev.type === "line" ? "line" : ev.type;
          el = document.createElementNS("http://www.w3.org/2000/svg", tag);
          el.id = ev.id;
          el.dataset.anno = "1";
          el.style.pointerEvents = "all";
          el.style.cursor = "pointer";
          svg.appendChild(el);
        }

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
          el.setAttribute("font-size", `${Math.max(1, Math.min(fontSize, 200))}`);
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
            y: arrowTip.y - arrowLength * Math.sin(angle - arrowAngle)
          };
          const arrowRight = {
            x: arrowTip.x - arrowLength * Math.cos(angle + arrowAngle),
            y: arrowTip.y - arrowLength * Math.sin(angle + arrowAngle)
          };
          
          // Create or update arrow head path
          let arrowHead = svg.querySelector(`#arrow-head-${ev.id}`) as SVGPathElement;
          if (!arrowHead) {
            arrowHead = document.createElementNS("http://www.w3.org/2000/svg", "path");
            arrowHead.id = `arrow-head-${ev.id}`;
            arrowHead.dataset.anno = "1";
            svg.appendChild(arrowHead);
          }
          
          arrowHead.setAttribute("d", `M ${arrowLeft.x} ${arrowLeft.y} L ${arrowTip.x} ${arrowTip.y} L ${arrowRight.x} ${arrowRight.y} Z`);
          arrowHead.setAttribute("fill", selected.has(ev.id) ? "#ff0088" : "#00ff88");
          arrowHead.setAttribute("stroke", "none");
          
          // Add arrow head to keep set
          keep.add(`arrow-head-${ev.id}`);
        } else if (ev.type === "text") {
          const p = map.project([ev.lng, ev.lat]);
          el.textContent = ev.content;
          el.setAttribute("x", `${p.x}`);
          el.setAttribute("y", `${p.y}`);
        }
        
        // Update selection bounds
        if (selected.has(ev.id)) {
          const bounds = el.getBoundingClientRect();
          if (!selectionBounds) {
            selectionBounds = bounds;
          } else {
            const left = Math.min(selectionBounds.left, bounds.left);
            const top = Math.min(selectionBounds.top, bounds.top);
            const right = Math.max(selectionBounds.right, bounds.right);
            const bottom = Math.max(selectionBounds.bottom, bounds.bottom);
            selectionBounds = new DOMRect(left, top, right - left, bottom - top);
          }
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
      
      // Handle delete button
      let deleteBtn = svg.querySelector<SVGElement>("#delete-button");
      if (selected.size > 0 && selectionBounds) {
        if (!deleteBtn) {
          // Create delete button group
          const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
          g.id = "delete-button";
          g.style.cursor = "pointer";
          g.style.pointerEvents = "all";
          
          // Background circle - smaller and more subtle
          const bg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          bg.setAttribute("r", "8");
          bg.setAttribute("fill", "#333");
          bg.setAttribute("fill-opacity", "0.8");
          
          // X icon - smaller
          const x1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
          x1.setAttribute("x1", "-3");
          x1.setAttribute("y1", "-3");
          x1.setAttribute("x2", "3");
          x1.setAttribute("y2", "3");
          x1.setAttribute("stroke", "white");
          x1.setAttribute("stroke-width", "1.5");
          x1.setAttribute("stroke-linecap", "round");
          
          const x2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
          x2.setAttribute("x1", "3");
          x2.setAttribute("y1", "-3");
          x2.setAttribute("x2", "-3");
          x2.setAttribute("y2", "3");
          x2.setAttribute("stroke", "white");
          x2.setAttribute("stroke-width", "1.5");
          x2.setAttribute("stroke-linecap", "round");
          
          g.appendChild(bg);
          g.appendChild(x1);
          g.appendChild(x2);
          svg.appendChild(g);
          deleteBtn = g;
        }
        
        // Position delete button at top-right of selection
        const containerRect = containerRef.current!.getBoundingClientRect();
        const x = (selectionBounds as DOMRect).right - containerRect.left + 10;
        const y = (selectionBounds as DOMRect).top - containerRect.top - 10;
        deleteBtn.setAttribute("transform", `translate(${x}, ${y})`);
        
        // Ensure click handler is attached (re-attach in case it was lost)
        deleteBtn.onclick = (e: MouseEvent) => {
          e.stopPropagation();
          e.preventDefault();
          const currentSelected = [...selected];
          remove(currentSelected);
          setSelected(new Set());
        };
      } else if (deleteBtn) {
        deleteBtn.remove();
      }
    };

    map.on("move", render);
    render();

    return () => {
      map.off("move", render);
    };
  }, [annotations, selected, remove]);


  /* ================= Touch gestures like Figma ================= */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
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
        map.panBy([prevSingle.clientX - e.clientX, prevSingle.clientY - e.clientY], {
          animate: false,
        });
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
      if (touches.size === 0) prevSingle = undefined;
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
  }, []);

  /* ================= Keyboard shortcuts ================= */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't process if user is typing in contenteditable
      if ((e.target as Element)?.getAttribute?.('contenteditable') === 'true') return;
      
      // Delete selected annotations
      if ((e.key === "Backspace" || e.key === "Delete") && selected.size) {
        remove([...selected]);
        setSelected(new Set());
        return;
      }
      
      // Tool shortcuts
      const shortcuts: Record<string, Tool> = {
        'e': 'cursor',
        'r': 'rect',
        'c': 'circle',
        'a': 'line',
        't': 'text'
      };
      
      if (shortcuts[e.key.toLowerCase()]) {
        setTool(shortcuts[e.key.toLowerCase()]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected, setTool]);

  /* ================= Drawing interactions ================= */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !svgRef.current) return;
    
    const svg = svgRef.current;
    
    let drawing = false;
    let startPoint: { x: number; y: number } | null = null;
    let currentElement: SVGElement | null = null;
    let holdTimer: NodeJS.Timeout | null = null;
    let hasMoved = false;

    const pointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      
      // Don't process if clicking on contenteditable
      if ((e.target as Element).getAttribute?.('contenteditable') === 'true') return;
      
      // Don't process if clicking on delete button
      const target = e.target as Element;
      if (target.closest('#delete-button')) return;
      
      const point = { x: e.clientX, y: e.clientY };
      
      if (tool === "cursor") {
        // Check if clicking on an annotation
        if (target && target.hasAttribute("data-anno")) {
          const id = target.id;
          if (!e.shiftKey) {
            setSelected(new Set([id]));
          } else {
            setSelected(prev => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            });
          }
          return; // Don't start selection rectangle when clicking annotation
        } else {
          // For desktop (non-touch), start selection immediately. For touch, use hold timer
          hasMoved = false;
          startPoint = point;
          
          if (e.pointerType === "touch") {
            // Touch: hold timer for selection rectangle
            holdTimer = setTimeout(() => {
              if (!hasMoved) {
                // Start selection rectangle after hold
                drawing = true;
                currentElement = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                currentElement.setAttribute("fill", "rgba(0, 255, 136, 0.1)");
                currentElement.setAttribute("stroke", "#00ff88");
                currentElement.setAttribute("stroke-width", "1");
                currentElement.setAttribute("stroke-dasharray", "4 2");
                svg.appendChild(currentElement);
              }
            }, 150); // 150ms hold time like Figma
          } else {
            // Desktop (mouse or pen): immediate selection rectangle
            drawing = true;
            currentElement = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            currentElement.setAttribute("fill", "rgba(0, 255, 136, 0.1)");
            currentElement.setAttribute("stroke", "#00ff88");
            currentElement.setAttribute("stroke-width", "1");
            currentElement.setAttribute("stroke-dasharray", "4 2");
            svg.appendChild(currentElement);
          }
        }
      } else {
        drawing = true;
        startPoint = point;
        
        if (tool === "rect") {
          currentElement = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          currentElement.setAttribute("fill", "none");
          currentElement.setAttribute("stroke", "#00ff88");
          currentElement.setAttribute("stroke-width", "2");
          currentElement.setAttribute("stroke-dasharray", "4 2");
        } else if (tool === "circle") {
          currentElement = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          currentElement.setAttribute("fill", "none");
          currentElement.setAttribute("stroke", "#00ff88");
          currentElement.setAttribute("stroke-width", "2");
        } else if (tool === "line") {
          currentElement = document.createElementNS("http://www.w3.org/2000/svg", "line");
          currentElement.setAttribute("stroke", "#00ff88");
          currentElement.setAttribute("stroke-width", "2");
          currentElement.setAttribute("stroke-dasharray", "4 2");
        } else if (tool === "text") {
          // Don't use regular drawing flow for text
          drawing = false;
          
          // Create text element with contenteditable
          const foreignObj = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
          foreignObj.setAttribute("x", `${point.x}`);
          foreignObj.setAttribute("y", `${point.y - 7}`); // Offset for better positioning
          foreignObj.setAttribute("width", "200");
          foreignObj.setAttribute("height", "30");
          
          const div = document.createElement("div");
          div.contentEditable = "true";
          div.style.cssText = "color: #00ff88; font-size: 14px; font-family: inherit; background: transparent; border: 1px solid #00ff88; outline: none; min-width: 50px; padding: 2px 4px; cursor: text;";
          div.textContent = "";
          
          foreignObj.appendChild(div);
          svg.appendChild(foreignObj);
          
          // Focus after DOM update
          requestAnimationFrame(() => {
            div.focus();
            // Place cursor at the end
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(div);
            range.collapse(false);
            selection?.removeAllRanges();
            selection?.addRange(range);
          });
          
          // Handle Enter key and blur
          const saveText = () => {
            const text = div.textContent?.trim();
            if (text) {
              const id = crypto.randomUUID();
              add({
                id,
                type: "text",
                lng: map.unproject([point.x, point.y]).lng,
                lat: map.unproject([point.x, point.y]).lat,
                content: text,
                zoom: map.getZoom()
              });
            }
            foreignObj.remove();
          };
          
          div.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveText();
            }
          });
          
          div.addEventListener("blur", saveText);
          
          return;
        }
        
        if (currentElement) svg.appendChild(currentElement);
      }
      
      e.preventDefault();
    };

    const pointerMove = (e: PointerEvent) => {
      const point = { x: e.clientX, y: e.clientY };
      
      // Check if moved enough to cancel hold timer (for touch)
      if (tool === "cursor" && holdTimer && startPoint) {
        const dist = Math.hypot(point.x - startPoint.x, point.y - startPoint.y);
        if (dist > 5) {
          hasMoved = true;
          if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
          }
        }
      }
      
      if (!drawing) return;
      
      if (drawing && startPoint && currentElement) {
        if (tool === "cursor") {
          // Update selection rectangle
          const x = Math.min(startPoint.x, point.x);
          const y = Math.min(startPoint.y, point.y);
          const width = Math.abs(point.x - startPoint.x);
          const height = Math.abs(point.y - startPoint.y);
          
          currentElement.setAttribute("x", `${x}`);
          currentElement.setAttribute("y", `${y}`);
          currentElement.setAttribute("width", `${width}`);
          currentElement.setAttribute("height", `${height}`);
        } else if (tool === "rect") {
          const x = Math.min(startPoint.x, point.x);
          const y = Math.min(startPoint.y, point.y);
          const width = Math.abs(point.x - startPoint.x);
          const height = Math.abs(point.y - startPoint.y);
          
          currentElement.setAttribute("x", `${x}`);
          currentElement.setAttribute("y", `${y}`);
          currentElement.setAttribute("width", `${width}`);
          currentElement.setAttribute("height", `${height}`);
        } else if (tool === "circle") {
          const r = Math.hypot(point.x - startPoint.x, point.y - startPoint.y);
          currentElement.setAttribute("cx", `${startPoint.x}`);
          currentElement.setAttribute("cy", `${startPoint.y}`);
          currentElement.setAttribute("r", `${r}`);
        } else if (tool === "line") {
          currentElement.setAttribute("x1", `${startPoint.x}`);
          currentElement.setAttribute("y1", `${startPoint.y}`);
          currentElement.setAttribute("x2", `${point.x}`);
          currentElement.setAttribute("y2", `${point.y}`);
          
          // Create/update temporary arrow head during drag
          let tempArrowHead = svg.querySelector('#temp-arrow-head') as SVGPathElement;
          if (!tempArrowHead) {
            tempArrowHead = document.createElementNS("http://www.w3.org/2000/svg", "path");
            tempArrowHead.id = 'temp-arrow-head';
            svg.appendChild(tempArrowHead);
          }
          
          // Calculate arrow head
          const angle = Math.atan2(point.y - startPoint.y, point.x - startPoint.x);
          const arrowLength = 10; // Fixed size during drag
          const arrowAngle = Math.PI / 6;
          
          const arrowTip = point;
          const arrowLeft = {
            x: arrowTip.x - arrowLength * Math.cos(angle - arrowAngle),
            y: arrowTip.y - arrowLength * Math.sin(angle - arrowAngle)
          };
          const arrowRight = {
            x: arrowTip.x - arrowLength * Math.cos(angle + arrowAngle),
            y: arrowTip.y - arrowLength * Math.sin(angle + arrowAngle)
          };
          
          tempArrowHead.setAttribute("d", `M ${arrowLeft.x} ${arrowLeft.y} L ${arrowTip.x} ${arrowTip.y} L ${arrowRight.x} ${arrowRight.y} Z`);
          tempArrowHead.setAttribute("fill", "#00ff88");
          tempArrowHead.setAttribute("stroke", "none");
        }
      }
    };

    const pointerUp = (e: PointerEvent) => {
      // Clear hold timer if it exists
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      
      const point = { x: e.clientX, y: e.clientY };
      
      if (!drawing) {
        // If we're in cursor mode and clicked on empty space without dragging, clear selection
        if (tool === "cursor" && startPoint && !e.shiftKey) {
          const dist = Math.hypot(point.x - startPoint.x, point.y - startPoint.y);
          if (dist < 5) {
            // Only clear selection if it was a click, not a drag
            const target = e.target as Element;
            if (!target.hasAttribute("data-anno") && !target.closest('#delete-button')) {
              setSelected(new Set());
            }
          }
        }
        startPoint = null;
        return;
      }
      
      if (drawing && startPoint && currentElement) {
        if (tool === "cursor") {
          // Select annotations in rectangle
          const x = Math.min(startPoint.x, point.x);
          const y = Math.min(startPoint.y, point.y);
          const width = Math.abs(point.x - startPoint.x);
          const height = Math.abs(point.y - startPoint.y);
          
          if (width > 5 && height > 5) {
            const rect = { left: x, top: y, right: x + width, bottom: y + height };
            const newSelected = new Set<string>();
            
            annotations.forEach(anno => {
              let bounds: DOMRect | null = null;
              const el = svg.querySelector(`[id="${anno.id}"]`);
              if (el) bounds = el.getBoundingClientRect();
              
              if (bounds && 
                  bounds.left < rect.right && 
                  bounds.right > rect.left && 
                  bounds.top < rect.bottom && 
                  bounds.bottom > rect.top) {
                newSelected.add(anno.id);
              }
            });
            
            setSelected(newSelected);
          } else {
            // Small drag or click - clear selection if not shift
            if (!e.shiftKey) {
              setSelected(new Set());
            }
          }
          
          // Always remove the selection rectangle
          if (currentElement && currentElement.parentNode) {
            currentElement.remove();
          }
        } else {
          // Create annotation
          const id = crypto.randomUUID();
          
          if (tool === "rect") {
            const p1 = map.unproject([Math.min(startPoint.x, point.x), Math.min(startPoint.y, point.y)]);
            const p2 = map.unproject([Math.max(startPoint.x, point.x), Math.max(startPoint.y, point.y)]);
            
            add({
              id,
              type: "rect",
              west: p1.lng,
              north: p1.lat,
              east: p2.lng,
              south: p2.lat,
              zoom: map.getZoom()
            });
          } else if (tool === "circle") {
            const center = map.unproject([startPoint.x, startPoint.y]);
            const edge = map.unproject([point.x, point.y]);
            
            add({
              id,
              type: "circle",
              lng: center.lng,
              lat: center.lat,
              rLng: edge.lng - center.lng,
              rLat: edge.lat - center.lat,
              zoom: map.getZoom()
            });
          } else if (tool === "line") {
            const p1 = map.unproject([startPoint.x, startPoint.y]);
            const p2 = map.unproject([point.x, point.y]);
            
            add({
              id,
              type: "line",
              lng1: p1.lng,
              lat1: p1.lat,
              lng2: p2.lng,
              lat2: p2.lat,
              zoom: map.getZoom()
            });
          }
          
          currentElement.remove();
          
          // Remove temporary arrow head if it exists
          const tempArrowHead = svg.querySelector('#temp-arrow-head');
          if (tempArrowHead) {
            tempArrowHead.remove();
          }
        }
      }
      
      drawing = false;
      startPoint = null;
      currentElement = null;
    };

    // Always allow pointer events on SVG
    svg.style.pointerEvents = "auto";

    const pointerCancel = () => {
      // Clear hold timer if it exists
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      
      // Remove any in-progress selection rectangle
      if (currentElement && currentElement.parentNode) {
        currentElement.remove();
      }
      
      // Remove temporary arrow head if it exists
      const tempArrowHead = svg.querySelector('#temp-arrow-head');
      if (tempArrowHead) {
        tempArrowHead.remove();
      }
      
      drawing = false;
      startPoint = null;
      currentElement = null;
    };

    svg.addEventListener("pointerdown", pointerDown);
    svg.addEventListener("pointermove", pointerMove);
    svg.addEventListener("pointerup", pointerUp);
    svg.addEventListener("pointercancel", pointerCancel);

    return () => {
      svg.removeEventListener("pointerdown", pointerDown);
      svg.removeEventListener("pointermove", pointerMove);
      svg.removeEventListener("pointerup", pointerUp);
      svg.removeEventListener("pointercancel", pointerCancel);
    };
  }, [tool, annotations, selected, add]);

  /* ================= Wheel handler for SVG overlay ================= */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !svgRef.current) return;
    
    const svg = svgRef.current;
    
    const handleWheel = (e: WheelEvent) => {
      const isPinch = e.ctrlKey || e.metaKey;
      if (isPinch) {
        const dz = -e.deltaY / WHEEL_ZOOM_DIVISOR;
        map.zoomTo(map.getZoom() + dz, {
          around: map.unproject([e.clientX, e.clientY]),
          animate: false
        });
      } else {
        map.panBy([e.deltaX * PAN_SENSITIVITY, e.deltaY * PAN_SENSITIVITY], {
          animate: false
        });
      }
      e.preventDefault();
    };
    
    svg.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      svg.removeEventListener('wheel', handleWheel);
    };
  }, []);

  /* ------------ JSX render ------------ */
  return (
    <>
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />
      <svg ref={svgRef} className="absolute inset-0 z-10 w-full h-full" />
      <Toolbar tool={tool} setTool={setTool} />
    </>
  );
}
