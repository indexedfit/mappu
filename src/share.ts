import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import { ID } from './identity';

export function makeShareLink(boardId: string, capability: 'edit' | 'view' = 'edit'): string {
  const baseUrl = `${window.location.origin}/b/${boardId}`;
  
  const payload = JSON.stringify({
    boardId,
    capability,
    timestamp: Date.now(),
  });
  
  const messageBytes = new TextEncoder().encode(payload);
  const signature = nacl.sign.detached(messageBytes, decodeBase64(ID.priv));
  
  const token = btoa(JSON.stringify({
    payload,
    sig: encodeBase64(signature),
    pub: ID.pub,
  }));
  
  return `${baseUrl}#inv=${token}`;
}

export function verifyInviteToken(token: string, ownerPub: string): { valid: boolean; capability?: 'edit' | 'view' } {
  try {
    const decoded = JSON.parse(atob(token));
    const { payload, sig, pub } = decoded;
    
    if (pub !== ownerPub) {
      return { valid: false };
    }
    
    const messageBytes = new TextEncoder().encode(payload);
    const signatureBytes = decodeBase64(sig);
    const publicKeyBytes = decodeBase64(pub);
    
    const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    
    if (valid) {
      const parsedPayload = JSON.parse(payload);
      return { valid: true, capability: parsedPayload.capability };
    }
    
    return { valid: false };
  } catch {
    return { valid: false };
  }
}