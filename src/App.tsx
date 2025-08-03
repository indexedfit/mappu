import { useEffect } from "react";
import { createBrowserRouter, RouterProvider, useNavigate } from "react-router-dom";
import BoardRouter from "./board/BoardRouter";
import BoardMenu from "./board/BoardMenu";
import { loadLastBoard } from "./board/useBoards";

function BoardWrapper() {
  const navigate = useNavigate();
  
  useEffect(() => {
    // Redirect to last board if on root path
    if (window.location.pathname === '/') {
      const lastBoard = loadLastBoard();
      if (lastBoard) {
        navigate(`/b/${lastBoard}`, { replace: true });
      }
    }
  }, [navigate]);

  return (
    <div className="relative h-screen w-screen bg-black overflow-hidden">
      <BoardRouter />
      <BoardMenu />
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <BoardWrapper />,
  },
  {
    path: "/b/:boardId",
    element: <BoardWrapper />,
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
