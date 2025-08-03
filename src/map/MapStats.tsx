import React from 'react';
import { useAnnotations } from '../hooks/useYAnnotations';

export default function MapStats() {
  const { annotations } = useAnnotations();
  const [fps, setFps] = React.useState(0);
  const frameCount = React.useRef(0);
  const lastUpdate = React.useRef(performance.now());

  React.useEffect(() => {
    let animationId: number;
    
    const loop = () => {
      frameCount.current++;
      const now = performance.now();
      const elapsed = now - lastUpdate.current;
      
      // Update FPS every second
      if (elapsed >= 1000) {
        const currentFps = Math.round((frameCount.current * 1000) / elapsed);
        setFps(currentFps);
        frameCount.current = 0;
        lastUpdate.current = now;
      }
      
      animationId = requestAnimationFrame(loop);
    };
    
    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, []);

  return (
    <div className="absolute top-2 right-2 text-xs bg-black/60 text-green-400 px-2 py-1 rounded z-50 pointer-events-none">
      <div>{fps} FPS</div>
      <div>{annotations.length} annos</div>
    </div>
  );
}