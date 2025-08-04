import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from "y-protocols/awareness";
import { encodeStateAsUpdate, applyUpdate } from "yjs";
import Peer from "peerjs";
import type { DataConnection } from "peerjs";
import { ID } from "../identity";
import type { NetworkProvider } from "../types/provider";

interface YjsMessage {
  t: 'u' | 'a' | 'p';  // 'u' for Yjs update, 'a' for awareness, 'p' for peer announcement
  d: ArrayBuffer | Uint8Array | string;
}

/**
 * Minimal PeerJS <-> Yjs bridge.
 * We keep the surface identical to WebrtcProvider so BoardRouter & hooks stay unchanged.
 */
class PeerProvider implements NetworkProvider {
  readonly awareness: Awareness;
  private readonly doc: Y.Doc;
  private readonly room: string;
  private peer: Peer | null = null;
  private conns = new Map<string, DataConnection>();
  private onDestroy: (() => void)[] = [];
  private heartbeatInterval?: NodeJS.Timeout;
  private myPeerId: string;

  constructor(room: string, doc: Y.Doc) {
    this.doc = doc;
    this.room = room;
    this.awareness = new Awareness(doc);
    
    // Create a unique peer ID for this user (not room-based to avoid collisions)
    // Replace special characters to make it PeerJS-compatible
    const safePub = ID.pub.slice(0, 16).replace(/[^a-zA-Z0-9]/g, '');
    this.myPeerId = `mappu_${safePub}_${Date.now()}`;

    // 👤 publish identity once
    this.awareness.setLocalStateField("user", { pub: ID.pub });

    // Initialize PeerJS connection
    this.initializePeer();

    // Yjs -> network
    const docListener = (update: Uint8Array) => this.broadcast({ t: "u", d: update });
    const awarenessListener = ({ added, updated, removed }: any) => {
      const changed = added.concat(updated).concat(removed);
      this.broadcast({ t: "a", d: encodeAwarenessUpdate(this.awareness, changed) });
    };
    doc.on("update", docListener);
    this.awareness.on("update", awarenessListener);

    // Heartbeat to keep awareness alive
    this.heartbeatInterval = setInterval(() => {
      this.awareness.setLocalStateField("ping", Date.now());
    }, 4000);

    this.onDestroy.push(() => {
      doc.off("update", docListener);
      this.awareness.off("update", awarenessListener);
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    });
  }

