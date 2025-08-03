import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBoards, PERSONAL_ID } from './useBoards';

export default function BoardMenu() {
  const { boards, create } = useBoards();
  const navigate = useNavigate();
  const { boardId } = useParams<{ boardId?: string }>();
  const [open, setOpen] = useState(false);
  
  const currentBoardId = boardId ?? PERSONAL_ID;
  const currentBoard = boards.find(b => b.id === currentBoardId);

  const newBoard = () => {
    const name = prompt('Name this board:', 'Untitled');
    if (!name) return;
    const meta = create(name);
    navigate(`/b/${meta.id}`);
    setOpen(false);
  };

  const switchBoard = (id: string) => {
    if (id === PERSONAL_ID) {
      navigate('/');
    } else {
      navigate(`/b/${id}`);
    }
    setOpen(false);
  };

  return (
    <div className="absolute top-2 right-2 z-40">
      <button 
        className="bg-black/60 px-3 py-1 text-white rounded hover:bg-black/70 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        📂 {currentBoard?.name ?? 'Personal Board'}
      </button>

      {open && (
        <div className="mt-1 bg-black/80 text-sm text-white rounded p-2 w-52 max-h-96 overflow-y-auto">
          <div className="text-xs text-gray-400 px-2 pb-1">Your Boards</div>
          {boards
            .sort((a, b) => b.lastOpened - a.lastOpened)
            .map(b => (
              <div
                key={b.id}
                className={`cursor-pointer px-2 py-1 hover:bg-white/10 rounded flex items-center justify-between ${
                  b.id === currentBoardId ? 'bg-white/5' : ''
                }`}
                onClick={() => switchBoard(b.id)}
              >
                <span className="truncate">{b.name ?? 'Unnamed'}</span>
                {b.personal && <span className="text-xs text-gray-400">local</span>}
              </div>
            ))}
          <hr className="my-1 border-white/20" />
          <button
            className="w-full py-1 bg-green-500/20 hover:bg-green-500/30 rounded transition-colors"
            onClick={newBoard}
          >
            ➕ New board
          </button>
        </div>
      )}
    </div>
  );
}