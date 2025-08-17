import type { Tool } from "./MapCanvas";

interface Props {
  tool: Tool;
  setTool: (t: Tool) => void;
}

export default function Toolbar({ tool, setTool }: Props) {
  const buttons: { tool: Tool; label: string; shortcut: string; title: string }[] = [
    { tool: "cursor", label: "🖱️", shortcut: "E", title: "Move" },
    { tool: "rect", label: "▭", shortcut: "R", title: "Rectangle" },
    { tool: "circle", label: "◯", shortcut: "C", title: "Circle" },
    { tool: "line", label: "／", shortcut: "A", title: "Arrow" },
    { tool: "text", label: "T", shortcut: "T", title: "Text" },
    { tool: "time", label: "🕒", shortcut: "Y", title: "Time pin" },
  ];
  return (
    <div className="absolute top-2 left-2 flex gap-1.5 z-20 bg-black/60 p-1 rounded-md">
      {buttons.map((b) => (
        <button
          key={b.tool}
          title={`${b.title} (${b.shortcut})`}
          onClick={() => setTool(b.tool)}
          className={`relative w-7 h-7 grid place-items-center text-white text-sm cursor-pointer rounded transition-all ${
            b.tool === tool 
              ? "bg-green-500 text-black font-bold" 
              : "hover:bg-white/20"
          }`}
        >
          {b.label}
          <span className="absolute -bottom-0.5 -right-0.5 text-[8px] opacity-60">{b.shortcut}</span>
        </button>
      ))}
    </div>
  );
}
