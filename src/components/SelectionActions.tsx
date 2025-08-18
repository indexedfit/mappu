import React from 'react';
import * as Y from 'yjs';
import { useAnnotations } from '../hooks/useYAnnotations';
import { useYGroups } from '../annotations/groups';

const SWATCHES = ['#00ff88', '#ffcc00', '#66a3ff', '#ff66aa', '#ffffff', '#ff7f50', '#8a2be2', '#ffa500'];

type Props = {
  ydoc: Y.Doc;
  selected: Set<string>;
};

export default function SelectionActions({ ydoc, selected }: Props) {
  const ids = React.useMemo(() => [...selected], [selected]);
  const { update, shiftTime, remove } = useAnnotations(ydoc);
  const yMeta = ydoc.getMap<any>('meta');
  const now = (yMeta.get('time.current') as number | null) ?? null;

  // groups
  const { all: groupsAll, addGroup, updateGroup } = useYGroups(ydoc);
  const groups = groupsAll();

  if (ids.length === 0) return null;

  const setColor = (color: string) => update(ids, { color });
  const setTimeToSlider = () => {
    if (now == null) return;
    update(ids, (a: any) => {
      // if a has a range, snap range around current by preserving duration
      if (typeof a.timeStart === 'number' && typeof a.timeEnd === 'number') {
        const dur = a.timeEnd - a.timeStart;
        const half = Math.floor(dur / 2);
        return { ...a, timeStart: now - half, timeEnd: now + (dur - half) };
      }
      // else single time
      return { ...a, time: now };
    });
  };

  const doShift = (ms: number) => shiftTime(ids, ms);

  const addToGroup = (groupId: string) => {
    const g = groups.find(g => g.id === groupId);
    if (!g) return;
    const uniq = Array.from(new Set([...g.children, ...ids]));
    updateGroup(g.id, { children: uniq });
  };

  const createGroupFromSel = () => {
    const id = crypto.randomUUID();
    addGroup({ id, name: 'New Group', children: ids });
  };

  const removeSelected = () => {
    remove(ids);
  };

  // Position: sticky bottom on mobile, top-right on desktop
  return (
    <div className="pointer-events-auto">
      <div className="fixed left-1/2 -translate-x-1/2 bottom-3 sm:bottom-3 sm:left-1/2 z-50">
        <div className="flex items-center gap-2 bg-black/70 backdrop-blur px-3 py-2 rounded text-sm text-white shadow-xl">
          {/* Color */}
          <div className="flex items-center gap-1">
            <span className="opacity-70 pr-1">🎨</span>
            {SWATCHES.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-5 h-5 rounded-full border border-white/30"
                style={{ background: c }}
                title={`Set color ${c}`}
              />
            ))}
          </div>

          <div className="h-5 w-px bg-white/20 mx-1" />

          {/* Time */}
          <div className="flex items-center gap-1">
            <button
              onClick={setTimeToSlider}
              className="px-2 py-1 rounded bg-white/10 hover:bg-white/20"
              title={now ? `Set time = ${new Date(now).toLocaleString()}` : 'Move time to slider'}
              disabled={now == null}
            >
              ⏱ Set = slider
            </button>

            <div className="flex items-center gap-1">
              <button onClick={() => doShift(-3600_000)} className="px-2 py-1 rounded bg-white/10 hover:bg-white/20" title="-1 hour">−1h</button>
              <button onClick={() => doShift(+3600_000)} className="px-2 py-1 rounded bg-white/10 hover:bg-white/20" title="+1 hour">+1h</button>
              <button onClick={() => doShift(-86400_000)} className="px-2 py-1 rounded bg-white/10 hover:bg-white/20" title="-1 day">−1d</button>
              <button onClick={() => doShift(+86400_000)} className="px-2 py-1 rounded bg-white/10 hover:bg-white/20" title="+1 day">+1d</button>
            </div>
          </div>

          <div className="h-5 w-px bg-white/20 mx-1" />

          {/* Groups */}
          <div className="flex items-center gap-1">
            <div className="relative">
              <details>
                <summary className="list-none cursor-pointer px-2 py-1 rounded bg-white/10 hover:bg-white/20">
                  👥 Group
                </summary>
                <div className="absolute left-0 top-8 z-50 bg-black/90 border border-white/10 rounded p-2 min-w-[200px]">
                  <div className="text-xs text-white/60 mb-1">Add selection to…</div>
                  <button onClick={createGroupFromSel} className="w-full text-left px-2 py-1 rounded bg-white/10 hover:bg-white/20 mb-1">➕ New group from selection</button>
                  <div className="max-h-48 overflow-y-auto">
                    {groups.map(g => (
                      <button key={g.id} onClick={() => addToGroup(g.id)} className="w-full text-left px-2 py-1 rounded hover:bg-white/10">
                        {g.name ?? 'Group'} <span className="text-white/40">({g.children.length})</span>
                      </button>
                    ))}
                    {groups.length === 0 && (
                      <div className="px-2 py-1 text-white/40">No groups yet</div>
                    )}
                  </div>
                </div>
              </details>
            </div>
          </div>

          <div className="h-5 w-px bg-white/20 mx-1" />

          {/* Delete */}
          <button onClick={removeSelected} className="px-2 py-1 rounded bg-red-600/60 hover:bg-red-600 text-white">
            🗑 Delete
          </button>
        </div>
      </div>
    </div>
  );
}