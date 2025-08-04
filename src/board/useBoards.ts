import { useState, useCallback, useEffect } from 'react';

export interface BoardMeta {
  id: string;
  name: string;
  lastOpened: number;
}

const LS_KEY = 'mappu.boards';

export function allBoards(): BoardMeta[] {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (!stored) {
      return [];
    }
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function saveBoards(arr: BoardMeta[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(arr));
  // Notify all useBoards() hooks about the change
  window.dispatchEvent(new CustomEvent('boardsChanged'));
}

export function storeLastBoard(id: string) {
  localStorage.setItem('mappu.last', id);
}

export function loadLastBoard(): string | undefined {
  return localStorage.getItem('mappu.last') ?? undefined;
}

export function useBoards() {
  const [boards, setBoards] = useState<BoardMeta[]>(allBoards());

  // Listen for boards changes from other components
  useEffect(() => {
    const handleStorageChange = () => {
      setBoards(allBoards());
    };
    
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('boardsChanged', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('boardsChanged', handleStorageChange);
    };
  }, []);

  const create = useCallback((name: string): BoardMeta => {
    const id = crypto.randomUUID();
    const meta = { id, name, lastOpened: Date.now() };
    const next = [...boards, meta];
    saveBoards(next);
    setBoards(next);
    return meta;
  }, [boards]);

  const touch = useCallback((id: string) => {
    setBoards(prev => {
      const next = prev.map(b => b.id === id ? { ...b, lastOpened: Date.now() } : b);
      saveBoards(next);
      return next;
    });
  }, []);

  return { boards, create, touch };
}