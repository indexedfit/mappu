import { useState } from 'react';
import * as Y from 'yjs';
import { makeShareLink } from '../share';

interface ShareButtonProps {
  ydoc: Y.Doc;
}

export default function ShareButton({ ydoc }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const share = () => {
    const link = makeShareLink(ydoc.guid);
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