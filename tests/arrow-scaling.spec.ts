import { test, expect } from '@playwright/test';

test.describe('Arrow Scaling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.maplibregl-map', { timeout: 10000 });
    await page.waitForTimeout(500);
  });

  test('arrow head scales with zoom like other annotations', async ({ page }) => {
    // Draw an arrow
    await page.click('button:has-text("／")');
    await page.mouse.move(200, 200);
    await page.mouse.down();
    await page.mouse.move(400, 400);
    await page.mouse.up();
    
    // Wait for arrow to be rendered
    await page.waitForTimeout(500);
    
    // Get initial arrow head size
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
    console.log('Initial arrow:', initialArrowData);
    
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
        const arrowHead = document.querySelector(`#arrow-head-${line.id}`) as SVGPathElement;
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
    console.log('Zoomed arrow:', zoomedArrowData);
    
    // Arrow head should have same color but different path (position changed)
    expect(initialArrowData.fillColor).toBe('#00ff88');
    expect(zoomedArrowData.fillColor).toBe('#00ff88');
    expect(zoomedArrowData.path).not.toBe(initialArrowData.path);
  });

  test('arrow head color changes when selected', async ({ page }) => {
    // Draw an arrow
    await page.click('button:has-text("／")');
    await page.mouse.move(200, 200);
    await page.mouse.down();
    await page.mouse.move(400, 400);
    await page.mouse.up();
    
    await page.waitForTimeout(200);
    
    // Switch to cursor mode
    await page.click('button:has-text("🖱️")');
    
    // Get line element
    const lineId = await page.evaluate(() => {
      const line = document.querySelector('svg line[stroke="#00ff88"]');
      return line?.id;
    });
    
    // Select the line
    await page.locator(`svg line[id="${lineId}"]`).click();
    
    // Check both line and arrow head are red
    const isSelected = await page.evaluate((id) => {
      const line = document.getElementById(id);
      const arrowHead = document.getElementById(`arrow-head-${id}`);
      return {
        lineColor: line?.getAttribute('stroke'),
        arrowColor: arrowHead?.getAttribute('fill')
      };
    }, lineId);
    
    expect(isSelected.lineColor).toBe('#ff0088');
    expect(isSelected.arrowColor).toBe('#ff0088');
  });
});