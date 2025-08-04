import { test, expect } from '@playwright/test';

test.describe('Nested Annotations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('can draw rectangle inside another rectangle', async ({ page }) => {
    // Draw first large rectangle
    await page.click('button:has-text("▭")');
    await page.waitForTimeout(200);
    await page.mouse.move(100, 100);
    await page.mouse.down();
    await page.mouse.move(400, 400);
    await page.mouse.up();
    
    // Verify first rectangle exists
    await expect(page.locator('rect[data-anno]')).toHaveCount(1);
    
    // Draw second rectangle inside the first one
    await page.mouse.move(200, 200);
    await page.mouse.down();
    await page.mouse.move(300, 300);
    await page.mouse.up();
    
    // Both rectangles should exist
    await expect(page.locator('rect[data-anno]')).toHaveCount(2);
  });

  test('can draw circle inside rectangle', async ({ page }) => {
    // Draw rectangle first
    await page.click('button:has-text("▭")');
    await page.waitForTimeout(200);
    await page.mouse.move(100, 100);
    await page.mouse.down();
    await page.mouse.move(400, 400);
    await page.mouse.up();
    
    // Verify rectangle exists
    await expect(page.locator('rect[data-anno]')).toHaveCount(1);
    
    // Switch to circle tool
    await page.click('button:has-text("◯")');
    await page.waitForTimeout(200);
    
    // Draw circle inside rectangle
    await page.mouse.move(250, 250);
    await page.mouse.down();
    await page.mouse.move(300, 300);
    await page.mouse.up();
    
    // Both shapes should exist
    await expect(page.locator('rect[data-anno]')).toHaveCount(1);
    await expect(page.locator('circle[data-anno]')).toHaveCount(1);
  });

  test('can place text inside circle', async ({ page }) => {
    // Draw circle first
    await page.click('button:has-text("◯")');
    await page.waitForTimeout(200);
    await page.mouse.move(250, 250);
    await page.mouse.down();
    await page.mouse.move(350, 350);
    await page.mouse.up();
    
    // Verify circle exists
    await expect(page.locator('circle[data-anno]')).toHaveCount(1);
    
    // Switch to text tool
    await page.click('button:has-text("T")');
    await page.waitForTimeout(200);
    
    // Click inside circle to place text
    await page.mouse.click(250, 250);
    
    // Wait for the contenteditable div to appear
    await page.waitForSelector('div[contenteditable="true"]');
    
    // Type text and confirm
    await page.keyboard.type('Inside Circle');
    await page.keyboard.press('Enter');
    
    // Wait a bit for text to be saved
    await page.waitForTimeout(200);
    
    // Both annotations should exist
    await expect(page.locator('circle[data-anno]')).toHaveCount(1);
    await expect(page.locator('text[data-anno]')).toHaveCount(1);
  });

  test('can draw arrow through existing shapes', async ({ page }) => {
    // Draw rectangle
    await page.click('button:has-text("▭")');
    await page.waitForTimeout(200);
    await page.mouse.move(200, 200);
    await page.mouse.down();
    await page.mouse.move(300, 300);
    await page.mouse.up();
    
    // Verify rectangle exists
    await expect(page.locator('rect[data-anno]')).toHaveCount(1);
    
    // Switch to arrow tool
    await page.click('button:has-text("／")');
    await page.waitForTimeout(200);
    
    // Draw arrow starting inside rectangle
    await page.mouse.move(250, 250);
    await page.mouse.down();
    await page.mouse.move(400, 400);
    await page.mouse.up();
    
    // Both annotations should exist
    await expect(page.locator('rect[data-anno]')).toHaveCount(1);
    await expect(page.locator('line[data-anno]')).toHaveCount(1);
  });
});