import { useRef, useState, useEffect } from "react";
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
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

export type Tool = "cursor" | "rect" | "circle" | "line" | "text";

interface MapCanvasProps {
  ydoc: Y.Doc;
  provider: WebrtcProvider;
  isPersonal?: boolean;
}

function MapContent({ ydoc, provider, isPersonal }: MapCanvasProps) {
  const { annotations } = useAnnotations(ydoc);
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>("cursor");
  const map = useMap();
  const [selected] = useSelection(map, svgRef.current, tool, ydoc);
  useDraw(map, svgRef.current, tool, selected, ydoc, setTool);

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
      <SvgLayer svgRef={svgRef} annotations={annotations} selected={selected} provider={provider} tool={tool} />
      <ShareButton isPersonal={isPersonal} ydoc={ydoc} />
      <Toolbar tool={tool} setTool={setTool} />
      <MapStats ydoc={ydoc} />
      <EventLog ydoc={ydoc} />
    </>
  );
}

export default function MapCanvas({ ydoc, provider, isPersonal = false }: MapCanvasProps) {
  return (
    <MapShell>
      <MapContent ydoc={ydoc} provider={provider} isPersonal={isPersonal} />
    </MapShell>
  );
}