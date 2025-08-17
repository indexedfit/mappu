import * as Y from 'yjs';
import type { Group } from './types';

export function useYGroups(ydoc: Y.Doc) {
  const yGroups = ydoc.getArray<Group>('groups');

  const all = () => yGroups.toArray() as Group[];

  const addGroup = (g: Group) => { yGroups.push([g]); };
  const removeGroup = (id: string) => {
    const next = all().filter(g => g.id !== id);
    yGroups.delete(0, yGroups.length);
    yGroups.push(next as any);
  };
  const updateGroup = (id: string, patch: Partial<Group>) => {
    const next = all().map(g => g.id === id ? { ...g, ...patch } : g);
    yGroups.delete(0, yGroups.length);
    yGroups.push(next as any);
  };

  return { yGroups, all, addGroup, removeGroup, updateGroup };
}