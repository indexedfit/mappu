// server/ws-relay.ts
// Minimal Yjs WebSocket relay with in-memory temporary storage.
// Run:  node server/ws-relay.js  (compile with ts-node/tsx) or build to JS.
// Env:  PORT=8080  TTL_MIN=30  (minutes to keep inactive rooms)

import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';

type Msg =
  | { t: 'join'; room: string }
  | { t: 'u'; d: string }        // base64 Yjs update
  | { t: 'a'; d: string };       // base64 awareness update

interface Room {
  id: string;
  ydoc: Y.Doc;
  awareness: Awareness;
  conns: Set<WebSocket>;
  lastUsed: number;
}

const rooms = new Map<string, Room>();
const TTL_MIN = parseInt(process.env.TTL_MIN || '30', 10);
const server = http.createServer();
const wss = new WebSocketServer({ server });

function getRoom(id: string): Room {
  let r = rooms.get(id);
  if (!r) {
    const ydoc = new Y.Doc();
    const awareness = new Awareness(ydoc);
    r = { id, ydoc, awareness, conns: new Set(), lastUsed: Date.now() };
    rooms.set(id, r);
  }
  r.lastUsed = Date.now();
  return r;
}

function b64uToU8(b64: string) {
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}
function u8ToB64(u8: Uint8Array) {
  return Buffer.from(u8).toString('base64');
}

wss.on('connection', (ws) => {
  let room: Room | null = null;

  const send = (m: Msg) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  };

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw)) as Msg;
      if (msg.t === 'join') {
        room = getRoom(msg.room);
        room.conns.add(ws);

        // Full state sync on join
        const update = encodeStateAsUpdate(room.ydoc);
        send({ t: 'u', d: u8ToB64(update) });

        // Send all awareness states we know about
        const clients = Array.from(room.awareness.getStates().keys());
        if (clients.length) {
          send({ t: 'a', d: u8ToB64(encodeAwarenessUpdate(room.awareness, clients)) });
        }
        return;
      }

      if (!room) return;

      if (msg.t === 'u') {
        const u = b64uToU8(msg.d);
        applyUpdate(room.ydoc, u);
        room.lastUsed = Date.now();
        // Relay to others
        for (const c of room.conns) if (c !== ws && c.readyState === WebSocket.OPEN) {
          c.send(JSON.stringify({ t: 'u', d: msg.d }));
        }
        return;
      }

      if (msg.t === 'a') {
        const u = b64uToU8(msg.d);
        applyAwarenessUpdate(room.awareness, u, ws);
        room.lastUsed = Date.now();
        // Relay to others
        for (const c of room.conns) if (c !== ws && c.readyState === WebSocket.OPEN) {
          c.send(JSON.stringify({ t: 'a', d: msg.d }));
        }
      }
    } catch (e) {
      console.error('WS parse error', e);
    }
  });

  ws.on('close', () => {
    if (!room) return;
    room.conns.delete(ws);
    // Clear awareness for this WS
    try {
      const clientId = (room.awareness as any).clientID as number;
      room.awareness.removeStates([clientId], ws);
    } catch {}
  });
});

setInterval(() => {
  const cutoff = Date.now() - TTL_MIN * 60 * 1000;
  for (const [id, r] of rooms) {
    if (r.conns.size === 0 && r.lastUsed < cutoff) {
      rooms.delete(id);
    }
  }
}, 60_000);

const PORT = parseInt(process.env.PORT || '8080', 10);
server.listen(PORT, () => {
  console.log(`WS relay listening on :${PORT}`);
});