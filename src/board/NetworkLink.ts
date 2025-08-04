import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import * as awarenessProtocol from 'y-protocols/awareness';
import { ID } from '../identity';

// Default signaling servers
const DEFAULT_SIGNALS = [
  'wss://signaling.yjs.dev',
  'wss://y-webrtc-signalling-eu.herokuapp.com',
];

const SIGNALS = import.meta.env.VITE_SIGNALING?.split(',') ?? DEFAULT_SIGNALS;

class NetworkLinkClass {
  private providers = new Map<string, WebrtcProvider>();

  attach(roomId: string, doc: Y.Doc): WebrtcProvider {
    // Clean up existing provider if any
    this.detach(roomId);
    
    // Create new WebRTC provider
    const provider = new WebrtcProvider(roomId, doc, { 
      signaling: SIGNALS 
    });
    
    // Set user identity
    provider.awareness.setLocalStateField('user', {
      pub: ID.pub,
      name: ID.name,
    });
    
    // Add heartbeat for liveness
    provider.awareness.setLocalStateField('ping', Date.now());
    const heartbeat = setInterval(() => {
      provider.awareness.setLocalStateField('ping', Date.now());
    }, 4000);
    
    // Store cleanup function
    (provider as any)._heartbeat = heartbeat;
    
    this.providers.set(roomId, provider);
    return provider;
  }

  detach(roomId: string) {
    const provider = this.providers.get(roomId);
    if (provider) {
      // Clear heartbeat
      const heartbeat = (provider as any)._heartbeat;
      if (heartbeat) clearInterval(heartbeat);
      
      // Destroy provider
      provider.destroy();
      this.providers.delete(roomId);
    }
  }

  get(roomId: string): WebrtcProvider | undefined {
    return this.providers.get(roomId);
  }

  // Create a local-only awareness (no network)
  createLocalAwareness(doc: Y.Doc): { awareness: awarenessProtocol.Awareness; destroy?: () => void } {
    const awareness = new awarenessProtocol.Awareness(doc);
    
    // Set user identity
    awareness.setLocalStateField('user', {
      pub: ID.pub,
      name: ID.name,
    });
    
    // Add heartbeat
    awareness.setLocalStateField('ping', Date.now());
    const heartbeat = setInterval(() => {
      awareness.setLocalStateField('ping', Date.now());
    }, 4000);
    
    return {
      awareness,
      destroy: () => clearInterval(heartbeat)
    };
  }
}

export const NetworkLink = new NetworkLinkClass();