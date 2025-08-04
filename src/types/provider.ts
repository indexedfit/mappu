import type { Awareness } from "y-protocols/awareness";

/**
 * Interface for network providers that handle Yjs synchronization.
 * Compatible with both WebrtcProvider and our custom PeerProvider.
 */
export interface NetworkProvider {
  awareness: Awareness;
  destroy(): void;
}