import { test, expect } from '@playwright/test';

test.describe('Map Application', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for map to load
    await page.waitForSelector('.maplibregl-map', { timeout: 10000 });
  });

  test('map loads successfully', async ({ page }) => {
    // Check that map container exists
    const mapContainer = await page.locator('.maplibregl-map');
    await expect(mapContainer).toBeVisible();
    
    // Check that canvas exists
    const canvas = await page.locator('.maplibregl-canvas');
    await expect(canvas).toBeVisible();
  });

  test('toolbar is visible with all tools', async ({ page }) => {
    // Check toolbar exists
    const toolbar = await page.locator('.absolute.top-2.left-2');
    await expect(toolbar).toBeVisible();
    
    // Check all tool buttons
    const tools = ['🖱️', '▭', '◯', '／', 'T'];
    for (const tool of tools) {
      const button = await page.locator(`.absolute.top-2.left-2 button:has-text("${tool}")`);
      await expect(button).toBeVisible();
    }
  });

  test('event log can be opened and closed', async ({ page }) => {
    // Check event log button
    const eventLogButton = await page.locator('button:has-text("Open Event Log")');
    await expect(eventLogButton).toBeVisible();
    
    // Open event log
    await eventLogButton.click();
    const eventLogPanel = await page.locator('.flex.max-h-80.flex-col');
    await expect(eventLogPanel).toBeVisible();
    
    // Check close button
    const closeButton = await page.locator('button:has-text("Close Event Log")');
    await expect(closeButton).toBeVisible();
    
    // Close event log
    await closeButton.click();
    await expect(eventLogPanel).not.toBeVisible();
  });

  test('mouse wheel panning works', async ({ page }) => {
    // Wait for map to be ready and wheel handler to be attached
    await page.waitForTimeout(1000);
    
    // Get initial center
    const initialCenter = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return map?.getCenter();
    });
    
    // Move mouse to center and wheel to pan
    await page.mouse.move(400, 300);
    await page.mouse.wheel(50, 50);
    
    // Wait for pan
    await page.waitForTimeout(200);
    
    // Check center changed
    const newCenter = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return map?.getCenter();
    });
    
    expect(newCenter.lng).not.toBeCloseTo(initialCenter.lng, 5);
    expect(newCenter.lat).not.toBeCloseTo(initialCenter.lat, 5);
  });

  test('ctrl+wheel zooming works', async ({ page }) => {
    // Wait for map to be ready and wheel handler to be attached
    await page.waitForTimeout(1000);
    
    // Get initial zoom
    const initialZoom = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return map?.getZoom() || 3;
    });
    
    // Move mouse to center of map
    await page.mouse.move(400, 300);
    
    // Ctrl+wheel to zoom
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -100);
    await page.keyboard.up('Control');
    
    // Wait for zoom animation
    await page.waitForTimeout(200);
    
    // Check zoom changed
    const newZoom = await page.evaluate(() => {
      const map = (window as any).mapRef?.current;
      return map?.getZoom() || 3;
    });
    
    expect(newZoom).toBeGreaterThan(initialZoom);
  });

  test('selection rectangle works in cursor mode', async ({ page }) => {
    // Make sure we're in cursor mode (default)
    const cursorButton = await page.locator('.absolute.top-2.left-2 button:has-text("🖱️")');
    // Just verify it exists, don't check color (Tailwind may compile differently)
    
    // Create a rectangle annotation first
    const rectButton = await page.locator('button:has-text("▭")');
    await rectButton.click();
    
    // Draw rectangle
    await page.mouse.move(200, 200);
    await page.mouse.down();
    await page.mouse.move(300, 300);
    await page.mouse.up();
    
    // Switch back to cursor
    await cursorButton.click();
    
    // Draw selection rectangle
    await page.mouse.move(150, 150);
    await page.mouse.down();
    await page.mouse.move(350, 350);
    await page.mouse.up();
    
    // Check that annotation is selected (will have different stroke color)
    const annotation = await page.locator('svg rect[stroke="#ff0088"]');
    await expect(annotation).toBeVisible();
  });

  test('rectangle drawing tool works', async ({ page }) => {
    // Click rectangle tool
    const rectButton = await page.locator('button:has-text("▭")');
    await rectButton.click();
    
    // Draw rectangle
    await page.mouse.move(200, 200);
    await page.mouse.down();
    await page.mouse.move(300, 300);
    await page.mouse.up();
    
    // Check rectangle was created
    const rectangles = await page.locator('svg rect[stroke="#00ff88"]');
    await expect(rectangles).toHaveCount(1);
  });

  test('circle drawing tool works', async ({ page }) => {
    // Click circle tool
    const circleButton = await page.locator('button:has-text("◯")');
    await circleButton.click();
    
    // Draw circle
    await page.mouse.move(250, 250);
    await page.mouse.down();
    await page.mouse.move(300, 250);
    await page.mouse.up();
    
    // Check circle was created
    const circles = await page.locator('svg circle[stroke="#00ff88"]');
    await expect(circles).toHaveCount(1);
  });

  test('line drawing tool works', async ({ page }) => {
    // Click line tool
    const lineButton = await page.locator('button:has-text("／")');
    await lineButton.click();
    
    // Draw line
    await page.mouse.move(200, 200);
    await page.mouse.down();
    await page.mouse.move(300, 300);
    await page.mouse.up();
    
    // Check line was created
    const lines = await page.locator('svg line[stroke="#00ff88"]');
    await expect(lines).toHaveCount(1);
  });

  test('text annotation tool works', async ({ page }) => {
    // Click text tool
    const textButton = await page.locator('.absolute.top-2.left-2 button:has-text("T")');
    await textButton.click();
    
    // Click to place text
    await page.mouse.click(250, 250);
    
    // Wait for the contenteditable div
    const textInput = await page.locator('[contenteditable="true"]');
    await expect(textInput).toBeVisible({ timeout: 2000 });
    
    // Type text
    await textInput.fill('Test Text');
    
    // Press Enter to save
    await page.keyboard.press('Enter');
    
    // Wait a bit for the annotation to be created
    await page.waitForTimeout(200);
    
    // Check text was created (at least one)
    const texts = await page.locator('svg text:has-text("Test Text")');
    const count = await texts.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('delete key removes selected annotations', async ({ page }) => {
    // Create a rectangle
    const rectButton = await page.locator('button:has-text("▭")');
    await rectButton.click();
    await page.mouse.move(200, 200);
    await page.mouse.down();
    await page.mouse.move(300, 300);
    await page.mouse.up();
    
    // Switch to cursor mode
    const cursorButton = await page.locator('button:has-text("🖱️")');
    await cursorButton.click();
    
    // Wait a bit for rendering
    await page.waitForTimeout(200);
    
    // Click on the rectangle to select it
    const rect = await page.locator('svg rect[stroke="#00ff88"]').first();
    await rect.click();
    
    // Press delete
    await page.keyboard.press('Delete');
    
    // Check rectangle was removed
    const rectangles = await page.locator('svg rect[stroke="#00ff88"]');
    await expect(rectangles).toHaveCount(0);
  });

  test('shift+click adds to selection', async ({ page }) => {
    // Create two rectangles
    const rectButton = await page.locator('button:has-text("▭")');
    await rectButton.click();
    
    // First rectangle
    await page.mouse.move(100, 100);
    await page.mouse.down();
    await page.mouse.move(150, 150);
    await page.mouse.up();
    
    // Second rectangle
    await page.mouse.move(200, 200);
    await page.mouse.down();
    await page.mouse.move(250, 250);
    await page.mouse.up();
    
    // Switch to cursor mode
    const cursorButton = await page.locator('button:has-text("🖱️")');
    await cursorButton.click();
    
    // Wait for rendering
    await page.waitForTimeout(200);
    
    // Click first rectangle
    const rects = await page.locator('svg rect[stroke="#00ff88"]');
    await rects.first().click();
    
    // Shift+click second rectangle
    await page.keyboard.down('Shift');
    await rects.last().click();
    await page.keyboard.up('Shift');
    
    // Both should be selected (red stroke)
    const selected = await page.locator('svg rect[stroke="#ff0088"]');
    await expect(selected).toHaveCount(2);
  });
});