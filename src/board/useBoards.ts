import { useState } from 'react';

export interface BoardMeta {
  id: string;
  name: string;
  lastOpened: number;
  personal?: boolean;  // 'local-default'
}

const LS_KEY = 'mappu.boards';
export const PERSONAL_ID = 'local-default';

export function allBoards(): BoardMeta[] {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (!stored) {
      // Initialize with personal board
      const personal: BoardMeta = {
        id: PERSONAL_ID,
        name: 'Personal Board',
        lastOpened: Date.now(),
        personal: true
      };
      saveBoards([personal]);
      return [personal];
    }
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function saveBoards(arr: BoardMeta[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(arr));
}

export function storeLastBoard(id: string) {
  localStorage.setItem('mappu.last', id);
}

export function loadLastBoard(): string | undefined {
  return localStorage.getItem('mappu.last') ?? undefined;
}

export function useBoards() {
  const [boards, setBoards] = useState<BoardMeta[]>(allBoards());

  const create = (name: string): BoardMeta => {
    const id = crypto.randomUUID();
    const meta = { id, name, lastOpened: Date.now() };
    const next = [...boards, meta];
    saveBoards(next);
    setBoards(next);
    return meta;
  };

  const touch = (id: string) => {
    setBoards(prev => {
      const next = prev.map(b => b.id === id ? { ...b, lastOpened: Date.now() } : b);
      saveBoards(next);
      return next;
    });
  };

  return { boards, create, touch };
}