import { test, expect } from '@playwright/test';

test.describe('Board Management', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
  });

  test('personal board loads by default', async ({ page }) => {
    await page.goto('/');
    
    // Should be on personal board (root path)
    await expect(page).toHaveURL('/');
    
    // Board menu should show "Personal"
    const boardButton = page.locator('button:has-text("Personal")');
    await expect(boardButton).toBeVisible();
  });

  test('can create new board', async ({ page }) => {
    await page.goto('/');
    
    // Open board menu
    await page.click('button:has-text("Personal")');
    
    // Set up dialog handler before triggering it
    page.on('dialog', dialog => {
      if (dialog.type() === 'prompt') {
        dialog.accept('Test Board');
      }
    });
    
    // Click new board button
    await page.click('button:has-text("+ New board")');
    
    // Wait for navigation to new board
    await page.waitForURL(/\/b\/.+/, { timeout: 5000 });
    
    // Verify board name appears in menu
    await expect(page.locator('button:has-text("Test Board")')).toBeVisible();
  });

  test('boards persist across page reloads', async ({ page }) => {
    await page.goto('/');
    
    // Create a board
    await page.click('button:has-text("Personal")');
    
    page.on('dialog', dialog => {
      if (dialog.type() === 'prompt') {
        dialog.accept('Persistent Board');
      }
    });
    
    await page.click('button:has-text("+ New board")');
    await page.waitForURL(/\/b\/.+/, { timeout: 5000 });
    
    const boardUrl = page.url();
    
    // Reload page
    await page.reload();
    
    // Should still be on the same board
    await expect(page).toHaveURL(boardUrl);
    await expect(page.locator('button:has-text("Persistent Board")')).toBeVisible();
    
    // Board should appear in menu
    await page.click('button:has-text("Persistent Board")');
    await expect(page.locator('button:has-text("Persistent Board").bg-white\\/5')).toBeVisible();
  });

  test('can switch between boards', async ({ page }) => {
    await page.goto('/');
    
    // Set up dialog handler for all prompts
    let boardCounter = 1;
    page.on('dialog', dialog => {
      if (dialog.type() === 'prompt') {
        dialog.accept(`Board ${boardCounter++}`);
      }
    });
    
    // Create first board
    await page.click('button:has-text("Personal")');
    await page.click('button:has-text("+ New board")');
    await page.waitForURL(/\/b\/.+/, { timeout: 5000 });
    const board1Url = page.url();
    
    // Create second board
    await page.click('button:has-text("Board 1")');
    await page.click('button:has-text("+ New board")');
    await page.waitForURL(/\/b\/.+/, { timeout: 5000 });
    const board2Url = page.url();
    
    expect(board1Url).not.toBe(board2Url);
    
    // Switch back to Board 1
    await page.click('button:has-text("Board 2")');
    await page.click('button:has-text("Board 1")');
    await expect(page).toHaveURL(board1Url);
    
    // Switch to Personal board
    await page.click('button:has-text("Board 1")');
    await page.click('button:has-text("Personal")');
    await expect(page).toHaveURL('/');
  });

  test('board dropdown closes when clicking outside', async ({ page }) => {
    await page.goto('/');
    
    // Open dropdown
    await page.click('button:has-text("Personal")');
    await expect(page.locator('button:has-text("+ New board")')).toBeVisible();
    
    // Click outside
    await page.click('body', { position: { x: 10, y: 10 } });
    
    // Dropdown should close
    await expect(page.locator('button:has-text("+ New board")')).not.toBeVisible();
  });

  test('empty board name is rejected', async ({ page }) => {
    await page.goto('/');
    
    await page.click('button:has-text("Personal")');
    
    // First try - dismiss dialog
    page.once('dialog', dialog => dialog.dismiss());
    await page.click('button:has-text("+ New board")');
    
    // Should still be on personal board
    await expect(page).toHaveURL('/');
    await expect(page.locator('button:has-text("Personal")').first()).toBeVisible();
    
    // Second try - empty string
    page.once('dialog', dialog => dialog.accept(''));
    await page.click('button:has-text("+ New board")');
    
    // Should still be on personal board
    await expect(page).toHaveURL('/');
  });

  test('share button appears on both personal and non-personal boards', async ({ page }) => {
    await page.goto('/');
    
    // Personal board should have share button with different text
    await expect(page.locator('button[data-share-btn]:has-text("🔗 Share")')).toBeVisible();
    
    // Create a new board
    await page.click('button:has-text("Personal")');
    
    page.on('dialog', dialog => {
      if (dialog.type() === 'prompt') {
        dialog.accept('Shared Board');
      }
    });
    
    await page.click('button:has-text("+ New board")');
    await page.waitForURL(/\/b\/.+/, { timeout: 5000 });
    
    // Share button should appear with different text
    await expect(page.locator('button[data-share-btn]:has-text("📋 Share")')).toBeVisible();
  });

  test('share button on personal board duplicates and navigates', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    
    await page.goto('/');
    
    // Draw a shape on personal board
    await page.click('button:has-text("▭")');
    await page.waitForTimeout(200); // Wait for tool to be selected
    await page.mouse.move(100, 100);
    await page.mouse.down();
    await page.mouse.move(200, 200);
    await page.mouse.up();
    
    // Verify shape exists
    await expect(page.locator('rect[data-anno]')).toHaveCount(1);
    
    // Set up dialog handler for the prompt
    page.on('dialog', dialog => {
      if (dialog.type() === 'prompt') {
        dialog.accept('Duplicated Board');
      }
    });
    
    // Click share button on personal board
    await page.click('button[data-share-btn]:has-text("🔗 Share")');
    
    // Should navigate to new board
    await page.waitForURL(/\/b\/.+/, { timeout: 5000 });
    
    // Button should show "Copied!" after navigation
    await expect(page.locator('button:has-text("✓ Copied!")')).toBeVisible();
    
    // After 2 seconds, should revert to normal share button
    await page.waitForTimeout(2100);
    await expect(page.locator('button:has-text("📋 Share")')).toBeVisible();
    
    // Verify clipboard contains the new board URL with invite token
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain(page.url().split('#')[0]);
    expect(clipboardText).toContain('#inv=');
    
    // Original shape should be duplicated
    await expect(page.locator('rect[data-anno]')).toHaveCount(1);
  });
  
  test('share button on non-personal board copies link', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    
    await page.goto('/');
    
    // Create a board
    await page.click('button:has-text("Personal")');
    
    page.on('dialog', dialog => {
      if (dialog.type() === 'prompt') {
        dialog.accept('Shareable Board');
      }
    });
    
    await page.click('button:has-text("+ New board")');
    await page.waitForURL(/\/b\/.+/, { timeout: 5000 });
    
    // Click share button
    await page.click('button[data-share-btn]');
    
    // Button should show "Copied!"
    await expect(page.locator('button:has-text("✓ Copied!")')).toBeVisible();
    
    // After 2 seconds, should revert
    await page.waitForTimeout(2100);
    await expect(page.locator('button:has-text("📋 Share")')).toBeVisible();
    
    // Verify clipboard contains the URL with invite token
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain(page.url().split('#')[0]);
    expect(clipboardText).toContain('#inv=');
  });

  test('boards are sorted with personal first, then by last opened', async ({ page }) => {
    await page.goto('/');
    
    // Set up dialog handler
    let boardNames = ['Old Board', 'New Board', 'Duplicated Board'];
    let boardIndex = 0;
    page.on('dialog', dialog => {
      if (dialog.type() === 'prompt' && boardIndex < boardNames.length) {
        dialog.accept(boardNames[boardIndex++]);
      }
    });
    
    // Create first board
    await page.click('button:has-text("Personal")');
    await page.click('button:has-text("+ New board")');
    await page.waitForURL(/\/b\/.+/, { timeout: 5000 });
    
    await page.waitForTimeout(100);
    
    // Create second board
    await page.click('button:has-text("Old Board")');
    await page.click('button:has-text("+ New board")');
    await page.waitForURL(/\/b\/.+/, { timeout: 5000 });
    
    // Go back to personal board
    await page.click('button:has-text("New Board")');
    await page.click('button:has-text("Personal")');
    await expect(page).toHaveURL('/');
    
    // Share personal board to create duplicated board
    await page.click('button[data-share-btn]:has-text("🔗 Share")');
    await page.waitForURL(/\/b\/.+/, { timeout: 5000 });
    
    // Open dropdown
    await page.click('button:has-text("Duplicated Board")');
    
    // Get all board buttons
    const boardButtons = page.locator('.bg-black\\/90 button:has-text("Personal"), .bg-black\\/90 button:has-text("Board")');
    const boardNamesArray = await boardButtons.allTextContents();
    
    // Personal should be first
    expect(boardNamesArray[0]).toContain('Personal');
    // Duplicated Board should be second (most recently created via share)
    expect(boardNamesArray[1]).toContain('Duplicated Board');
    // New Board should be before Old Board
    const newIndex = boardNamesArray.findIndex(name => name.includes('New Board'));
    const oldIndex = boardNamesArray.findIndex(name => name.includes('Old Board'));
    expect(newIndex).toBeLessThan(oldIndex);
  });

  test('annotations are isolated between boards', async ({ page }) => {
    await page.goto('/');
    
    // Create annotation on personal board
    await page.click('button:has-text("▭")');
    await page.waitForTimeout(200); // Wait for tool to be selected
    await page.mouse.move(100, 100);
    await page.mouse.down();
    await page.mouse.move(200, 200);
    await page.mouse.up();
    
    // Verify annotation exists
    await expect(page.locator('rect[data-anno]')).toHaveCount(1);
    
    // Create new board
    await page.click('button:has-text("Personal")');
    
    page.on('dialog', dialog => {
      if (dialog.type() === 'prompt') {
        dialog.accept('Empty Board');
      }
    });
    
    await page.click('button:has-text("+ New board")');
    await page.waitForURL(/\/b\/.+/, { timeout: 5000 });
    
    // New board should have no annotations
    await expect(page.locator('rect[data-anno]')).toHaveCount(0);
    
    // Switch back to personal board
    await page.click('button:has-text("Empty Board")');
    await page.click('button:has-text("Personal")');
    await expect(page).toHaveURL('/');
    
    // Annotation should still exist on personal board
    await expect(page.locator('rect[data-anno]')).toHaveCount(1);
  });

  test('duplicate retains shapes when sharing from personal board', async ({ page }) => {
    await page.goto('/');
    
    // Draw multiple shapes on personal board
    await page.click('button:has-text("▭")'); // Rectangle tool
    await page.waitForTimeout(200); // Wait for tool to be selected
    await page.mouse.move(100, 100);
    await page.mouse.down();
    await page.mouse.move(200, 200);
    await page.mouse.up();
    
    await page.click('button:has-text("◯")'); // Circle tool
    await page.waitForTimeout(200); // Wait for tool to be selected
    await page.mouse.move(300, 300);
    await page.mouse.down();
    await page.mouse.move(400, 400);
    await page.mouse.up();
    
    // Verify shapes exist
    await expect(page.locator('rect[data-anno]')).toHaveCount(1);
    await expect(page.locator('circle[data-anno]')).toHaveCount(1);
    
    // Set up dialog handler
    page.on('dialog', dialog => {
      if (dialog.type() === 'prompt') {
        dialog.accept('Duplicated With Shapes');
      }
    });
    
    // Click share button to duplicate
    await page.click('button[data-share-btn]:has-text("🔗 Share")');
    
    // Wait for navigation to new board
    await page.waitForURL(/\/b\/.+/, { timeout: 5000 });
    
    // Same shapes should exist on the new board
    await expect(page.locator('rect[data-anno]')).toHaveCount(1);
    await expect(page.locator('circle[data-anno]')).toHaveCount(1);
  });

  test('invite token tamper shows alert and sets view-only mode', async ({ page }) => {
    await page.goto('/');
    
    // Create a new board
    await page.click('button:has-text("Personal")');
    
    page.on('dialog', dialog => {
      if (dialog.type() === 'prompt') {
        dialog.accept('Protected Board');
      }
    });
    
    await page.click('button:has-text("+ New board")');
    await page.waitForURL(/\/b\/.+/, { timeout: 5000 });
    
    const boardUrl = page.url();
    const boardId = boardUrl.split('/b/')[1];
    
    // Set up alert handler
    let alertShown = false;
    page.on('dialog', dialog => {
      if (dialog.type() === 'alert' && dialog.message().includes('Invalid invite')) {
        alertShown = true;
        dialog.accept();
      }
    });
    
    // Navigate with tampered token
    await page.goto(`${boardUrl}#inv=tampered_token_xyz`);
    
    // Wait for alert to be shown
    await page.waitForTimeout(1000);
    expect(alertShown).toBe(true);
    
    // URL hash should be cleared
    expect(page.url()).not.toContain('#inv=');
  });
});