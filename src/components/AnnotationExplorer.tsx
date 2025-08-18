import * as Y from 'yjs';
import { useAnnotations } from '../hooks/useYAnnotations';
import { useYGroups } from '../annotations/groups';

type Props = {
  ydoc: Y.Doc;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
};

export default function AnnotationExplorer({ ydoc, selected, setSelected }: Props) {
  const { annotations } = useAnnotations(ydoc);
  const { all, addGroup, removeGroup, updateGroup } = useYGroups(ydoc);
  const groups = all();

  const groupedIds = new Set(groups.flatMap(g => g.children));
  const ungrouped = annotations.filter(a => !groupedIds.has(a.id));

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelected(next);
  };

  const renameGroup = (id: string) => {
    const name = prompt('Group name?');
    if (!name) return;
    updateGroup(id, { name });
  };

  return (
    <div className="absolute top-2 left-2 translate-x-[-110%] sm:translate-x-0 z-40">
      <div className="bg-black/70 backdrop-blur text-white text-xs w-64 rounded shadow-xl max-h-[60vh] overflow-y-auto p-2">
        <div className="flex items-center justify-between mb-1">
          <div className="font-semibold opacity-80">Explorer</div>
          <button onClick={() => addGroup({ id: crypto.randomUUID(), name: 'Group', children: [] })} className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20">+ Group</button>
        </div>

        {/* Groups */}
        {groups.map(g => (
          <div key={g.id} className="mb-2 border border-white/10 rounded">
            <div className="flex items-center justify-between px-2 py-1 bg-white/5">
              <div className="truncate">{g.name ?? 'Group'} <span className="text-white/40">({g.children.length})</span></div>
              <div className="flex items-center gap-1">
                <button onClick={() => renameGroup(g.id)} title="Rename" className="px-1 rounded hover:bg-white/10">✏️</button>
                <button onClick={() => updateGroup(g.id, { hidden: !g.hidden })} title={g.hidden ? 'Show' : 'Hide'} className="px-1 rounded hover:bg-white/10">{g.hidden ? '👁️‍🗨️' : '👁️'}</button>
                <button onClick={() => updateGroup(g.id, { locked: !g.locked })} title={g.locked ? 'Unlock' : 'Lock'} className="px-1 rounded hover:bg-white/10">{g.locked ? '🔓' : '🔒'}</button>
                <button onClick={() => removeGroup(g.id)} title="Delete group" className="px-1 rounded hover:bg-white/10">🗑</button>
              </div>
            </div>
            <div className="max-h-40 overflow-y-auto">
              {g.children.map(cid => {
                const a = annotations.find(x => x.id === cid);
                if (!a) return null;
                const color = (a as any).color || '#00ff88';
                return (
                  <div key={cid}
                    onClick={() => toggleSelect(cid)}
                    className={`flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-white/5 ${selected.has(cid) ? 'bg-white/10' : ''}`}>
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
                    <span className="truncate">{a.type} #{cid.slice(0,6)}</span>
                  </div>
                );
              })}
              {g.children.length === 0 && (
                <div className="px-2 py-1 text-white/40">Empty</div>
              )}
            </div>
          </div>
        ))}

        {/* Ungrouped */}
        <div className="mt-2">
          <div className="px-2 py-1 font-semibold opacity-80">Ungrouped</div>
          <div className="max-h-40 overflow-y-auto">
            {ungrouped.map(a => {
              const color = (a as any).color || '#00ff88';
              return (
                <div key={a.id}
                  onClick={() => toggleSelect(a.id)}
                  className={`flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-white/5 ${selected.has(a.id) ? 'bg-white/10' : ''}`}>
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="truncate">{a.type} #{a.id.slice(0,6)}</span>
                </div>
              );
            })}
            {ungrouped.length === 0 && (
              <div className="px-2 py-1 text-white/40">No ungrouped items</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}