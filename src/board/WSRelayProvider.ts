// src/board/WSRelayProvider.ts
import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness';
import type { NetworkProvider } from '../types/provider';

function u8ToB64(u8: Uint8Array) { return btoa(String.fromCharCode(...u8)); }
function b64ToU8(b64: string) { return new Uint8Array(atob(b64).split('').map(c => c.charCodeAt(0))); }

type Wire = { t: 'join'; room: string } | { t:'u'|'a'; d:string };

export class WSRelayProvider implements NetworkProvider {
  readonly awareness: Awareness;
  private ws: WebSocket | null = null;
  private room: string;
  private doc: Y.Doc;
  private closed = false;

  constructor(url: string, room: string, doc: Y.Doc) {
    this.room = room;
    this.doc = doc;
    this.awareness = new Awareness(doc);

    // Doc -> network
    const onDoc = (u: Uint8Array) => this.send({ t:'u', d: u8ToB64(u) });
    const onAw  = ({ added, updated, removed }: any) => {
      const changed = added.concat(updated).concat(removed);
      this.send({ t:'a', d: u8ToB64(encodeAwarenessUpdate(this.awareness, changed)) });
    };
    doc.on('update', onDoc);
    this.awareness.on('update', onAw);

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.send({ t: 'join', room: this.room });
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as Wire;
      if (msg.t === 'u') {
        Y.applyUpdate(this.doc, b64ToU8(msg.d));
      } else if (msg.t === 'a') {
        applyAwarenessUpdate(this.awareness, b64ToU8(msg.d), this);
      }
    };
    ws.onclose = () => {
      if (!this.closed) {
        // non-fatal: let caller fallback to P2P if desired
        console.warn('[WSRelay] closed');
      }
    };
    ws.onerror = (e) => {
      console.warn('[WSRelay] error', e);
    };
  }

  private send(m: Wire) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(m));
    }
  }

  destroy() {
    this.closed = true;
    try {
      this.awareness.setLocalState(null);
    } catch {}
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
  }
}