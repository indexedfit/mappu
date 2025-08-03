import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import type { Tool } from '../components/MapCanvas';
import { useAnnotations } from '../hooks/useYAnnotations';

export function useDraw(
  map: maplibregl.Map | null,
  svg: SVGSVGElement | null,
  tool: Tool,
  _selected: Set<string>,
  onToolChange?: (tool: Tool) => void
) {
  const { add } = useAnnotations();

  useEffect(() => {
    if (!map || !svg) return;
    if (tool === 'cursor') return; // Selection logic is in useSelection

    let drawing = false;
    let startPoint: { x: number; y: number } | null = null;
    let currentElement: SVGElement | null = null;

    const pointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      
      // Don't process if clicking on contenteditable
      if ((e.target as Element).getAttribute?.('contenteditable') === 'true') return;
      
      // Don't process if clicking on delete button or annotation
      const target = e.target as Element;
      if (target.closest('#delete-button') || target.hasAttribute('data-anno')) return;
      
      const point = { x: e.clientX, y: e.clientY };
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
          } else if (e.key === "Escape") {
            e.preventDefault();
            foreignObj.remove();
            // Switch back to cursor tool
            if (onToolChange) {
              onToolChange('cursor');
            }
          }
        });
        
        div.addEventListener("blur", saveText);
        
        return;
      }
      
      if (currentElement) svg.appendChild(currentElement);
      e.preventDefault();
    };

    const pointerMove = (e: PointerEvent) => {
      if (!drawing || !startPoint || !currentElement) return;
      
      const point = { x: e.clientX, y: e.clientY };
      
      if (tool === "rect") {
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
    };

    const pointerUp = (e: PointerEvent) => {
      if (!drawing || !startPoint || !currentElement) return;
      
      const point = { x: e.clientX, y: e.clientY };
      
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
      
      drawing = false;
      startPoint = null;
      currentElement = null;
    };

    const pointerCancel = (_e?: PointerEvent) => {
      // Remove any in-progress drawing
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
  }, [map, svg, tool, add, onToolChange]);
}