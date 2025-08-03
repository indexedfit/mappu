import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { IndexeddbPersistence } from 'y-indexeddb';
import { useParams } from 'react-router-dom';
import MapCanvas from '../components/MapCanvas';
import { storeLastBoard, PERSONAL_ID, useBoards } from './useBoards';
import { ID } from '../identity';

// Default signaling servers, can be overridden by env var
const DEFAULT_SIGNALS = [
  'wss://signaling.yjs.dev',
  'wss://y-webrtc-signalling-eu.herokuapp.com',
];

const SIGNALS = import.meta.env.VITE_SIGNALING?.split(',') ?? DEFAULT_SIGNALS;
const CURRENT_SCHEMA_VERSION = 1;

interface DocProvider {
  doc: Y.Doc;
  provider: WebrtcProvider;
  persistence: IndexeddbPersistence | null;
}

export default function BoardRouter() {
  const { boardId } = useParams<{ boardId?: string }>();
  const { touch } = useBoards();
  const [docProv, setDocProv] = useState<DocProvider>();

  useEffect(() => {
    // Determine board ID (fallback to personal default)
    const id = boardId ?? PERSONAL_ID;
    const roomName = id === PERSONAL_ID ? 'local-default' : id;

    // Clean up previous doc/provider if exists
    if (docProv) {
      docProv.provider.destroy();
      docProv.doc.destroy();
      docProv.persistence?.destroy();
    }

    // Create new Y.Doc and provider
    const doc = new Y.Doc();
    const provider = new WebrtcProvider(roomName, doc, { 
      signaling: SIGNALS 
    });

    // Set user identity in awareness
    provider.awareness.setLocalStateField('user', {
      pub: ID.pub,
      name: ID.name,
    });

    // Initialize IndexedDB persistence
    let persistence: IndexeddbPersistence | null = null;
    try {
      persistence = new IndexeddbPersistence(roomName, doc);
      
      persistence.on('synced', () => {
        console.log('Content from IndexedDB loaded for board:', roomName);
        
        // Check for initialization data from share/duplicate
        const initData = sessionStorage.getItem(`board-init-${id}`);
        if (initData) {
          try {
            const update = new Uint8Array(atob(initData).split('').map(c => c.charCodeAt(0)));
            Y.applyUpdate(doc, update);
            sessionStorage.removeItem(`board-init-${id}`);
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
        
        // Store owner pub key if this is the first time sharing
        if (id !== PERSONAL_ID && !meta.get('ownerPub')) {
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
    } catch (error) {
      console.warn('Failed to initialize IndexedDB persistence:', error);
    }

    // Store last board for auto-reload (except personal)
    if (id !== PERSONAL_ID) {
      storeLastBoard(id);
      touch(id);
    }

    setDocProv({ doc, provider, persistence });

    // Cleanup on unmount
    return () => {
      provider.destroy();
      doc.destroy();
      persistence?.destroy();
    };
  }, [boardId]);

  if (!docProv) return null;

  return (
    <MapCanvas
      key={boardId ?? PERSONAL_ID}
      ydoc={docProv.doc}
      provider={docProv.provider}
      isPersonal={boardId === undefined}
    />
  );
}