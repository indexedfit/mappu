import { test, expect, devices } from '@playwright/test';

test.use({
  ...devices['iPhone 13'],
  hasTouch: true,
});

test.describe('Comprehensive Mobile Touch Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.maplibregl-map', { timeout: 10000 });
    await page.waitForTimeout(500);
    
    // Add console log listener
    page.on('console', msg => {
      if (msg.type() === 'log') {
        console.log('Browser log:', msg.text());
      }
    });
  });

  test('debug: check event listeners and pointer-events', async ({ page }) => {
    const debugInfo = await page.evaluate(() => {
      const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement;
      const svg = document.querySelector('svg') as HTMLElement;
      
      return {
        canvasPointerEvents: window.getComputedStyle(canvas).pointerEvents,
        svgPointerEvents: window.getComputedStyle(svg).pointerEvents,
        svgZIndex: window.getComputedStyle(svg).zIndex,
        canvasParent: canvas.parentElement?.className,
        svgPosition: window.getComputedStyle(svg).position
      };
    });
    
    console.log('Debug info:', debugInfo);
    expect(debugInfo.svgPointerEvents).toBe('auto'); // SVG always has pointer-events auto, forwarding is handled in JS
  });

  test('single pan, then zoom, then pan again', async ({ page }) => {
    // Track all centers
    const centers: any[] = [];
    
    // Initial state
    const initial = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return {
        center: map?.getCenter(),
        zoom: map?.getZoom()
      };
    });
    centers.push({ ...initial.center, event: 'initial' });
    
    // First pan
    await page.locator('.maplibregl-canvas').dispatchEvent('pointerdown', {
      pointerType: 'touch',
      clientX: 200,
      clientY: 300,
      pointerId: 1
    });
    
    await page.waitForTimeout(50);
    
    await page.locator('.maplibregl-canvas').dispatchEvent('pointermove', {
      pointerType: 'touch',
      clientX: 100,
      clientY: 200,
      pointerId: 1
    });
    
    await page.waitForTimeout(50);
    
    await page.locator('.maplibregl-canvas').dispatchEvent('pointerup', {
      pointerType: 'touch',
      pointerId: 1
    });
    
    await page.waitForTimeout(200);
    
    const afterPan1 = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return map?.getCenter();
    });
    centers.push({ ...afterPan1, event: 'after-pan-1' });
    
    // Zoom
    await page.locator('.maplibregl-canvas').dispatchEvent('pointerdown', {
      pointerType: 'touch',
      clientX: 150,
      clientY: 300,
      pointerId: 1
    });
    
    await page.locator('.maplibregl-canvas').dispatchEvent('pointerdown', {
      pointerType: 'touch',
      clientX: 250,
      clientY: 300,
      pointerId: 2
    });
    
    await page.waitForTimeout(100);
    
    // Spread fingers
    await page.locator('.maplibregl-canvas').dispatchEvent('pointermove', {
      pointerType: 'touch',
      clientX: 50,
      clientY: 300,
      pointerId: 1
    });
    
    await page.locator('.maplibregl-canvas').dispatchEvent('pointermove', {
      pointerType: 'touch',
      clientX: 350,
      clientY: 300,
      pointerId: 2
    });
    
    await page.waitForTimeout(100);
    
    // Release both fingers
    await page.locator('.maplibregl-canvas').dispatchEvent('pointerup', {
      pointerType: 'touch',
      pointerId: 1
    });
    
    await page.locator('.maplibregl-canvas').dispatchEvent('pointerup', {
      pointerType: 'touch',
      pointerId: 2
    });
    
    await page.waitForTimeout(200);
    
    const afterZoom = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return {
        center: map?.getCenter(),
        zoom: map?.getZoom()
      };
    });
    centers.push({ ...afterZoom.center, event: 'after-zoom' });
    
    // Second pan - this is where it might get stuck
    await page.locator('.maplibregl-canvas').dispatchEvent('pointerdown', {
      pointerType: 'touch',
      clientX: 200,
      clientY: 300,
      pointerId: 3
    });
    
    await page.waitForTimeout(50);
    
    await page.locator('.maplibregl-canvas').dispatchEvent('pointermove', {
      pointerType: 'touch',
      clientX: 300,
      clientY: 400,
      pointerId: 3
    });
    
    await page.waitForTimeout(50);
    
    await page.locator('.maplibregl-canvas').dispatchEvent('pointerup', {
      pointerType: 'touch',
      pointerId: 3
    });
    
    await page.waitForTimeout(200);
    
    const afterPan2 = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return map?.getCenter();
    });
    centers.push({ ...afterPan2, event: 'after-pan-2' });
    
    // Log all centers
    console.log('All centers:', centers);
    console.log('Zoom progression:', initial.zoom, '->', afterZoom.zoom);
    
    // Verify each step worked
    expect(centers[1].lng).not.toBeCloseTo(centers[0].lng, 5); // First pan worked
    expect(afterZoom.zoom).toBeGreaterThan(initial.zoom); // Zoom worked
    expect(centers[3].lng).not.toBeCloseTo(centers[2].lng, 5); // Second pan worked
  });

  test('rapid touch interactions', async ({ page }) => {
    // Test rapid switching between pan and zoom
    const results: any[] = [];
    
    // Quick pan
    await page.locator('.maplibregl-canvas').dispatchEvent('pointerdown', {
      pointerType: 'touch',
      clientX: 200,
      clientY: 300,
      pointerId: 1
    });
    await page.locator('.maplibregl-canvas').dispatchEvent('pointermove', {
      pointerType: 'touch',
      clientX: 150,
      clientY: 250,
      pointerId: 1
    });
    await page.locator('.maplibregl-canvas').dispatchEvent('pointerup', {
      pointerType: 'touch',
      pointerId: 1
    });
    
    await page.waitForTimeout(50);
    
    results.push(await page.evaluate(() => ({
      center: (window as any).mapRef?.current?.getCenter(),
      zoom: (window as any).mapRef?.current?.getZoom(),
      event: 'after-quick-pan'
    })));
    
    // Immediate zoom after pan
    await page.locator('.maplibregl-canvas').dispatchEvent('pointerdown', {
      pointerType: 'touch',
      clientX: 180,
      clientY: 300,
      pointerId: 1
    });
    await page.locator('.maplibregl-canvas').dispatchEvent('pointerdown', {
      pointerType: 'touch',
      clientX: 220,
      clientY: 300,
      pointerId: 2
    });
    await page.locator('.maplibregl-canvas').dispatchEvent('pointermove', {
      pointerType: 'touch',
      clientX: 150,
      clientY: 300,
      pointerId: 1
    });
    await page.locator('.maplibregl-canvas').dispatchEvent('pointermove', {
      pointerType: 'touch',
      clientX: 250,
      clientY: 300,
      pointerId: 2
    });
    await page.locator('.maplibregl-canvas').dispatchEvent('pointerup', {
      pointerType: 'touch',
      pointerId: 1
    });
    await page.locator('.maplibregl-canvas').dispatchEvent('pointerup', {
      pointerType: 'touch',
      pointerId: 2
    });
    
    await page.waitForTimeout(50);
    
    results.push(await page.evaluate(() => ({
      center: (window as any).mapRef?.current?.getCenter(),
      zoom: (window as any).mapRef?.current?.getZoom(),
      event: 'after-quick-zoom'
    })));
    
    console.log('Rapid interaction results:', results);
    
    // Both operations should have worked
    expect(results[0].center).toBeTruthy();
    expect(results[1].zoom).toBeGreaterThan(results[0].zoom);
  });

  test('check SVG interference', async ({ page }) => {
    // Check if SVG is blocking events
    const svgTest = await page.evaluate(async () => {
      const svg = document.querySelector('svg') as HTMLElement;
      const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement;
      
      // Track events
      const events: string[] = [];
      
      const trackEvent = (name: string) => (e: Event) => {
        events.push(`${name}: ${e.type} on ${(e.currentTarget as Element).tagName}`);
      };
      
      svg.addEventListener('pointerdown', trackEvent('svg'), true);
      canvas.addEventListener('pointerdown', trackEvent('canvas'), true);
      
      // Simulate touch on SVG position
      const svgRect = svg.getBoundingClientRect();
      const event = new PointerEvent('pointerdown', {
        clientX: svgRect.left + 100,
        clientY: svgRect.top + 100,
        pointerType: 'touch',
        bubbles: true
      });
      
      svg.dispatchEvent(event);
      
      return {
        events,
        svgPointerEvents: svg.style.pointerEvents,
        svgComputedPointerEvents: window.getComputedStyle(svg).pointerEvents
      };
    });
    
    console.log('SVG interference test:', svgTest);
  });

  test('improved pinch sensitivity with small gestures', async ({ page }) => {
    const initial = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return map?.getZoom();
    });

    // Test very small pinch gesture that should now work
    await page.locator('.maplibregl-canvas').dispatchEvent('pointerdown', {
      pointerType: 'touch',
      clientX: 195,
      clientY: 300,
      pointerId: 1
    });
    
    await page.locator('.maplibregl-canvas').dispatchEvent('pointerdown', {
      pointerType: 'touch',
      clientX: 205,
      clientY: 300,
      pointerId: 2
    });
    
    await page.waitForTimeout(50);
    
    // Very small pinch movement
    await page.locator('.maplibregl-canvas').dispatchEvent('pointermove', {
      pointerType: 'touch',
      clientX: 190,
      clientY: 300,
      pointerId: 1
    });
    
    await page.locator('.maplibregl-canvas').dispatchEvent('pointermove', {
      pointerType: 'touch',
      clientX: 210,
      clientY: 300,
      pointerId: 2
    });
    
    await page.waitForTimeout(100);
    
    await page.locator('.maplibregl-canvas').dispatchEvent('pointerup', {
      pointerType: 'touch',
      pointerId: 1
    });
    
    await page.locator('.maplibregl-canvas').dispatchEvent('pointerup', {
      pointerType: 'touch',
      pointerId: 2
    });
    
    await page.waitForTimeout(200);
    
    const final = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return map?.getZoom();
    });
    
    console.log(`Small pinch test: ${initial} -> ${final}`);
    
    // With improved sensitivity, this small gesture should now work
    expect(final).toBeGreaterThan(initial);
  });
});