import { test, expect, Browser, BrowserContext } from '@playwright/test';

test.describe('Multiplayer Collaboration', () => {
  test('two users can see each other\'s cursors and shapes', async ({ browser }) => {
    // Create two browser contexts
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    
    // Grant clipboard permissions
    await contextA.grantPermissions(['clipboard-read', 'clipboard-write']);
    await contextB.grantPermissions(['clipboard-read', 'clipboard-write']);
    
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    
    try {
      // Context A: Navigate to app and create a new board
      await pageA.goto('/');
      await pageA.click('button:has-text("Personal")');
      
      pageA.on('dialog', dialog => {
        if (dialog.type() === 'prompt') {
          dialog.accept('Collab Test Board');
        }
      });
      
      await pageA.click('button:has-text("+ New board")');
      await pageA.waitForURL(/\/b\/.+/, { timeout: 5000 });
      
      // Draw a rectangle in context A
      await pageA.click('button:has-text("▭")');
      await pageA.waitForTimeout(200); // Wait for tool to be selected
      await pageA.mouse.move(100, 100);
      await pageA.mouse.down();
      await pageA.mouse.move(200, 200);
      await pageA.mouse.up();
      
      // Verify shape exists in context A
      await expect(pageA.locator('rect[data-anno]')).toHaveCount(1);
      
      // Copy the share link
      await pageA.click('button[data-share-btn]');
      await pageA.waitForTimeout(500);
      const shareLink = await pageA.evaluate(() => navigator.clipboard.readText());
      
      // Context B: Open the shared link
      await pageB.goto(shareLink);
      await pageB.waitForLoadState('networkidle');
      
      // Wait a bit for WebRTC connection to establish and sync
      await pageB.waitForTimeout(1000);
      
      // Verify context B can see the rectangle from context A within 5 seconds
      await expect(pageB.locator('rect[data-anno]')).toHaveCount(1, { timeout: 5000 });
      
      // Move mouse in context A to generate cursor events
      await pageA.mouse.move(300, 300);
      await pageA.mouse.move(350, 350);
      
      // Context B should see cursor squares from context A
      // Note: cursor squares are shown in svg with data-cursor attribute
      await expect(pageB.locator('svg [data-cursor]')).toBeVisible({ timeout: 2000 });
      
      // Draw a circle in context B
      await pageB.click('button:has-text("◯")');
      await pageB.waitForTimeout(200); // Wait for tool to be selected
      await pageB.mouse.move(250, 250);
      await pageB.mouse.down();
      await pageB.mouse.move(350, 350);
      await pageB.mouse.up();
      
      // Both contexts should now see both shapes
      await expect(pageA.locator('rect[data-anno]')).toHaveCount(1);
      await expect(pageA.locator('circle[data-anno]')).toHaveCount(1, { timeout: 5000 });
      await expect(pageB.locator('rect[data-anno]')).toHaveCount(1);
      await expect(pageB.locator('circle[data-anno]')).toHaveCount(1);
      
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
  
  test('invite token allows collaboration', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    
    await contextA.grantPermissions(['clipboard-read', 'clipboard-write']);
    
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    
    try {
      // Context A: Create a board and get share link
      await pageA.goto('/');
      await pageA.click('button:has-text("Personal")');
      
      pageA.on('dialog', dialog => {
        if (dialog.type() === 'prompt') {
          dialog.accept('Invite Test Board');
        }
      });
      
      await pageA.click('button:has-text("+ New board")');
      await pageA.waitForURL(/\/b\/.+/, { timeout: 5000 });
      
      // Copy share link with invite token
      await pageA.click('button[data-share-btn]');
      await pageA.waitForTimeout(500);
      const shareLink = await pageA.evaluate(() => navigator.clipboard.readText());
      
      // Verify the link contains invite token
      expect(shareLink).toContain('#inv=');
      
      // Context B: Open with valid invite token
      await pageB.goto(shareLink);
      await pageB.waitForLoadState('networkidle');
      
      // Wait a bit for WebRTC connection to establish  
      await pageB.waitForTimeout(1000);
      
      // URL hash should be cleared after successful validation
      expect(pageB.url()).not.toContain('#inv=');
      
      // Context B should be able to draw (edit capability)
      await pageB.click('button:has-text("▭")');
      await pageB.waitForTimeout(200); // Wait for tool to be selected
      await pageB.mouse.move(100, 100);
      await pageB.mouse.down();
      await pageB.mouse.move(200, 200);
      await pageB.mouse.up();
      
      // Shape should be created
      await expect(pageB.locator('rect[data-anno]')).toHaveCount(1);
      
      // Context A should see the shape
      await expect(pageA.locator('rect[data-anno]')).toHaveCount(1, { timeout: 5000 });
      
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});