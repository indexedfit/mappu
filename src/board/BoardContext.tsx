import { createContext, useContext } from 'react';
import * as Y from 'yjs';
import type { NetworkProvider } from '../types/provider';

interface BoardContextType {
  ydoc: Y.Doc | null;
  isPersonal: boolean;
  provider: NetworkProvider | null;
  boardId: string;
  setProvider?: (provider: NetworkProvider | null) => void;
}

const BoardContext = createContext<BoardContextType>({ 
  ydoc: null, 
  isPersonal: false,
  provider: null,
  boardId: '',
  setProvider: undefined
});

export const BoardProvider = BoardContext.Provider;
export const useBoardContext = () => useContext(BoardContext);