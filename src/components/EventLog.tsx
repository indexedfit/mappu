import { useState, useEffect } from "react";
import { useAnnotations } from "../hooks/useYAnnotations";
import type { LogEntry } from "../ydoc";

export default function EventLog() {
  const { log, addChat } = useAnnotations();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const submit = () => {
    if (draft.trim()) {
      addChat(draft.trim());
      setDraft("");
    }
  };
  
  // Keyboard shortcut for L key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't process if user is typing
      if ((e.target as Element)?.tagName === 'INPUT' || 
          (e.target as Element)?.getAttribute?.('contenteditable') === 'true') return;
      
      if (e.key.toLowerCase() === 'l') {
        setOpen(o => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="absolute bottom-4 right-4 z-30 w-72 text-sm">
      <button
        className="mb-1 w-full rounded bg-black/60 py-1 text-white"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Close" : "Open"} Event Log
      </button>
      {open && (
        <div className="flex max-h-80 flex-col overflow-hidden rounded-lg bg-black/90 shadow-2xl border border-gray-700">
          <div className="flex-1 overflow-y-auto p-3 text-gray-300">
            {log.map((e: LogEntry) => (
              <div key={e.id} className="mb-1">
                <span className="mr-1 text-gray-500 text-xs">
                  {new Date(e.ts).toLocaleTimeString()}
                </span>
                {e.msg}
              </div>
            ))}
          </div>
          <div className="flex border-t border-gray-700">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="chat…"
              className="flex-1 px-3 py-2 text-sm bg-transparent text-white placeholder-gray-500 focus:outline-none"
            />
            <button onClick={submit} className="px-3 text-sm font-medium text-green-400 hover:text-green-300">
              ➤
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
