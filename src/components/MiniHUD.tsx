import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { useBoardContext } from '../board/BoardContext';
import { useAnnotations } from '../hooks/useYAnnotations';

function useFPS() {
  const [fps, setFps] = useState(0);
  
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animationId: number;
    
    const measureFPS = () => {
      frameCount++;
      const currentTime = performance.now();
      
      if (currentTime >= lastTime + 1000) {
        setFps(Math.round((frameCount * 1000) / (currentTime - lastTime)));
        frameCount = 0;
        lastTime = currentTime;
      }
      
      animationId = requestAnimationFrame(measureFPS);
    };
    
    animationId = requestAnimationFrame(measureFPS);
    
    return () => cancelAnimationFrame(animationId);
  }, []);
  
  return fps;
}

function usePeers(provider: WebrtcProvider | { awareness: any } | null) {
  const [peers, setPeers] = useState(0);
  
  useEffect(() => {
    if (!provider) return;
    
    const updatePeers = () => {
      const states = provider.awareness.getStates();
      // Subtract 1 for self
      setPeers(Math.max(0, states.size - 1));
    };
    
    provider.awareness.on('change', updatePeers);
    updatePeers();
    
    return () => {
      provider.awareness.off('change', updatePeers);
    };
  }, [provider]);
  
  return peers;
}

export default function MiniHUD() {
  const { ydoc, provider } = useBoardContext();
  const fps = useFPS();
  const peers = usePeers(provider);
  const isOnline = provider instanceof WebrtcProvider;
  
  // Always call hooks - just pass a dummy doc if needed
  const [dummyDoc] = useState(() => new Y.Doc());
  const { annotations } = useAnnotations(ydoc || dummyDoc);
  
  // Don't render if no ydoc yet
  if (!ydoc) return null;
  
  return (
    <div className="absolute top-2 right-36 z-40 flex gap-3 bg-zinc-800/70 px-3 py-1.5 rounded text-xs text-white/80 backdrop-blur-sm">
      <span>{fps} fps</span>
      <span>{annotations.length} items</span>
      {isOnline && <span className="text-green-400">{peers} online</span>}
    </div>
  );
}