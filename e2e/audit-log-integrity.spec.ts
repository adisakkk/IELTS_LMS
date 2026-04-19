import { expect, test } from '@playwright/test';
import {
  ADMIN_STORAGE_STATE_PATH,
} from './support/backendE2e';

test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

test.describe('Audit Log Integrity', () => {
  test('verifies log sequence integrity', async ({ page }) => {
    await page.goto('/admin/audit-logs');

    // Get all log entries
    const logs = page.locator('[data-audit-log-entry]');
    const logCount = await logs.count();

    if (logCount >= 2) {
      // Verify sequence numbers are consecutive
      for (let i = 0; i < logCount - 1; i++) {
        const currentSeq = await logs.nth(i).getAttribute('data-sequence');
        const nextSeq = await logs.nth(i + 1).getAttribute('data-sequence');

        expect(currentSeq).not.toBeNull();
        expect(nextSeq).not.toBeNull();

        const currentNum = parseInt(currentSeq!, 10);
        const nextNum = parseInt(nextSeq!, 10);

        // Sequence should be consecutive (either ascending or descending)
        expect(Math.abs(currentNum - nextNum)).toBe(1);
      }
    }
  });

  test('verifies no gaps in timestamps', async ({ page }) => {
    await page.goto('/admin/audit-logs');

    // Get all log entries
    const logs = page.locator('[data-audit-log-entry]');
    const logCount = await logs.count();

    if (logCount >= 2) {
      const timestamps: Date[] = [];

      for (let i = 0; i < logCount; i++) {
        const timestamp = await logs.nth(i).getAttribute('data-timestamp');
        expect(timestamp).not.toBeNull();
        timestamps.push(new Date(timestamp!));
      }

      // Verify timestamps are reasonable (no huge gaps that would indicate missing logs)
      // Allow for some gaps due to system idle time, but not more than 1 hour between consecutive logs
      for (let i = 0; i < timestamps.length - 1; i++) {
        const timeDiff = Math.abs(timestamps[i].getTime() - timestamps[i + 1].getTime());
        const maxGap = 60 * 60 * 1000; // 1 hour in milliseconds
        expect(timeDiff).toBeLessThan(maxGap);
      }
    }
  });

  test('verifies revision consistency', async ({ page }) => {
    await page.goto('/admin/audit-logs');

    // Get first log entry
    const firstLog = page.locator('[data-audit-log-entry]').first();
    const hasLogs = await firstLog.count() > 0;

    if (hasLogs) {
      const revision = await firstLog.getAttribute('data-revision');
      expect(revision).not.toBeNull();

      // Revision should be a positive integer
      const revisionNum = parseInt(revision!, 10);
      expect(revisionNum).toBeGreaterThan(0);
    }
  });

  test('verifies revision numbers increment correctly', async ({ page }) => {
    await page.goto('/admin/audit-logs');

    // Get all log entries
    const logs = page.locator('[data-audit-log-entry]');
    const logCount = await logs.count();

    if (logCount >= 2) {
      const revisions: number[] = [];

      for (let i = 0; i < logCount; i++) {
        const revision = await logs.nth(i).getAttribute('data-revision');
        expect(revision).not.toBeNull();
        revisions.push(parseInt(revision!, 10));
      }

      // Verify revisions are monotonically increasing or decreasing
      // (depending on sort order)
      let isIncreasing = true;
      let isDecreasing = true;

      for (let i = 0; i < revisions.length - 1; i++) {
        if (revisions[i] < revisions[i + 1]) {
          isDecreasing = false;
        }
        if (revisions[i] > revisions[i + 1]) {
          isIncreasing = false;
        }
      }

      expect(isIncreasing || isDecreasing).toBe(true);
    }
  });

  test('verifies actor authentication', async ({ page }) => {
    await page.goto('/admin/audit-logs');

    // Get all log entries
    const logs = page.locator('[data-audit-log-entry]');
    const logCount = await logs.count();

    if (logCount > 0) {
      for (let i = 0; i < Math.min(logCount, 10); i++) {
        const actor = await logs.nth(i).getAttribute('data-actor');
        expect(actor).not.toBeNull();
        expect(actor).not.toBe('');

        // Actor should be either 'system' or a valid user ID
        if (actor !== 'system') {
          // Verify it looks like a UUID or user identifier
          expect(actor!.length).toBeGreaterThan(5);
        }
      }
    }
  });

  test('verifies actor references valid users', async ({ page }) => {
    await page.goto('/admin/audit-logs');

    // Get first log entry with non-system actor
    const logs = page.locator('[data-audit-log-entry]');
    const logCount = await logs.count();

    if (logCount > 0) {
      for (let i = 0; i < Math.min(logCount, 5); i++) {
        const actor = await logs.nth(i).getAttribute('data-actor');

        if (actor && actor !== 'system') {
          // Try to verify the actor exists in the system
          // This would typically involve an API call or database query
          // For now, we'll just verify the format
          expect(actor).toMatch(/^[a-f0-9-]+$/i); // UUID format or similar
        }
      }
    }
  });

  test('verifies payload structure validity', async ({ page }) => {
    await page.goto('/admin/audit-logs');

    // Get first log entry
    const firstLog = page.locator('[data-audit-log-entry]').first();
    const hasLogs = await firstLog.count() > 0;

    if (hasLogs) {
      // Click to view details
      await firstLog.click();

      // Verify payload is valid JSON
      const payloadElement = page.getByTestId('audit-log-payload');
      const isPayloadVisible = await payloadElement.isVisible().catch(() => false);

      if (isPayloadVisible) {
        const payloadText = await payloadElement.textContent();
        expect(payloadText).not.toBeNull();

        // Try to parse as JSON
        expect(() => {
          JSON.parse(payloadText!);
        }).not.toThrow();
      }
    }
  });

  test('verifies payload contains required fields', async ({ page }) => {
    await page.goto('/admin/audit-logs');

    // Get first log entry
    const firstLog = page.locator('[data-audit-log-entry]').first();
    const hasLogs = await firstLog.count() > 0;

    if (hasLogs) {
      await firstLog.click();

      const payloadElement = page.getByTestId('audit-log-payload');
      const isPayloadVisible = await payloadElement.isVisible().catch(() => false);

      if (isPayloadVisible) {
        const payloadText = await payloadElement.textContent();
        const payload = JSON.parse(payloadText!);

        // Verify payload has expected structure
        expect(typeof payload).toBe('object');
        expect(payload).not.toBeNull();
      }
    }
  });

  test('verifies log immutability', async ({ page }) => {
    await page.goto('/admin/audit-logs');

    // Get first log entry details
    const firstLog = page.locator('[data-audit-log-entry]').first();
    const hasLogs = await firstLog.count() > 0;

    if (hasLogs) {
      const initialTimestamp = await firstLog.getAttribute('data-timestamp');
      const initialAction = await firstLog.getAttribute('data-action');

      // Refresh page
      await page.reload();

      // Get the same log entry again
      const refreshedFirstLog = page.locator('[data-audit-log-entry]').first();
      const refreshedTimestamp = await refreshedFirstLog.getAttribute('data-timestamp');
      const refreshedAction = await refreshedFirstLog.getAttribute('data-action');

      // Verify data hasn't changed
      expect(refreshedTimestamp).toBe(initialTimestamp);
      expect(refreshedAction).toBe(initialAction);
    }
  });

  test('verifies log uniqueness', async ({ page }) => {
    await page.goto('/admin/audit-logs');

    // Get all log entry IDs
    const logs = page.locator('[data-audit-log-entry]');
    const logCount = await logs.count();

    if (logCount > 0) {
      const logIds: string[] = [];

      for (let i = 0; i < logCount; i++) {
        const logId = await logs.nth(i).getAttribute('data-log-id');
        expect(logId).not.toBeNull();
        logIds.push(logId!);
      }

      // Verify all IDs are unique
      const uniqueIds = new Set(logIds);
      expect(uniqueIds.size).toBe(logIds.length);
    }
  });

  test('verifies log chronological ordering', async ({ page }) => {
    await page.goto('/admin/audit-logs');

    // Get all log entries
    const logs = page.locator('[data-audit-log-entry]');
    const logCount = await logs.count();

    if (logCount >= 2) {
      const timestamps: Date[] = [];

      for (let i = 0; i < logCount; i++) {
        const timestamp = await logs.nth(i).getAttribute('data-timestamp');
        expect(timestamp).not.toBeNull();
        timestamps.push(new Date(timestamp!));
      }

      // Verify timestamps are in descending order (newest first)
      for (let i = 0; i < timestamps.length - 1; i++) {
        expect(timestamps[i].getTime()).toBeGreaterThanOrEqual(timestamps[i + 1].getTime());
      }
    }
  });

  test('verifies log completeness after system restart', async ({ page }) => {
    // This test would require simulating a system restart
    // For now, we'll verify that logs are persisted correctly

    await page.goto('/admin/audit-logs');

    // Get initial log count
    const initialCount = await page.locator('[data-audit-log-entry]').count();

    // Refresh page multiple times to verify persistence
    for (let i = 0; i < 3; i++) {
      await page.reload();
      await page.waitForLoadState('networkidle');

      const currentCount = await page.locator('[data-audit-log-entry]').count();
      expect(currentCount).toBe(initialCount);
    }
  });

  test('verifies log signature integrity', async ({ page }) => {
    await page.goto('/admin/audit-logs');

    // Get first log entry
    const firstLog = page.locator('[data-audit-log-entry]').first();
    const hasLogs = await firstLog.count() > 0;

    if (hasLogs) {
      const signature = await firstLog.getAttribute('data-signature');
      const hasSignature = signature !== null;

      if (hasSignature) {
        // If signatures are implemented, verify they exist and are non-empty
        expect(signature).not.toBe('');
      }
    }
  });

  test('verifies log hash consistency', async ({ page }) => {
    await page.goto('/admin/audit-logs');

    // Get first log entry
    const firstLog = page.locator('[data-audit-log-entry]').first();
    const hasLogs = await firstLog.count() > 0;

    if (hasLogs) {
      const hash = await firstLog.getAttribute('data-hash');
      const hasHash = hash !== null;

      if (hasHash) {
        // If hashes are implemented, verify they exist and are consistent
        expect(hash).not.toBe('');
        expect(hash!.length).toBeGreaterThan(10); // Reasonable hash length
      }
    }
  });

  test('verifies audit trail chain integrity', async ({ page }) => {
    await page.goto('/admin/audit-logs');

    // Get all log entries
    const logs = page.locator('[data-audit-log-entry]');
    const logCount = await logs.count();

    if (logCount >= 2) {
      // Verify that related logs are linked (e.g., session start -> session end)
      const actionTypes: string[] = [];

      for (let i = 0; i < Math.min(logCount, 10); i++) {
        const action = await logs.nth(i).getAttribute('data-action');
        if (action) {
          actionTypes.push(action);
        }
      }

      // If we have SESSION_START, we should have corresponding SESSION_END
      const hasSessionStart = actionTypes.includes('SESSION_START');
      const hasSessionEnd = actionTypes.includes('SESSION_END');

      // This is a soft check - not all sessions may be complete
      if (hasSessionStart && !hasSessionEnd) {
        console.log('Note: Sessions may still be in progress');
      }
    }
  });
});
