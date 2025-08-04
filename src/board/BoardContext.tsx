import { createContext, useContext } from 'react';
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import * as awarenessProtocol from 'y-protocols/awareness';

interface BoardContextType {
  ydoc: Y.Doc | null;
  isPersonal: boolean;
  provider: WebrtcProvider | { awareness: awarenessProtocol.Awareness; destroy?: () => void } | null;
  boardId: string;
  setProvider?: (provider: WebrtcProvider | { awareness: awarenessProtocol.Awareness; destroy?: () => void } | null) => void;
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