  private initializePeer() {
    console.log('[PeerJS] Initializing peer with ID:', this.myPeerId);
    
    // Use default PeerJS cloud server with Firefox-compatible settings
    this.peer = new Peer(this.myPeerId, { 
      debug: 1, // Reduced debug level
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ],
        // Firefox-specific settings
        sdpSemantics: 'unified-plan',
        iceCandidatePoolSize: 10
      }
    });

    this.peer.on("open", (id) => {
      console.log('[PeerJS] Connected to signaling server with ID:', id);
      // Store our peer ID for this room so others can find us
      this.registerPeerForRoom();
      // Try to connect to existing peers in the room
      this.connectToRoomPeers();
    });

    this.peer.on("connection", (conn: DataConnection) => {
      console.log('[PeerJS] Incoming connection from:', conn.peer);
      this.addConn(conn);
    });

    this.peer.on("error", (err) => {
      console.error('[PeerJS] Error:', err);
      // Only retry on specific errors
      if (err.type === 'network' || err.type === 'server-error') {
        setTimeout(() => {
          if (this.peer?.destroyed) {
            this.initializePeer();
          }
        }, 5000);
      }
    });

    this.peer.on("disconnected", () => {
      console.log('[PeerJS] Disconnected from signaling server, attempting reconnect...');
      if (this.peer && !this.peer.destroyed) {
        this.peer.reconnect();
      }
    });
  }

  /**
   * Register this peer's ID for the current room in localStorage
   * This allows other peers to discover us
   */
  private registerPeerForRoom() {
    const roomPeersKey = `mappu-room-peers-${this.room}`;
    const roomPeers = JSON.parse(localStorage.getItem(roomPeersKey) || '{}');
    
    // Add our peer ID with a timestamp
    roomPeers[this.myPeerId] = {
      timestamp: Date.now(),
      pub: ID.pub
    };
    
    // Clean up old entries (older than 1 minute)
    const cutoff = Date.now() - 60000;
    Object.keys(roomPeers).forEach(peerId => {
      if (roomPeers[peerId].timestamp < cutoff) {
        delete roomPeers[peerId];
      }
    });
    
    localStorage.setItem(roomPeersKey, JSON.stringify(roomPeers));
    
    // Broadcast our peer ID to existing connections
    this.broadcast({ t: 'p', d: this.myPeerId });
    
    // Re-register periodically to keep entry fresh
    setTimeout(() => {
      if (!this.peer?.destroyed) {
        this.registerPeerForRoom();
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Connect to other peers in the same room
   */
  private connectToRoomPeers() {
    const roomPeersKey = `mappu-room-peers-${this.room}`;
    const roomPeers = JSON.parse(localStorage.getItem(roomPeersKey) || '{}');
    
    console.log('[PeerJS] Found room peers:', Object.keys(roomPeers).length);
    
    // Try to connect to each peer in the room
    Object.keys(roomPeers).forEach(peerId => {
      if (peerId !== this.myPeerId && !this.conns.has(peerId)) {
        console.log('[PeerJS] Attempting to connect to peer:', peerId);
        this.connectToPeer(peerId);
      }
    });
    
    // Also check for peers shared through other mechanisms
    this.connectToSharedPeers();
  }

  /**
   * Try to connect to peers that were shared through the URL or other mechanisms
   */
  private connectToSharedPeers() {
    // Check if there's a peer ID in the URL hash (for direct sharing)
    const hash = window.location.hash;
    const match = hash.match(/peer=([^&]+)/);
    if (match) {
      const sharedPeerId = match[1];
      if (sharedPeerId !== this.myPeerId && !this.conns.has(sharedPeerId)) {
        console.log('[PeerJS] Connecting to shared peer:', sharedPeerId);
        this.connectToPeer(sharedPeerId);
      }
    }
    
    // Check for peer IDs stored from previous sessions
    const knownPeersKey = `mappu-known-peers-${this.room}`;
    const knownPeers = JSON.parse(localStorage.getItem(knownPeersKey) || '[]') as string[];
    
    knownPeers.forEach(peerId => {
      if (peerId !== this.myPeerId && !this.conns.has(peerId)) {
        console.log('[PeerJS] Trying known peer:', peerId);
        this.connectToPeer(peerId);
      }
    });
  }

  /**
   * Connect to a specific peer
   */
  private connectToPeer(peerId: string) {
    if (!this.peer || this.peer.destroyed) return;
    
    try {
      const conn = this.peer.connect(peerId, { 
        reliable: true,
        metadata: { room: this.room, pub: ID.pub }
      });
      
      if (conn) {
        this.addConn(conn);
        
        // Store this peer for future reconnection
        const knownPeersKey = `mappu-known-peers-${this.room}`;
        const knownPeers = JSON.parse(localStorage.getItem(knownPeersKey) || '[]') as string[];
        if (!knownPeers.includes(peerId)) {
          knownPeers.push(peerId);
          // Keep only last 20 peer IDs
          if (knownPeers.length > 20) knownPeers.shift();
          localStorage.setItem(knownPeersKey, JSON.stringify(knownPeers));
        }
      }
    } catch (err) {
      console.error('[PeerJS] Failed to connect to peer:', peerId, err);
    }
  }

  private addConn(conn: DataConnection) {
    if (!conn) return;
    
    console.log('[PeerJS] Adding connection:', conn.peer);
    this.conns.set(conn.peer, conn);

    conn.on("data", (msg: unknown) => {
      const message = msg as YjsMessage;
      if (message.t === "u") {
        applyUpdate(this.doc, new Uint8Array(message.d as ArrayBuffer));
      } else if (message.t === "a") {
        applyAwarenessUpdate(this.awareness, new Uint8Array(message.d as ArrayBuffer), this);
      } else if (message.t === "p") {
        // Peer announcement - try to connect to them
        const peerId = message.d as string;
        if (peerId !== this.myPeerId && !this.conns.has(peerId)) {
          console.log('[PeerJS] Received peer announcement:', peerId);
          this.connectToPeer(peerId);
        }
      }
    });

    conn.on("open", () => {
      console.log('[PeerJS] Connection opened to:', conn.peer);
      
      // Send our peer ID so they can reconnect if needed
      conn.send({ t: 'p', d: this.myPeerId });
      
      // Send full sync
      const stateUpdate = encodeStateAsUpdate(this.doc);
      const awarenessUpdate = encodeAwarenessUpdate(
        this.awareness, 
        Array.from(this.awareness.getStates().keys())
      );
      
      conn.send({ t: "u", d: stateUpdate });
      conn.send({ t: "a", d: awarenessUpdate });
      
      console.log('[PeerJS] Sent initial sync to:', conn.peer);
    });

    conn.on("close", () => {
      console.log('[PeerJS] Connection closed:', conn.peer);
      this.conns.delete(conn.peer);
    });

    conn.on("error", (err) => {
      console.error('[PeerJS] Connection error:', conn.peer, err);
      this.conns.delete(conn.peer);
    });
  }

  private broadcast(payload: YjsMessage) {
    this.conns.forEach((conn) => {
      if (conn.open) {
        conn.send(payload);
      }
    });
  }

  /**
   * Get the share link with our peer ID for direct connection
   */
  getShareLink(): string {
    const currentUrl = new URL(window.location.href);
    // Add our peer ID to enable direct connection
    if (!currentUrl.hash.includes('peer=')) {
      if (currentUrl.hash) {
        currentUrl.hash += `&peer=${this.myPeerId}`;
      } else {
        currentUrl.hash = `peer=${this.myPeerId}`;
      }
    }
    return currentUrl.toString();
  }

  destroy() {
    console.log('[PeerJS] Destroying provider');
    
    // Clean up our registration
    const roomPeersKey = `mappu-room-peers-${this.room}`;
    const roomPeers = JSON.parse(localStorage.getItem(roomPeersKey) || '{}');
    delete roomPeers[this.myPeerId];
    localStorage.setItem(roomPeersKey, JSON.stringify(roomPeers));
    
    this.awareness.setLocalState(null);         // ← fixes cursor leak!
    this.conns.forEach(c => c.close());
    this.conns.clear();
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    
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