import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import maplibregl from 'maplibre-gl';
import type { Tool } from '../components/MapCanvas';
import { useAnnotations } from '../hooks/useYAnnotations';

export function useSelection(
  map: maplibregl.Map | null,
  svg: SVGSVGElement | null,
  tool: Tool
): [Set<string>, Dispatch<SetStateAction<Set<string>>>] {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { annotations, remove } = useAnnotations();

  // Handle keyboard shortcuts for deletion
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't process if user is typing in contenteditable
      if ((e.target as Element)?.getAttribute?.('contenteditable') === 'true') return;
      
      // Delete selected annotations
      if ((e.key === "Backspace" || e.key === "Delete") && selected.size) {
        remove([...selected]);
        setSelected(new Set());
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected, remove]);

  // Selection rectangle and annotation selection logic
  useEffect(() => {
    if (!map || !svg || tool !== 'cursor') return;

    let drawing = false;
    let startPoint: { x: number; y: number } | null = null;
    let currentElement: SVGElement | null = null;

    const pointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      
      // Don't process if clicking on contenteditable
      if ((e.target as Element).getAttribute?.('contenteditable') === 'true') return;
      
      // Don't process if clicking on delete button
      const target = e.target as Element;
      if (target.closest('#delete-button')) return;
      
      // For touch events in cursor mode, pass through to map unless clicking annotation
      if (e.pointerType === "touch") {
        if (!target.hasAttribute("data-anno")) {
          // Let the map handle touch events for panning
          return;
        }
      }
      
      const point = { x: e.clientX, y: e.clientY };
      
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
        // Only allow selection rectangle on desktop (mouse/pen), not touch
        if (e.pointerType !== "touch") {
          // Desktop (mouse or pen): immediate selection rectangle
          startPoint = point;
          drawing = true;
          currentElement = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          currentElement.setAttribute("fill", "rgba(0, 255, 136, 0.1)");
          currentElement.setAttribute("stroke", "#00ff88");
          currentElement.setAttribute("stroke-width", "1");
          currentElement.setAttribute("stroke-dasharray", "4 2");
          svg.appendChild(currentElement);
        }
        // Touch: no selection rectangle (matches Figma behavior)
      }
      
      e.preventDefault();
    };

    const pointerMove = (e: PointerEvent) => {
      if (!drawing || !startPoint || !currentElement) return;
      
      const point = { x: e.clientX, y: e.clientY };
      
      // Update selection rectangle
      const x = Math.min(startPoint.x, point.x);
      const y = Math.min(startPoint.y, point.y);
      const width = Math.abs(point.x - startPoint.x);
      const height = Math.abs(point.y - startPoint.y);
      
      currentElement.setAttribute("x", `${x}`);
      currentElement.setAttribute("y", `${y}`);
      currentElement.setAttribute("width", `${width}`);
      currentElement.setAttribute("height", `${height}`);
    };

    const pointerUp = (e: PointerEvent) => {
      const point = { x: e.clientX, y: e.clientY };
      
      if (!drawing) {
        // If we're in cursor mode and clicked on empty space without dragging, clear selection
        if (startPoint && !e.shiftKey) {
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
      }
      
      drawing = false;
      startPoint = null;
      currentElement = null;
    };

    const pointerCancel = (_e?: PointerEvent) => {
      // Remove any in-progress selection rectangle
      if (currentElement && currentElement.parentNode) {
        currentElement.remove();
      }
      
      drawing = false;
      startPoint = null;
      currentElement = null;
    };

    // Track active touch points for proper forwarding
    const activeTouches = new Set<number>();

    // For touch events, forward to canvas for map interaction when appropriate
    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        activeTouches.add(e.pointerId);
        
        // In cursor mode, forward touch events unless interacting with annotations
        const target = e.target as Element;
        if (!target.hasAttribute("data-anno") && !target.closest('#delete-button')) {
          // Forward to canvas for map panning/zooming
          const canvas = map.getCanvasContainer();
          const newEvent = new PointerEvent(e.type, e);
          canvas.dispatchEvent(newEvent);
          
          // Don't process further if forwarding for pan/zoom
          if (activeTouches.size <= 2) {
            e.stopPropagation();
            return;
          }
        }
      }
      pointerDown(e);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" && activeTouches.has(e.pointerId)) {
        if (!drawing) {
          // Forward to canvas
          const canvas = map.getCanvasContainer();
          const newEvent = new PointerEvent(e.type, e);
          canvas.dispatchEvent(newEvent);
          e.stopPropagation();
          return;
        }
      }
      pointerMove(e);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        activeTouches.delete(e.pointerId);
        
        if (!drawing) {
          // Forward to canvas
          const canvas = map.getCanvasContainer();
          const newEvent = new PointerEvent(e.type, e);
          canvas.dispatchEvent(newEvent);
          e.stopPropagation();
          return;
        }
      }
      pointerUp(e);
    };

    const handlePointerCancel = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        activeTouches.delete(e.pointerId);
      }
      pointerCancel(e);
    };

    svg.addEventListener("pointerdown", handlePointerDown);
    svg.addEventListener("pointermove", handlePointerMove);
    svg.addEventListener("pointerup", handlePointerUp);
    svg.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      svg.removeEventListener("pointerdown", handlePointerDown);
      svg.removeEventListener("pointermove", handlePointerMove);
      svg.removeEventListener("pointerup", handlePointerUp);
      svg.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [map, svg, tool, annotations]);

  // Render delete button
  useEffect(() => {
    if (!map || !svg) return;
    
    const containerRef = svg.parentElement;
    if (!containerRef) return;

    const render = () => {
      let selectionBounds: DOMRect | null = null;
      
      // Calculate selection bounds
      selected.forEach(id => {
        const el = svg.querySelector(`[id="${id}"]`);
        if (el) {
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
        const containerRect = containerRef.getBoundingClientRect();
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
  }, [map, svg, selected, remove]);

  return [selected, setSelected];
}