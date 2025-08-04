import { useState } from 'react';
import * as Y from 'yjs';
import { makeShareLink } from '../share';
import type { NetworkProvider } from '../types/provider';

interface ShareButtonProps {
  ydoc: Y.Doc;
  provider?: NetworkProvider | null;
}

export default function ShareButton({ ydoc, provider }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const share = () => {
    let link = makeShareLink(ydoc.guid);
    
    // Add peer ID if we have a provider with getShareLink method
    if (provider && 'getShareLink' in provider) {
      // Use the provider's share link which includes peer ID
      link = (provider as any).getShareLink();
      // But keep the invite token from makeShareLink
      const invMatch = makeShareLink(ydoc.guid).match(/#inv=([^&]+)/);
      if (invMatch) {
        if (link.includes('#')) {
          link = link.replace(/#/, `#inv=${invMatch[1]}&`);
        } else {
          link += `#inv=${invMatch[1]}`;
        }
      }
    }
    
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      className="absolute top-12 left-2 z-20 bg-black/60 px-3 py-1 text-white rounded hover:bg-black/70 transition-colors text-sm"
      onClick={share}
      data-share-btn
    >
      {copied ? '✓ Copied!' : '📋 Share'}
    </button>
  );
}