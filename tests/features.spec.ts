import { test, expect } from '@playwright/test';

test.describe('New Features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for map to load
    await page.waitForSelector('.maplibregl-map', { timeout: 10000 });
    await page.waitForTimeout(500); // Wait for all handlers to be attached
  });

  test('mobile touch panning works in all modes', async ({ page }) => {
    // Get initial center
    const initialCenter = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return map?.getCenter();
    });
    
    // Switch to rect tool (not cursor mode)
    await page.click('button:has-text("▭")');
    
    // Simulate touch pan
    await page.locator('.maplibregl-canvas').dispatchEvent('pointerdown', {
      pointerType: 'touch',
      clientX: 400,
      clientY: 300,
      pointerId: 1
    });
    
    await page.locator('.maplibregl-canvas').dispatchEvent('pointermove', {
      pointerType: 'touch',
      clientX: 300,
      clientY: 200,
      pointerId: 1
    });
    
    await page.locator('.maplibregl-canvas').dispatchEvent('pointerup', {
      pointerType: 'touch',
      pointerId: 1
    });
    
    // Check center changed (mobile pan should work in all modes now)
    const newCenter = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return map?.getCenter();
    });
    
    expect(newCenter.lng).not.toBeCloseTo(initialCenter.lng, 5);
    expect(newCenter.lat).not.toBeCloseTo(initialCenter.lat, 5);
  });

  test('hold-and-drag selection rectangle (Figma-style)', async ({ page }) => {
    // Create a rectangle first
    await page.click('button:has-text("▭")');
    await page.mouse.move(200, 200);
    await page.mouse.down();
    await page.mouse.move(300, 300);
    await page.mouse.up();
    
    // Switch to cursor mode
    await page.click('button:has-text("🖱️")');
    
    // Desktop should have immediate selection (no hold timer)
    await page.mouse.move(150, 150);
    await page.mouse.down();
    await page.mouse.move(350, 350);
    await page.mouse.up();
    
    // Rectangle should be selected
    const selectedCount = await page.locator('svg rect[stroke="#ff0088"]').count();
    expect(selectedCount).toBe(1);
  });

  test('delete X button appears for selected items', async ({ page }) => {
    // Create a circle
    await page.click('button:has-text("◯")');
    await page.mouse.move(250, 250);
    await page.mouse.down();
    await page.mouse.move(300, 250);
    await page.mouse.up();
    
    // Switch to cursor mode
    await page.click('button:has-text("🖱️")');
    
    // Select the circle
    await page.locator('svg circle[stroke="#00ff88"]').click();
    
    // Delete button should appear
    const deleteBtn = await page.locator('#delete-button');
    await expect(deleteBtn).toBeVisible();
    
    // Click delete button
    await deleteBtn.click();
    
    // Circle should be deleted
    const circles = await page.locator('svg circle[stroke="#00ff88"]');
    await expect(circles).toHaveCount(0);
    
    // Delete button should disappear
    await expect(deleteBtn).not.toBeVisible();
  });

  test('selection rectangle is removed properly', async ({ page }) => {
    // Switch to cursor mode
    await page.click('button:has-text("🖱️")');
    
    // Start selection but cancel with pointer cancel
    await page.mouse.move(100, 100);
    await page.mouse.down();
    await page.waitForTimeout(350); // Wait for hold timer
    await page.mouse.move(200, 200);
    
    // Verify selection rectangle exists during drag
    const rectDuringDrag = await page.locator('svg rect[fill*="rgba(0, 255, 136"]').count();
    expect(rectDuringDrag).toBe(1);
    
    // Dispatch pointer cancel event
    await page.locator('svg').dispatchEvent('pointercancel');
    
    // Selection rectangle should be removed
    const rectAfterCancel = await page.locator('svg rect[fill*="rgba(0, 255, 136"]').count();
    expect(rectAfterCancel).toBe(0);
  });

  test('arrow markers turn red when selected', async ({ page }) => {
    // Draw a line/arrow
    await page.click('button:has-text("／")');
    await page.mouse.move(200, 200);
    await page.mouse.down();
    await page.mouse.move(300, 300);
    await page.mouse.up();
    
    // Switch to cursor mode
    await page.click('button:has-text("🖱️")');
    
    // Click on the line - use coordinates to avoid SVG intercept issues
    await page.locator('svg line[stroke="#00ff88"]').first().click({ position: { x: 10, y: 10 } });
    
    // Get the line ID and verify selection
    const isSelected = await page.evaluate(() => {
      const line = document.querySelector('svg line[stroke="#ff0088"]');
      if (!line) return null;
      const lineId = line.id;
      const arrowHead = document.getElementById(`arrow-head-${lineId}`);
      return {
        lineColor: line?.getAttribute('stroke'),
        arrowColor: arrowHead?.getAttribute('fill')
      };
    });
    
    expect(isSelected).not.toBeNull();
    expect(isSelected.lineColor).toBe('#ff0088');
    expect(isSelected.arrowColor).toBe('#ff0088');
  });

  test('Y.js persistence with IndexedDB', async ({ page, context }) => {
    // Create some annotations
    await page.click('button:has-text("▭")');
    await page.mouse.move(100, 100);
    await page.mouse.down();
    await page.mouse.move(200, 200);
    await page.mouse.up();
    
    await page.click('button:has-text("◯")');
    await page.mouse.move(300, 300);
    await page.mouse.down();
    await page.mouse.move(350, 300);
    await page.mouse.up();
    
    // Wait for persistence to sync
    await page.waitForTimeout(1000);
    
    // Check console for sync message
    const messages = await page.evaluate(() => {
      return (window as any).consoleMessages || [];
    });
    
    // Create a new page in the same context (shares IndexedDB)
    const newPage = await context.newPage();
    await newPage.goto('/');
    await newPage.waitForSelector('.maplibregl-map', { timeout: 10000 });
    await newPage.waitForTimeout(1000); // Wait for IndexedDB to load
    
    // Check that annotations are persisted
    const rectangles = await newPage.locator('svg rect[stroke="#00ff88"]');
    await expect(rectangles).toHaveCount(1);
    
    const circles = await newPage.locator('svg circle[stroke="#00ff88"]');
    await expect(circles).toHaveCount(1);
    
    await newPage.close();
  });

  test('clear selection when clicking empty space', async ({ page }) => {
    // Create and select a rectangle
    await page.click('button:has-text("▭")');
    await page.mouse.move(200, 200);
    await page.mouse.down();
    await page.mouse.move(300, 300);
    await page.mouse.up();
    
    // Switch to cursor mode and select it
    await page.click('button:has-text("🖱️")');
    await page.locator('svg rect[stroke="#00ff88"]').click();
    
    // Verify it's selected
    let selected = await page.locator('svg rect[stroke="#ff0088"]').count();
    expect(selected).toBe(1);
    
    // Click on empty space
    await page.mouse.click(400, 400);
    
    // Verify selection is cleared
    selected = await page.locator('svg rect[stroke="#ff0088"]').count();
    expect(selected).toBe(0);
  });

  test('arrow head scales with zoom', async ({ page }) => {
    // Draw an arrow at current zoom
    const initialZoom = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return map?.getZoom() || 3;
    });
    
    await page.click('button:has-text("／")');
    await page.mouse.move(200, 200);
    await page.mouse.down();
    await page.mouse.move(400, 400);
    await page.mouse.up();
    
    // Get initial arrow head size
    await page.waitForTimeout(200);
    const initialArrowData = await page.evaluate(() => {
      const line = document.querySelector('svg line[stroke="#00ff88"]');
      if (line) {
        const arrowHead = document.querySelector(`path[id^="arrow-head-"]`) as SVGPathElement;
        if (arrowHead) {
          return {
            fillColor: arrowHead.getAttribute('fill'),
            path: arrowHead.getAttribute('d')
          };
        }
      }
      return null;
    });
    
    expect(initialArrowData).not.toBeNull();
    
    // Zoom in significantly
    await page.mouse.move(300, 300);
    for (let i = 0; i < 5; i++) {
      await page.keyboard.down('Control');
      await page.mouse.wheel(0, -100);
      await page.keyboard.up('Control');
      await page.waitForTimeout(100);
    }
    
    // Check arrow head scaled
    const zoomedArrowData = await page.evaluate(() => {
      const line = document.querySelector('svg line[stroke="#00ff88"]');
      if (line) {
        const arrowHead = document.getElementById(`arrow-head-${line.id}`) as SVGPathElement;
        if (arrowHead) {
          return {
            fillColor: arrowHead.getAttribute('fill'),
            path: arrowHead.getAttribute('d')
          };
        }
      }
      return null;
    });
    
    expect(zoomedArrowData).not.toBeNull();
    
    // Arrow head should have same color but different path (position changed)
    expect(initialArrowData.fillColor).toBe('#00ff88');
    expect(zoomedArrowData.fillColor).toBe('#00ff88');
    expect(zoomedArrowData.path).not.toBe(initialArrowData.path);
  });

  test.skip('multiple selection with shift-click works with delete button', async ({ page }) => {
    // Create three rectangles
    await page.click('button:has-text("▭")');
    
    for (let i = 0; i < 3; i++) {
      await page.mouse.move(100 + i * 150, 100);
      await page.mouse.down();
      await page.mouse.move(150 + i * 150, 150);
      await page.mouse.up();
      await page.waitForTimeout(100);
    }
    
    // Switch to cursor mode
    await page.click('button:has-text("🖱️")');
    
    // Wait for rectangles to render
    await page.waitForTimeout(500);
    
    // Verify we have 3 rectangles
    const rectCount = await page.locator('svg rect[stroke="#00ff88"]').count();
    expect(rectCount).toBe(3);
    
    // Select first rectangle
    await page.locator('svg rect[stroke="#00ff88"]').first().click();
    await page.waitForTimeout(100);
    
    // Select remaining rectangles with shift-click, using position to avoid issues
    await page.keyboard.down('Shift');
    await page.locator('svg rect[stroke="#00ff88"]').nth(1).click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(100);
    await page.locator('svg rect[stroke="#00ff88"]').nth(2).click({ position: { x: 5, y: 5 } });
    await page.keyboard.up('Shift');
    
    // All should be selected
    const selected = await page.locator('svg rect[stroke="#ff0088"]').count();
    expect(selected).toBe(3);
    
    // Delete button should be visible
    const deleteBtn = await page.locator('#delete-button');
    await expect(deleteBtn).toBeVisible();
    
    // Click delete
    await deleteBtn.click();
    
    // All rectangles should be deleted
    const remaining = await page.locator('svg rect[stroke="#00ff88"]').count();
    expect(remaining).toBe(0);
  });
});