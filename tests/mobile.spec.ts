import { test, expect, devices } from '@playwright/test';

test.use({
  ...devices['iPhone 13'],
  hasTouch: true,
});

test.describe('Mobile Touch Gestures', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for map to load
    await page.waitForSelector('.maplibregl-map', { timeout: 10000 });
    await page.waitForTimeout(500); // Wait for all handlers to be attached
  });

  test('single finger pan works on mobile', async ({ page }) => {
    // Get initial center
    const initialCenter = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return map?.getCenter();
    });
    
    // Simulate single finger touch pan
    await page.touchscreen.tap(200, 300);
    await page.waitForTimeout(50);
    
    // Simulate touch drag using pointer events
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
    
    // Check center changed
    const newCenter = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return map?.getCenter();
    });
    
    expect(newCenter.lng).not.toBeCloseTo(initialCenter.lng, 5);
    expect(newCenter.lat).not.toBeCloseTo(initialCenter.lat, 5);
  });

  test('pinch zoom works on mobile', async ({ page }) => {
    // Get initial zoom
    const initialZoom = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return map?.getZoom() || 3;
    });
    
    // Simulate pinch zoom directly via evaluate
    await page.evaluate(() => {
      const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement;
      
      // Start touches
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 170,
        clientY: 300,
        bubbles: true
      }));
      
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 2,
        pointerType: 'touch',
        clientX: 230,
        clientY: 300,
        bubbles: true
      }));
      
      // Move apart (pinch out to zoom in)
      setTimeout(() => {
        canvas.dispatchEvent(new PointerEvent('pointermove', {
          pointerId: 1,
          pointerType: 'touch',
          clientX: 80,
          clientY: 300,
          bubbles: true
        }));
        
        canvas.dispatchEvent(new PointerEvent('pointermove', {
          pointerId: 2,
          pointerType: 'touch',
          clientX: 320,
          clientY: 300,
          bubbles: true
        }));
        
        // End touches
        setTimeout(() => {
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
        }, 50);
      }, 50);
    });
    
    await page.waitForTimeout(300);
    
    // Check zoom changed
    const newZoom = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return map?.getZoom() || 3;
    });
    
    expect(newZoom).toBeGreaterThan(initialZoom);
  });

  test('hold-and-drag selection works on touch devices', async ({ page }) => {
    // Create a rectangle first
    await page.click('button:has-text("▭")');
    await page.mouse.move(150, 150);
    await page.mouse.down();
    await page.mouse.move(250, 250);
    await page.mouse.up();
    
    // Switch to cursor mode
    await page.click('button:has-text("🖱️")');
    
    // Test quick tap - should not create selection rectangle
    await page.evaluate(async () => {
      const svg = document.querySelector('svg');
      const container = svg as HTMLElement;
      
      // Quick touch
      container.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 100,
        clientY: 100,
        bubbles: true
      }));
      
      await new Promise(r => setTimeout(r, 50)); // Less than 150ms
      
      container.dispatchEvent(new PointerEvent('pointerup', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 100,
        clientY: 100,
        bubbles: true
      }));
    });
    
    // Should not have selection rectangle
    const quickTapRect = await page.locator('svg rect[fill*="rgba(0, 255, 136"]').count();
    expect(quickTapRect).toBe(0);
    
    // Test hold and drag - should create selection rectangle
    await page.evaluate(async () => {
      const svg = document.querySelector('svg');
      const container = svg as HTMLElement;
      
      // Touch and hold
      container.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 100,
        clientY: 100,
        bubbles: true
      }));
      
      await new Promise(r => setTimeout(r, 200)); // More than 150ms
      
      // Drag
      container.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 300,
        clientY: 300,
        bubbles: true
      }));
      
      await new Promise(r => setTimeout(r, 50));
      
      container.dispatchEvent(new PointerEvent('pointerup', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 300,
        clientY: 300,
        bubbles: true
      }));
    });
    
    await page.waitForTimeout(100);
    
    // Rectangle should be selected
    const selected = await page.locator('svg rect[stroke="#ff0088"]').count();
    expect(selected).toBe(1);
  });

  test('single finger pan works in drawing modes', async ({ page }) => {
    // Switch to rectangle tool
    await page.click('button:has-text("▭")');
    
    // Get initial center
    const initialCenter = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return map?.getCenter();
    });
    
    // Touch pan should still work
    await page.evaluate(async () => {
      const container = document.querySelector('.maplibregl-canvas') as HTMLElement;
      
      container.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 200,
        clientY: 300,
        bubbles: true
      }));
      
      await new Promise(r => setTimeout(r, 50));
      
      container.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 100,
        clientY: 200,
        bubbles: true
      }));
      
      await new Promise(r => setTimeout(r, 50));
      
      container.dispatchEvent(new PointerEvent('pointerup', {
        pointerId: 1,
        pointerType: 'touch',
        bubbles: true
      }));
    });
    
    await page.waitForTimeout(100);
    
    // Check center changed
    const newCenter = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return map?.getCenter();
    });
    
    expect(newCenter.lng).not.toBeCloseTo(initialCenter.lng, 5);
    expect(newCenter.lat).not.toBeCloseTo(initialCenter.lat, 5);
  });
});