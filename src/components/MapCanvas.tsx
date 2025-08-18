import { useRef, useState, useEffect } from "react";
import * as Y from "yjs";
import type { NetworkProvider } from "../types/provider";
import Toolbar from "./Toolbar";
import ShareButton from "../board/ShareButton";
import EventLog from "./EventLog";
import { useAnnotations } from "../hooks/useYAnnotations";
import MapShell from "../map/MapShell";
import { useMap } from "../map/MapContext";
import { useSelection } from "../map/useSelection";
import { useDraw } from "../map/useDraw";
import SvgLayer from "../map/SvgLayer";
import MapStats from "../map/MapStats";
import Timebar from "../time/Timebar";
import SelectionActions from "./SelectionActions";
import AnnotationExplorer from "./AnnotationExplorer";

export type Tool = "cursor" | "rect" | "circle" | "line" | "text" | "time";

interface MapCanvasProps {
  ydoc: Y.Doc;
  provider: NetworkProvider | null;
}

function MapContent({ ydoc, provider }: MapCanvasProps) {
  const { annotations } = useAnnotations(ydoc);
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>("cursor");
  const map = useMap();
  const [selected, setSelected] = useSelection(map, svgRef.current, tool, ydoc);
  useDraw(map, svgRef.current, tool, selected, ydoc, setTool, setSelected);

  // Expose ydoc to Map for time read by SvgLayer
  useEffect(() => {
    const m = (window as any).mapRef?.current;
    if (m) (m as any)._ydoc = ydoc;
  }, [ydoc]);

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
        't': 'text',
        'y': 'time'
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
      <SvgLayer svgRef={svgRef} annotations={annotations} selected={selected} provider={provider} tool={tool} />
      <ShareButton ydoc={ydoc} provider={provider} />
      <Toolbar tool={tool} setTool={setTool} />
      <AnnotationExplorer ydoc={ydoc} selected={selected} setSelected={setSelected} />
      <SelectionActions ydoc={ydoc} selected={selected} />
      <MapStats ydoc={ydoc} />
      <EventLog ydoc={ydoc} />
      <Timebar ydoc={ydoc} />
    </>
  );
}

export default function MapCanvas({ ydoc, provider }: MapCanvasProps) {
  return (
    <MapShell>
      <MapContent ydoc={ydoc} provider={provider} />
    </MapShell>
  );
}