import { test, expect, devices } from '@playwright/test';

test.use({
  ...devices['iPhone 13'],
  hasTouch: true,
});

test.describe('Zoom and Pan Reliability Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.maplibregl-map', { timeout: 10000 });
    await page.waitForTimeout(500);
  });

  test('pinch zoom is more sensitive and reliable', async ({ page }) => {
    const initial = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return {
        center: map?.getCenter(),
        zoom: map?.getZoom()
      };
    });

    // Test small pinch gesture (should now work with lower threshold)
    await page.evaluate(() => {
      const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement;
      
      // Start with fingers closer together for smaller gesture
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 190,
        clientY: 300,
        bubbles: true
      }));
      
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 2,
        pointerType: 'touch',
        clientX: 210,
        clientY: 300,
        bubbles: true
      }));
    });

    await page.waitForTimeout(50);

    // Small pinch out - should be detected with new lower threshold
    await page.evaluate(() => {
      const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement;
      
      canvas.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 175,
        clientY: 300,
        bubbles: true
      }));
      
      canvas.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 2,
        pointerType: 'touch',
        clientX: 225,
        clientY: 300,
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

    const afterSmallPinch = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return {
        center: map?.getCenter(),
        zoom: map?.getZoom()
      };
    });

    // Small pinch should now work
    expect(afterSmallPinch.zoom).toBeGreaterThan(initial.zoom);
    console.log(`Small pinch zoom: ${initial.zoom} -> ${afterSmallPinch.zoom}`);
  });

  test('rapid gesture transitions work smoothly', async ({ page }) => {
    const results: any[] = [];

    // Single finger pan
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

    await page.waitForTimeout(30);

    await page.evaluate(() => {
      const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement;
      
      canvas.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 150,
        clientY: 250,
        bubbles: true
      }));
    });

    results.push(await page.evaluate(() => ({
      center: (window as any).mapRef?.current?.getCenter(),
      zoom: (window as any).mapRef?.current?.getZoom(),
      gesture: 'single-pan'
    })));

    // Rapidly add second finger for pinch (no up event for first finger)
    await page.evaluate(() => {
      const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement;
      
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 2,
        pointerType: 'touch',
        clientX: 250,
        clientY: 350,
        bubbles: true
      }));
    });

    await page.waitForTimeout(30);

    // Move both fingers for pinch zoom
    await page.evaluate(() => {
      const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement;
      
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

    results.push(await page.evaluate(() => ({
      center: (window as any).mapRef?.current?.getCenter(),
      zoom: (window as any).mapRef?.current?.getZoom(),
      gesture: 'pinch-zoom'
    })));

    // Rapidly remove one finger, go back to single pan
    await page.evaluate(() => {
      const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement;
      
      canvas.dispatchEvent(new PointerEvent('pointerup', {
        pointerId: 2,
        pointerType: 'touch',
        bubbles: true
      }));
    });

    await page.waitForTimeout(30);

    // Continue single finger pan
    await page.evaluate(() => {
      const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement;
      
      canvas.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 50,
        clientY: 150,
        bubbles: true
      }));
    });

    await page.waitForTimeout(50);

    await page.evaluate(() => {
      const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement;
      
      canvas.dispatchEvent(new PointerEvent('pointerup', {
        pointerId: 1,
        pointerType: 'touch',
        bubbles: true
      }));
    });

    results.push(await page.evaluate(() => ({
      center: (window as any).mapRef?.current?.getCenter(),
      zoom: (window as any).mapRef?.current?.getZoom(),
      gesture: 'back-to-pan'
    })));

    console.log('Rapid transition results:', results);

    // All gestures should have worked
    expect(results).toHaveLength(3);
    expect(results[1].zoom).toBeGreaterThan(results[0].zoom); // Pinch worked
    expect(results[2].center.lng).not.toBeCloseTo(results[1].center.lng, 5); // Final pan worked
  });

  test('extreme pinch gestures are clamped properly', async ({ page }) => {
    const initial = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return map?.getZoom();
    });

    // Start with fingers at minimum distance to trigger pinch mode
    await page.evaluate(() => {
      const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement;
      
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 190,
        clientY: 300,
        bubbles: true
      }));
      
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 2,
        pointerType: 'touch',
        clientX: 210, // 20px apart, above MIN_ZOOM_DISTANCE
        clientY: 300,
        bubbles: true
      }));
    });

    await page.waitForTimeout(50);

    // Extreme distance change
    await page.evaluate(() => {
      const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement;
      
      canvas.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 50,
        clientY: 300,
        bubbles: true
      }));
      
      canvas.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 2,
        pointerType: 'touch',
        clientX: 350,
        clientY: 300,
        bubbles: true
      }));
    });

    await page.waitForTimeout(100);

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

    const final = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return map?.getZoom();
    });

    const zoomDelta = final - initial;
    console.log(`Extreme pinch zoom delta: ${zoomDelta}`);

    // Should zoom but not by an extreme amount (clamped to 0.5 max per gesture)
    expect(zoomDelta).toBeGreaterThan(0);
    expect(zoomDelta).toBeLessThanOrEqual(1.0); // Should be clamped to reasonable amount
  });

  test('minimum zoom distance threshold works', async ({ page }) => {
    const initial = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return map?.getZoom();
    });

    // Start with fingers too close together (below MIN_ZOOM_DISTANCE)
    await page.evaluate(() => {
      const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement;
      
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 200,
        clientY: 300,
        bubbles: true
      }));
      
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 2,
        pointerType: 'touch',
        clientX: 205, // Only 5px apart, below MIN_ZOOM_DISTANCE of 10
        clientY: 300,
        bubbles: true
      }));
    });

    await page.waitForTimeout(50);

    // Try to zoom with very close fingers
    await page.evaluate(() => {
      const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement;
      
      canvas.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 190,
        clientY: 300,
        bubbles: true
      }));
      
      canvas.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 2,
        pointerType: 'touch',
        clientX: 215,
        clientY: 300,
        bubbles: true
      }));
    });

    await page.waitForTimeout(100);

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

    const afterTooClose = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return map?.getZoom();
    });

    // Should not have zoomed because fingers were too close
    expect(afterTooClose).toBeCloseTo(initial, 3);
    console.log(`Too-close gesture: ${initial} -> ${afterTooClose} (should be same)`);
  });

  test('mobile pinch zoom works consistently across sessions', async ({ page }) => {
    // Test multiple zoom gestures in sequence to ensure consistency
    const results: number[] = [];
    
    // Get initial zoom
    let currentZoom = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return map?.getZoom();
    });
    results.push(currentZoom);

    // Perform 3 consecutive zoom gestures
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement;
        
        // Pinch out gesture
        canvas.dispatchEvent(new PointerEvent('pointerdown', {
          pointerId: 1,
          pointerType: 'touch',
          clientX: 180,
          clientY: 300,
          bubbles: true
        }));
        
        canvas.dispatchEvent(new PointerEvent('pointerdown', {
          pointerId: 2,
          pointerType: 'touch',
          clientX: 220,
          clientY: 300,
          bubbles: true
        }));
      });

      await page.waitForTimeout(50);

      await page.evaluate(() => {
        const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement;
        
        canvas.dispatchEvent(new PointerEvent('pointermove', {
          pointerId: 1,
          pointerType: 'touch',
          clientX: 150,
          clientY: 300,
          bubbles: true
        }));
        
        canvas.dispatchEvent(new PointerEvent('pointermove', {
          pointerId: 2,
          pointerType: 'touch',
          clientX: 250,
          clientY: 300,
          bubbles: true
        }));
      });

      await page.waitForTimeout(100);

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

      currentZoom = await page.evaluate(() => {
        const map = (window as any).mapRef?.current;
        return map?.getZoom();
      });
      results.push(currentZoom);
    }

    console.log('Consecutive zoom results:', results);

    // Each zoom should increase the zoom level
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBeGreaterThan(results[i - 1]);
    }
  });
});