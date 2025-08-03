import { useNavigate } from 'react-router-dom';
import * as Y from 'yjs';
import { useBoards } from './useBoards';

interface ShareButtonProps {
  isPersonal?: boolean;
  ydoc: Y.Doc;
}

export default function ShareButton({ isPersonal, ydoc }: ShareButtonProps) {
  const navigate = useNavigate();
  const { create } = useBoards();

  const share = () => {
    if (isPersonal) {
      // Duplicate personal doc to new shared board
      const name = prompt('Name this shared copy:', 'My map');
      if (!name) return;
      
      const meta = create(name);
      
      // Clone current Y.Doc state
      const update = Y.encodeStateAsUpdate(ydoc);
      
      // Navigate first
      navigate('/b/' + meta.id);
      
      // Apply update after navigation (provider will be ready)
      setTimeout(() => {
        // The new board's ydoc will be created by BoardRouter
        // We need to apply the update through a different mechanism
        // For now, we'll store it temporarily and apply in BoardRouter
        sessionStorage.setItem(`board-init-${meta.id}`, btoa(String.fromCharCode(...update)));
      }, 0);
    } else {
      // Copy share link to clipboard
      navigator.clipboard.writeText(window.location.href);
      alert('Share link copied to clipboard!');
    }
  };

  return (
    <button
      className="absolute top-12 left-2 z-20 bg-black/60 px-3 py-1 text-white rounded hover:bg-black/70 transition-colors text-sm"
      onClick={share}
    >
      {isPersonal ? '🔗 Share' : '📋 Copy Link'}
    </button>
  );
}