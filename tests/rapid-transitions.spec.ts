import { test, expect, devices } from '@playwright/test';

test.use({
  ...devices['iPhone 13'],
  hasTouch: true,
});

test.describe('Rapid Pan-to-Zoom Transitions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.maplibregl-map', { timeout: 10000 });
    await page.waitForTimeout(500);
  });

  test('rapid pan-to-zoom transition prevents browser zoom', async ({ page }) => {
    // This test specifically targets the bug where rapid transitions 
    // cause browser zoom instead of map zoom

    const initialState = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return {
        zoom: map?.getZoom(),
        center: map?.getCenter(),
        // Get browser zoom level
        browserZoom: window.devicePixelRatio,
        documentZoom: window.document.body.style.zoom || '1'
      };
    });

    console.log('Initial state:', initialState);

    // Quick pan gesture
    await page.evaluate(async () => {
      const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement;
      
      // Start pan
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 200,
        clientY: 300,
        bubbles: true
      }));
      
      await new Promise(r => setTimeout(r, 16)); // One frame
      
      // Pan movement
      canvas.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 150,
        clientY: 250,
        bubbles: true
      }));
    });

    await page.waitForTimeout(30);

    // IMMEDIATELY add second finger for zoom (this is where bug happens)
    await page.evaluate(async () => {
      const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement;
      
      // Add second finger without lifting first
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 2,
        pointerType: 'touch',
        clientX: 250,
        clientY: 350,
        bubbles: true
      }));
      
      await new Promise(r => setTimeout(r, 16)); // One frame
      
      // Rapid pinch movement
      canvas.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 100,
        clientY: 200,
        bubbles: true
      }));
      
      canvas.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 2,
        pointerType: 'touch',
        clientX: 300,
        clientY: 400,
        bubbles: true
      }));
    });

    await page.waitForTimeout(100);

    // End gesture
    await page.evaluate(() => {
      const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement;
      
      canvas.dispatchEvent(new PointerEvent('pointerup', {
        pointerId: 1,
        pointerType: 'touch',
        bubbles: true
      }));
      
      canvas.dispatchEvent(new PointerEvent('pointerup', {
        pointerId: 2,
        pointerType: 'touch',
        bubbles: true
      }));
    });

    await page.waitForTimeout(200);

    const finalState = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return {
        zoom: map?.getZoom(),
        center: map?.getCenter(),
        // Check browser zoom didn't change
        browserZoom: window.devicePixelRatio,
        documentZoom: window.document.body.style.zoom || '1'
      };
    });

    console.log('Final state:', finalState);

    // Map should have changed (pan + zoom worked)
    expect(finalState.zoom).toBeGreaterThan(initialState.zoom);
    expect(finalState.center.lng).not.toBeCloseTo(initialState.center.lng, 3);

    // Browser zoom should NOT have changed (this is the key test)
    expect(finalState.browserZoom).toBe(initialState.browserZoom);
    expect(finalState.documentZoom).toBe(initialState.documentZoom);
    
    // No visual zoom artifacts should be present
    const hasZoomArtifacts = await page.evaluate(() => {
      const body = document.body;
      const computed = window.getComputedStyle(body);
      return computed.transform !== 'none' || 
             computed.zoom !== '1' || 
             body.style.zoom !== '' && body.style.zoom !== '1';
    });
    
    expect(hasZoomArtifacts).toBe(false);
  });

  test('multiple rapid transitions stay reliable', async ({ page }) => {
    const results: any[] = [];

    // Do 3 rapid pan-to-zoom-to-pan cycles
    for (let cycle = 0; cycle < 3; cycle++) {
      // Pan
      await page.evaluate(() => {
        const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement;
        
        canvas.dispatchEvent(new PointerEvent('pointerdown', {
          pointerId: 1,
          pointerType: 'touch',
          clientX: 200,
          clientY: 300,
          bubbles: true
        }));
      });

      await page.waitForTimeout(10);

      await page.evaluate(() => {
        const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement;
        
        canvas.dispatchEvent(new PointerEvent('pointermove', {
          pointerId: 1,
          pointerType: 'touch',
          clientX: 170,
          clientY: 270,
          bubbles: true
        }));
      });

      // Immediately add second finger
      await page.evaluate(() => {
        const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement;
        
        canvas.dispatchEvent(new PointerEvent('pointerdown', {
          pointerId: 2,
          pointerType: 'touch',
          clientX: 230,
          clientY: 330,
          bubbles: true
        }));
      });

      await page.waitForTimeout(10);

      // Pinch
      await page.evaluate(() => {
        const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement;
        
        canvas.dispatchEvent(new PointerEvent('pointermove', {
          pointerId: 1,
          pointerType: 'touch',
          clientX: 140,
          clientY: 240,
          bubbles: true
        }));
        
        canvas.dispatchEvent(new PointerEvent('pointermove', {
          pointerId: 2,
          pointerType: 'touch',
          clientX: 260,
          clientY: 360,
          bubbles: true
        }));
      });

      await page.waitForTimeout(50);

      // End
      await page.evaluate(() => {
        const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement;
        
        canvas.dispatchEvent(new PointerEvent('pointerup', {
          pointerId: 1,
          pointerType: 'touch',
          bubbles: true
        }));
        
        canvas.dispatchEvent(new PointerEvent('pointerup', {
          pointerId: 2,
          pointerType: 'touch',
          bubbles: true
        }));
      });

      await page.waitForTimeout(100);

      const state = await page.evaluate((cycleNum) => {
        const map = (window as any).mapRef?.current;
        return {
          zoom: map?.getZoom(),
          center: map?.getCenter(),
          browserZoom: window.devicePixelRatio,
          cycle: cycleNum
        };
      }, cycle);

      results.push(state);
    }

    console.log('Multiple cycle results:', results);

    // Each cycle should increase zoom and change center
    for (let i = 1; i < results.length; i++) {
      expect(results[i].zoom).toBeGreaterThan(results[i - 1].zoom);
    }

    // Browser zoom should never change
    const allSameBrowserZoom = results.every(r => r.browserZoom === results[0].browserZoom);
    expect(allSameBrowserZoom).toBe(true);
  });
});