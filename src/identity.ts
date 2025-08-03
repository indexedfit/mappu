import nacl from 'tweetnacl';
import { encodeBase64 } from 'tweetnacl-util';

const LS_KEY = 'mappu.id_ed25519';

export interface Identity {
  pub: string;   // base64
  priv: string;  // base64
  name: string;  // editable later
}

export function loadIdentity(): Identity {
  const cached = localStorage.getItem(LS_KEY);
  if (cached) return JSON.parse(cached);
  
  const { publicKey, secretKey } = nacl.sign.keyPair();
  const id: Identity = {
    pub: encodeBase64(publicKey),
    priv: encodeBase64(secretKey),
    name: 'Anonymous',
  };
  localStorage.setItem(LS_KEY, JSON.stringify(id));
  return id;
}

export const ID = loadIdentity();