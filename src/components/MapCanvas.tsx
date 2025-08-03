import { useRef, useState, useEffect } from "react";
import Toolbar from "./Toolbar";
import { useAnnotations } from "../hooks/useYAnnotations";
import MapShell from "../map/MapShell";
import { useMap } from "../map/MapContext";
import { useSelection } from "../map/useSelection";
import { useDraw } from "../map/useDraw";
import SvgLayer from "../map/SvgLayer";
import MapStats from "../map/MapStats";

export type Tool = "cursor" | "rect" | "circle" | "line" | "text";

function MapContent() {
  const { annotations } = useAnnotations();
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>("cursor");
  const map = useMap();
  const [selected] = useSelection(map, svgRef.current, tool);
  useDraw(map, svgRef.current, tool, selected, setTool);

  // Handle keyboard shortcuts for tool switching
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't process if user is typing in contenteditable
      if ((e.target as Element)?.getAttribute?.('contenteditable') === 'true') return;
      
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
  }, [setTool]);

  return (
    <>
      <svg ref={svgRef} className="absolute inset-0 z-10 w-full h-full" />
      <SvgLayer svgRef={svgRef} annotations={annotations} selected={selected} />
      <Toolbar tool={tool} setTool={setTool} />
      <MapStats />
    </>
  );
}

export default function MapCanvas() {
  return (
    <MapShell>
      <MapContent />
    </MapShell>
  );
}