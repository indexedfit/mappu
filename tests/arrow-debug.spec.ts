import { test, expect } from '@playwright/test';

test('debug arrow rendering', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.maplibregl-map', { timeout: 10000 });
  await page.waitForTimeout(500);
  
  // Draw an arrow
  await page.click('button:has-text("／")');
  await page.mouse.move(200, 200);
  await page.mouse.down();
  await page.mouse.move(400, 400);
  await page.mouse.up();
  
  // Wait for annotation to be added
  await page.waitForTimeout(500);
  
  // Force multiple renders by zooming
  await page.evaluate(() => {
    const map = (window as any).mapRef?.current;
    if (map) {
      // Zoom in slightly to trigger render
      map.zoomTo(map.getZoom() + 0.1, { animate: false });
    }
  });
  
  await page.waitForTimeout(500);
  
  // Check annotations and SVG content
  const debugInfo = await page.evaluate(() => {
    const svg = document.querySelector('svg');
    const lines = Array.from(svg?.querySelectorAll('line') || []).map(l => ({
      id: l.id,
      stroke: l.getAttribute('stroke'),
      markerEnd: l.getAttribute('marker-end')
    }));
    const allPaths = Array.from(svg?.querySelectorAll('path') || []);
    const paths = allPaths.map(p => ({
      id: p.id,
      stroke: p.getAttribute('stroke'),
      d: p.getAttribute('d')?.substring(0, 30) + '...',
      dataAnno: p.getAttribute('data-anno')
    }));
    
    // Check Y.js annotations
    const annotations = (window as any).yAnnotations?.toArray() || [];
    const lineAnnotations = annotations.filter((a: any) => a.type === 'line');
    
    return { 
      lines, 
      paths, 
      annotationCount: annotations.length,
      lineAnnotations: lineAnnotations.map((a: any) => ({
        id: a.id,
        type: a.type,
        hasCoords: !!(a.lng1 && a.lat1 && a.lng2 && a.lat2)
      }))
    };
  });
  
  console.log('Debug Info:', JSON.stringify(debugInfo, null, 2));
  
  // There should be at least one line
  expect(debugInfo.lines.length).toBeGreaterThan(0);
  
  // There should be an arrow head path
  const arrowHeads = debugInfo.paths.filter(p => p.id.startsWith('arrow-head-'));
  expect(arrowHeads.length).toBeGreaterThan(0);
});