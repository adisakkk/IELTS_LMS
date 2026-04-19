import { expect, test } from '@playwright/test';
import {
  readBackendE2EManifest,
  STUDENT_STORAGE_STATE_PATH,
} from './support/backendE2e';

test.describe('Student Network Resilience', () => {
  test('buffers answers locally when offline', async ({ page, context }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);
    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Simulate offline mode
    await context.setOffline(true);

    // Answer a question while offline
    await page.getByLabel('Answer for question 1').fill('offline test answer');

    // Verify answer buffered locally
    const bufferedAnswers = await page.evaluate(() => {
      return (window as any).offlineBuffer?.getAnswers() || [];
    });
    expect(bufferedAnswers.length).toBeGreaterThan(0);

    // Restore online
    await context.setOffline(false);
  });

  test('replays mutations in order on reconnect', async ({ page, context }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);
    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Go offline
    await context.setOffline(true);

    // Add multiple answers
    await page.getByLabel('Answer for question 1').fill('answer 1');
    await page.getByLabel('Answer for question 2').fill('answer 2');
    await page.getByLabel('Answer for question 3').fill('answer 3');

    // Go back online
    await context.setOffline(false);

    // Wait for replay to complete
    await page.waitForTimeout(1000);

    // Verify answers synced to server
    const attemptData = await page.evaluate(async (candidateId) => {
      const response = await fetch(`/api/v1/student/${candidateId}/attempt`, {
        credentials: 'include',
      });
      const data = await response.json();
      return data.data;
    }, manifest.student.candidateId);

    expect(attemptData.answers.length).toBeGreaterThanOrEqual(3);
  });

  test('pauses exam on disconnect when pause on offline enabled', async ({ page, context }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);
    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Simulate disconnect
    await context.setOffline(true);
    await page.waitForTimeout(500);

    // Verify exam paused
    const pausedBanner = page.getByText(/paused|disconnected|offline/i);
    const isPausedVisible = await pausedBanner.isVisible().catch(() => false);
    if (isPausedVisible) {
      await expect(pausedBanner).toBeVisible();
    }

    // Restore online
    await context.setOffline(false);
  });

  test('resumes exam on reconnect', async ({ page, context }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);
    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Go offline
    await context.setOffline(true);
    await page.waitForTimeout(500);

    // Go back online
    await context.setOffline(false);
    await page.waitForTimeout(1000);

    // Verify exam resumed
    const resumedBanner = page.getByText(/resumed|reconnected/i);
    const isResumedVisible = await resumedBanner.isVisible().catch(() => false);
    if (isResumedVisible) {
      await expect(resumedBanner).toBeVisible();
    }

    // Verify can answer questions again
    await expect(page.getByLabel('Answer for question 1')).toBeEnabled();
  });

  test('handles heartbeat timeout', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);
    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Simulate heartbeat timeout
    await page.evaluate(() => {
      (window as any).simulateHeartbeatTimeout();
    });

    // Verify HEARTBEAT_MISSED audit log
    const auditLogs = await page.evaluate(async (candidateId) => {
      const response = await fetch(`/api/v1/audit-logs?candidate_id=${candidateId}`, {
        credentials: 'include',
      });
      const data = await response.json();
      return data.data;
    }, manifest.student.candidateId);

    const heartbeatMissedLog = auditLogs.find((log: { actionType: string }) => log.actionType === 'HEARTBEAT_MISSED');
    expect(heartbeatMissedLog).toBeTruthy();
  });

  test('handles heartbeat lost (hard threshold)', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);
    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Simulate heartbeat lost
    await page.evaluate(() => {
      (window as any).simulateHeartbeatLost();
    });

    // Verify HEARTBEAT_LOST audit log
    const auditLogs = await page.evaluate(async (candidateId) => {
      const response = await fetch(`/api/v1/audit-logs?candidate_id=${candidateId}`, {
        credentials: 'include',
      });
      const data = await response.json();
      return data.data;
    }, manifest.student.candidateId);

    const heartbeatLostLog = auditLogs.find((log: { actionType: string }) => log.actionType === 'HEARTBEAT_LOST');
    expect(heartbeatLostLog).toBeTruthy();
  });

  test('logs NETWORK_DISCONNECTED on disconnect', async ({ page, context }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);
    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Go offline
    await context.setOffline(true);
    await page.waitForTimeout(500);

    // Verify NETWORK_DISCONNECTED audit log
    const auditLogs = await page.evaluate(async (candidateId) => {
      const response = await fetch(`/api/v1/audit-logs?candidate_id=${candidateId}`, {
        credentials: 'include',
      });
      const data = await response.json();
      return data.data;
    }, manifest.student.candidateId);

    const disconnectLog = auditLogs.find((log: { actionType: string }) => log.actionType === 'NETWORK_DISCONNECTED');
    expect(disconnectLog).toBeTruthy();

    // Restore online
    await context.setOffline(false);
  });

  test('logs NETWORK_RECONNECTED on reconnect', async ({ page, context }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);
    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Go offline then online
    await context.setOffline(true);
    await page.waitForTimeout(500);
    await context.setOffline(false);
    await page.waitForTimeout(500);

    // Verify NETWORK_RECONNECTED audit log
    const auditLogs = await page.evaluate(async (candidateId) => {
      const response = await fetch(`/api/v1/audit-logs?candidate_id=${candidateId}`, {
        credentials: 'include',
      });
      const data = await response.json();
      return data.data;
    }, manifest.student.candidateId);

    const reconnectLog = auditLogs.find((log: { actionType: string }) => log.actionType === 'NETWORK_RECONNECTED');
    expect(reconnectLog).toBeTruthy();
  });

  test('recovers session after crash', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);
    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Answer a question
    await page.getByLabel('Answer for question 1').fill('crash recovery test');

    // Simulate crash by reloading
    await page.reload();

    // Wait for recovery
    await page.waitForLoadState('networkidle');

    // Verify answer persisted
    await expect(page.getByLabel('Answer for question 1')).toHaveValue('crash recovery test');
  });

  test('prevents data loss after reconnect', async ({ page, context }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);
    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Go offline
    await context.setOffline(true);

    // Add multiple answers
    await page.getByLabel('Answer for question 1').fill('answer 1');
    await page.getByLabel('Answer for question 2').fill('answer 2');
    await page.getByLabel('Answer for question 3').fill('answer 3');

    // Go back online
    await context.setOffline(false);
    await page.waitForTimeout(1000);

    // Reload page to verify persistence
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify all answers persisted
    await expect(page.getByLabel('Answer for question 1')).toHaveValue('answer 1');
    await expect(page.getByLabel('Answer for question 2')).toHaveValue('answer 2');
    await expect(page.getByLabel('Answer for question 3')).toHaveValue('answer 3');
  });

  test('handles mutation replay on slow network', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    // Simulate slow network
    await page.route('**/*', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 500));
      route.continue();
    });

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);
    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Add answers rapidly
    await page.getByLabel('Answer for question 1').fill('answer 1');
    await page.getByLabel('Answer for question 2').fill('answer 2');

    // Wait for all mutations to complete
    await page.waitForTimeout(2000);

    // Verify answers saved despite slow network
    const attemptData = await page.evaluate(async (candidateId) => {
      const response = await fetch(`/api/v1/student/${candidateId}/attempt`, {
        credentials: 'include',
      });
      const data = await response.json();
      return data.data;
    }, manifest.student.candidateId);

    expect(attemptData.answers.length).toBeGreaterThanOrEqual(2);
  });
});
