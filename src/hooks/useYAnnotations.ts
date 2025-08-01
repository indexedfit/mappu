import { useEffect, useState } from "react";
import { yAnnotations, yLog, type Annotation, type LogEntry } from "../ydoc";

export function useYArray<T>(yarr: any): [T[], (vals: T[]) => void] {
  const [state, setState] = useState<T[]>(yarr.toArray());
  useEffect(() => {
    const sub = () => setState(yarr.toArray());
    yarr.observe(sub);
    return () => yarr.unobserve(sub);
  }, [yarr]);
  return [
    state,
    (vals) => {
      yarr.delete(0, yarr.length);
      yarr.push(vals as any);
    },
  ];
}

export function useAnnotations() {
  const [annotations, setAnnotations] = useYArray<Annotation>(yAnnotations);
  const [, setLog] = useYArray<LogEntry>(yLog);

  const add = (anno: Annotation) => {
    yAnnotations.push([anno]);
    yLog.push([
      { id: anno.id, ts: Date.now(), user: "me", msg: `${anno.type} created` },
    ]);
  };

  const remove = (ids: string[]) => {
    const remaining = annotations.filter((a) => !ids.includes(a.id));
    setAnnotations(remaining);
    yLog.push([
      {
        id: crypto.randomUUID(),
        ts: Date.now(),
        user: "me",
        msg: `deleted ${ids.length} annotation(s)`,
      },
    ]);
  };

  const addChat = (text: string) => {
    yLog.push([
      { id: crypto.randomUUID(), ts: Date.now(), user: "me", msg: text },
    ]);
  };

  return {
    annotations,
    add,
    remove,
    log: yLog.toArray() as LogEntry[],
    addChat,
  };
}
