import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from "y-protocols/awareness";
import { encodeStateAsUpdate, applyUpdate } from "yjs";
import Peer from "peerjs";
import type { DataConnection } from "peerjs";
import { ID } from "../identity";
import type { NetworkProvider } from "../types/provider";

interface YjsMessage {
  t: 'u' | 'a';  // 'u' for Yjs update, 'a' for awareness
  d: ArrayBuffer | Uint8Array;
}

/**
 * Minimal PeerJS <-> Yjs bridge.
 * We keep the surface identical to WebrtcProvider so BoardRouter & hooks stay unchanged.
 */
class PeerProvider implements NetworkProvider {
  readonly awareness: Awareness;
  private readonly doc: Y.Doc;
  private readonly room: string;
  private peer: Peer;
  private conns = new Map<string, DataConnection>();
  private onDestroy: (() => void)[] = [];

  constructor(room: string, doc: Y.Doc) {
    this.doc = doc;
    this.room = room;
    this.awareness = new Awareness(doc);

    // 👤 publish identity once
    this.awareness.setLocalStateField("user", { pub: ID.pub });

    // —— PeerJS bootstrap ——————————————————————————
    const peerId = `${room}-${ID.pub.slice(0, 8)}`;
    this.peer = new Peer(peerId, { debug: 0 });           // default public PeerJS server

    // Outgoing: When we connect we ask existing peers to sync us.
    this.peer.on("open", () => this.discoverPeers());
    this.peer.on("connection", (c: DataConnection) => this.addConn(c));

    // Yjs -> network
    const docListener = (update: Uint8Array) => this.broadcast({ t: "u", d: update });
    const awarenessListener = ({ added, updated, removed }: any) => {
      const changed = added.concat(updated).concat(removed);
      this.broadcast({ t: "a", d: encodeAwarenessUpdate(this.awareness, changed) });
    };
    doc.on("update", docListener);
    this.awareness.on("update", awarenessListener);

    this.onDestroy.push(() => {
      doc.off("update", docListener);
      this.awareness.off("update", awarenessListener);
    });
  }

  /** Ask the signalling server for all peers that start with the room prefix and connect to them. */
  private async discoverPeers() {
    try {
      // @ts-ignore – peer.listAllPeers is unofficial but available on the public server
      const ids: string[] = await this.peer.listAllPeers();
      ids
        .filter(id => id.startsWith(this.room) && id !== this.peer.id)
        .forEach(id => {
          if (!this.conns.has(id)) this.addConn(this.peer.connect(id));
        });
    } catch (_) {
      // non-fatal
    }
  }

  private addConn(conn: DataConnection) {
    if (!conn) return;
    this.conns.set(conn.peer, conn);

    conn.on("data", (msg: unknown) => {
      const message = msg as YjsMessage;
      if (message.t === "u") applyUpdate(this.doc, new Uint8Array(message.d));
      else if (message.t === "a") applyAwarenessUpdate(this.awareness, new Uint8Array(message.d), this);
    });

    conn.once("open", () => {
      // Send full sync once
      conn.send({ t: "u", d: encodeStateAsUpdate(this.doc) });
      conn.send({ t: "a", d: encodeAwarenessUpdate(this.awareness, Array.from(this.awareness.getStates().keys())) });
    });

    conn.on("close", () => this.conns.delete(conn.peer));
    conn.on("error", () => this.conns.delete(conn.peer));
  }

  private broadcast(payload: YjsMessage) {
    this.conns.forEach(c => c.open && c.send(payload));
  }

  destroy() {
    this.awareness.setLocalState(null);         // ← fixes cursor leak!
    this.conns.forEach(c => c.close());
    this.peer.destroy();
    this.onDestroy.forEach(fn => fn());
  }
}

// ————————————————————————— façade identical to the old NetworkLink ——————————————————————————
class NetworkLinkClass {
  private providers = new Map<string, PeerProvider>();
  
  attach(room: string, doc: Y.Doc): PeerProvider {
    this.detach(room);
    const p = new PeerProvider(room, doc);
    this.providers.set(room, p);
    return p;
  }
  
  detach(room: string) {
    this.providers.get(room)?.destroy();
    this.providers.delete(room);
  }
}

export const NetworkLink = new NetworkLinkClass();