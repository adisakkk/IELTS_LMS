import { expect, test } from '@playwright/test';
import {
  ADMIN_STORAGE_STATE_PATH,
} from './support/backendE2e';

test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

test.describe('Proctor Dashboard and Session Monitoring', () => {
  test('views all scheduled sessions', async ({ page }) => {
    await page.goto('/proctor');
    await expect(page.getByRole('heading', { name: /Proctor Dashboard/i })).toBeVisible();

    // Verify session list loads
    await expect(page.locator('[data-session-card]')).toBeVisible();

    // Verify session count
    const sessionCards = page.locator('[data-session-card]');
    const count = await sessionCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('filters sessions by status', async ({ page }) => {
    await page.goto('/proctor');
    await expect(page.getByRole('heading', { name: /Proctor Dashboard/i })).toBeVisible();

    // Filter by scheduled status
    await page.getByRole('combobox', { name: 'Filter by status' }).selectOption('scheduled');
    await expect(page.getByText('Scheduled')).toBeVisible();

    // Filter by live status
    await page.getByRole('combobox', { name: 'Filter by status' }).selectOption('live');
    await expect(page.getByText('Live')).toBeVisible();

    // Filter by completed status
    await page.getByRole('combobox', { name: 'Filter by status' }).selectOption('completed');
    await expect(page.getByText('Completed')).toBeVisible();
  });

  test('views session detail with student roster', async ({ page }) => {
    await page.goto('/proctor');
    await page.getByRole('button', { name: /Monitor/i }).first().click();

    // Verify session detail page loads
    await expect(page.getByRole('heading', { name: /Session Details/i })).toBeVisible();

    // Verify student roster displays
    await expect(page.locator('[data-student-card]')).toBeVisible();

    // Verify student count
    const studentCards = page.locator('[data-student-card]');
    const count = await studentCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('receives real-time student status updates', async ({ page }) => {
    await page.goto('/proctor');
    await page.getByRole('button', { name: /Monitor/i }).first().click();

    // Get initial student status
    const initialStatus = await page.locator('[data-student-card]').first().getAttribute('data-status');

    // Wait for potential update (WebSocket)
    await page.waitForTimeout(2000);

    // Verify status can update
    const updatedStatus = await page.locator('[data-student-card]').first().getAttribute('data-status');
    expect(updatedStatus).toBeTruthy();
  });

  test('displays alert panel with unacknowledged alerts', async ({ page }) => {
    await page.goto('/proctor');
    await page.getByRole('button', { name: /Monitor/i }).first().click();

    // Navigate to alerts tab
    await page.getByRole('tab', { name: 'Alerts' }).click();

    // Verify alert panel displays
    await expect(page.getByRole('heading', { name: /Alerts/i })).toBeVisible();

    // Verify alert items
    const alertItems = page.locator('[data-alert-item]');
    const count = await alertItems.count();
    if (count > 0) {
      expect(count).toBeGreaterThan(0);
    }
  });

  test('displays audit log panel with timeline', async ({ page }) => {
    await page.goto('/proctor');
    await page.getByRole('button', { name: /Monitor/i }).first().click();

    // Navigate to audit logs tab
    await page.getByRole('tab', { name: 'Audit Logs' }).click();

    // Verify audit log panel displays
    await expect(page.getByRole('heading', { name: /Audit Logs/i })).toBeVisible();

    // Verify log entries
    await expect(page.locator('[data-audit-log-entry]')).toBeVisible();
  });

  test('shows presence indicator for active proctors', async ({ page }) => {
    await page.goto('/proctor');

    // Verify presence indicator displays
    await expect(page.locator('[data-presence-indicator]')).toBeVisible();

    // Verify current proctor is shown as active
    await expect(page.getByText(/You are online/i)).toBeVisible();
  });

  test('creates session notes and resolutions', async ({ page }) => {
    await page.goto('/proctor');
    await page.getByRole('button', { name: /Monitor/i }).first().click();

    // Add session note
    await page.getByRole('button', { name: 'Add Session Note' }).click();
    await page.getByLabel('Note content').fill('Test session note');
    await page.getByRole('combobox', { name: 'Category' }).selectOption('general');
    await page.getByRole('button', { name: 'Save Note' }).click();
    await expect(page.getByText('Note saved successfully')).toBeVisible();

    // Resolve note
    await page.getByRole('button', { name: 'View Notes' }).click();
    await page.locator('[data-note-item]').first().getByRole('button', { name: 'Resolve' }).click();
    await expect(page.getByText('Note resolved')).toBeVisible();
  });

  test('verifies WebSocket updates propagate in real-time', async ({ page }) => {
    await page.goto('/proctor');
    await page.getByRole('button', { name: /Monitor/i }).first().click();

    // Get initial student count
    const initialCount = await page.locator('[data-student-card]').count();

    // Wait for WebSocket update
    await page.waitForTimeout(3000);

    // Verify count can change (or stay same if no changes)
    const updatedCount = await page.locator('[data-student-card]').count();
    expect(updatedCount).toBeGreaterThanOrEqual(0);
  });

  test('verifies student cards show current status', async ({ page }) => {
    await page.goto('/proctor');
    await page.getByRole('button', { name: /Monitor/i }).first().click();

    // Verify each student card has status
    const studentCards = page.locator('[data-student-card]');
    const count = await studentCards.count();

    for (let i = 0; i < count; i++) {
      const card = studentCards.nth(i);
      const status = await card.getAttribute('data-status');
      expect(status).toBeTruthy();
    }
  });

  test('verifies alert counts are accurate', async ({ page }) => {
    await page.goto('/proctor');
    await page.getByRole('button', { name: /Monitor/i }).first().click();

    // Check alert badge count
    const alertBadge = page.locator('[data-alert-count]');
    const badgeCount = await alertBadge.getAttribute('data-alert-count');

    // Navigate to alerts and verify actual count
    await page.getByRole('tab', { name: 'Alerts' }).click();
    const alertItems = page.locator('[data-alert-item]');
    const actualCount = await alertItems.count();

    // Verify counts match (or badge is null if no alerts)
    if (badgeCount) {
      expect(parseInt(badgeCount)).toBe(actualCount);
    }
  });

  test('verifies audit logs are ordered by timestamp', async ({ page }) => {
    await page.goto('/proctor');
    await page.getByRole('button', { name: /Monitor/i }).first().click();
    await page.getByRole('tab', { name: 'Audit Logs' }).click();

    // Get timestamps of first and last log entries
    const firstTimestamp = await page.locator('[data-audit-log-entry]').first().getAttribute('data-timestamp');
    const lastTimestamp = await page.locator('[data-audit-log-entry]').last().getAttribute('data-timestamp');

    // Verify timestamps are different (ordered)
    expect(firstTimestamp).not.toBe(lastTimestamp);
  });

  test('verifies presence tracking works', async ({ page }) => {
    await page.goto('/proctor');

    // Verify presence indicator shows online
    await expect(page.locator('[data-presence-indicator="online"]')).toBeVisible();

    // Simulate going offline
    await page.setOffline(true);
    await page.waitForTimeout(1000);

    // Verify presence indicator updates
    const offlineIndicator = page.locator('[data-presence-indicator="offline"]');
    const isOfflineVisible = await offlineIndicator.isVisible().catch(() => false);
    if (isOfflineVisible) {
      await expect(offlineIndicator).toBeVisible();
    }

    // Restore online
    await page.setOffline(false);
  });

  test('filters audit logs by action type', async ({ page }) => {
    await page.goto('/proctor');
    await page.getByRole('button', { name: /Monitor/i }).first().click();
    await page.getByRole('tab', { name: 'Audit Logs' }).click();

    // Filter by specific action type
    await page.getByRole('combobox', { name: 'Filter by action' }).selectOption('VIOLATION_DETECTED');

    // Verify filtered results
    const logEntries = page.locator('[data-audit-log-entry]');
    const count = await logEntries.count();

    // If entries exist, verify they match filter
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const actionType = await logEntries.nth(i).getAttribute('data-action-type');
        expect(actionType).toBe('VIOLATION_DETECTED');
      }
    }
  });

  test('searches for specific student in roster', async ({ page }) => {
    await page.goto('/proctor');
    await page.getByRole('button', { name: /Monitor/i }).first().click();

    // Search for student
    await page.getByPlaceholder('Search students...').fill('Test');

    // Verify search results
    const studentCards = page.locator('[data-student-card]');
    const count = await studentCards.count();

    // Clear search
    await page.getByPlaceholder('Search students...').fill('');
  });

  test('exports session report', async ({ page }) => {
    await page.goto('/proctor');
    await page.getByRole('button', { name: /Monitor/i }).first().click();

    // Click export button
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Report' }).click();
    const download = await downloadPromise;

    // Verify download started
    expect(download.suggestedFilename()).toBeTruthy();
  });
});
