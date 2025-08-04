import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';

class BoardStoreClass {
  private cache = new Map<string, { doc: Y.Doc; persistence: IndexeddbPersistence }>();

  open(id?: string) {
    // Use provided id, last board, or bootstrap new one
    const boardId = id ?? localStorage.getItem('last-board') ?? this.bootstrap();
    
    if (!this.cache.has(boardId)) {
      const doc = new Y.Doc({ guid: boardId });
      const persistence = new IndexeddbPersistence(boardId, doc);
      
      // IndexedDB persistence is ready immediately, synced event is for when data loads
      // We don't need to wait for it - the doc will update when data arrives
      this.cache.set(boardId, { doc, persistence });
    }
    
    // Store as last board
    localStorage.setItem('last-board', boardId);
    
    const cached = this.cache.get(boardId)!;
    return { id: boardId, doc: cached.doc };
  }

  private bootstrap(): string {
    const id = crypto.randomUUID();
    localStorage.setItem('last-board', id);
    return id;
  }

  getPersistence(id: string) {
    return this.cache.get(id)?.persistence ?? null;
  }

  // Clean up a specific board
  destroy(id: string) {
    const cached = this.cache.get(id);
    if (cached) {
      cached.persistence.destroy();
      cached.doc.destroy();
      this.cache.delete(id);
    }
  }
}

export const BoardStore = new BoardStoreClass();