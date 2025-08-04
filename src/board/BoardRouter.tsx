import { useEffect, useState } from 'react';
import type { NetworkProvider } from '../types/provider';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { useParams } from 'react-router-dom';
import MapCanvas from '../components/MapCanvas';
import { storeLastBoard, useBoards } from './useBoards';
import { BoardStore } from './BoardStore';
import { NetworkLink } from './NetworkLink';
import { ID } from '../identity';

const CURRENT_SCHEMA_VERSION = 1;

interface DocProvider {
  doc: Y.Doc;
  provider: NetworkProvider;
  persistence: IndexeddbPersistence | null;
  roomName: string;
}

export default function BoardRouter() {
  const { boardId } = useParams<{ boardId?: string }>();
  const { touch } = useBoards();
  const [docProv, setDocProv] = useState<DocProvider>();

  useEffect(() => {
    if (!boardId) return;

    // Clean up previous doc/provider if exists
    if (docProv) {
      try {
        NetworkLink.detach(docProv.roomName);
        BoardStore.destroy(docProv.roomName);
      } catch (error) {
        console.warn('Error during cleanup:', error);
      }
    }

    // Use BoardStore to get/create Y.Doc and persistence
    const { doc, id: roomName } = BoardStore.open(boardId);
    const provider = NetworkLink.attach(roomName, doc);
    const persistence = BoardStore.getPersistence(roomName);

    // Initialize schema and handle sharing data
    if (persistence) {
      persistence.on('synced', () => {
        console.log('Content from IndexedDB loaded for board:', roomName);
        
        // Check for initialization data from share/duplicate
        const initData = sessionStorage.getItem(`board-init-${boardId}`);
        if (initData) {
          try {
            const update = new Uint8Array(atob(initData).split('').map(c => c.charCodeAt(0)));
            Y.applyUpdate(doc, update);
            sessionStorage.removeItem(`board-init-${boardId}`);
          } catch (error) {
            console.error('Failed to apply initialization data:', error);
          }
        }
        
        // Check and set schema version
        const meta = doc.getMap('meta');
        const ver = meta.get('schemaVersion') as number | undefined ?? 1;
        
        if (ver === CURRENT_SCHEMA_VERSION) {
          // Current version, no migration needed
        } else if (ver > CURRENT_SCHEMA_VERSION) {
          console.warn('Document has newer schema version:', ver);
        }
        
        meta.set('schemaVersion', CURRENT_SCHEMA_VERSION);
        
        // Store owner pub key for sharing
        if (!meta.get('ownerPub')) {
          meta.set('ownerPub', ID.pub);
        }
      });
      
      persistence.on('error', (error: any) => {
        console.error('IndexedDB persistence error:', error);
        if (error.message?.includes('decoder.arr')) {
          console.warn('Clearing corrupted IndexedDB data...');
          persistence?.clearData();
        }
      });
    }

    // Store last board for auto-reload
    storeLastBoard(boardId);
    touch(boardId);

    setDocProv({ doc, provider, persistence, roomName });

    // Cleanup on unmount
    return () => {
      try {
        NetworkLink.detach(roomName);
        BoardStore.destroy(roomName);
      } catch (error) {
        console.warn('Error during unmount cleanup:', error);
      }
    };
  }, [boardId]);

  if (!docProv) return null;

  return (
    <MapCanvas
      key={boardId}
      ydoc={docProv.doc}
      provider={docProv.provider}
    />
  );
}