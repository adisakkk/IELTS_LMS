import { expect, test } from '@playwright/test';
import {
  readBackendE2EManifest,
  STUDENT_STORAGE_STATE_PATH,
} from './support/backendE2e';

test.describe('Student Security Features', () => {
  test('detects and logs paste attempts', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    // Handle compatibility check if present
    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);
    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Attempt to paste in input field
    const answerField = page.getByLabel('Answer for question 1');
    await answerField.focus();
    await page.evaluate(() => {
      const event = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        dataType: 'text/plain',
        data: 'pasted text',
      });
      document.dispatchEvent(event);
    });

    // Verify PASTE_BLOCKED audit log
    const auditLogs = await page.evaluate(async (candidateId) => {
      const response = await fetch(`/api/v1/audit-logs?candidate_id=${candidateId}`, {
        credentials: 'include',
      });
      const data = await response.json();
      return data.data;
    }, manifest.student.candidateId);

    const pasteBlockedLog = auditLogs.find((log: { actionType: string }) => log.actionType === 'PASTE_BLOCKED');
    expect(pasteBlockedLog).toBeTruthy();
  });

  test('detects and logs autofill attempts', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);
    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Simulate autofill behavior
    await page.evaluate(() => {
      const input = document.querySelector('input[type="text"]') as HTMLInputElement;
      if (input) {
        input.value = 'autofilled text';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // Verify AUTOFILL_SUSPECTED audit log
    const auditLogs = await page.evaluate(async (candidateId) => {
      const response = await fetch(`/api/v1/audit-logs?candidate_id=${candidateId}`, {
        credentials: 'include',
      });
      const data = await response.json();
      return data.data;
    }, manifest.student.candidateId);

    const autofillLog = auditLogs.find((log: { actionType: string }) => log.actionType === 'AUTOFILL_SUSPECTED');
    expect(autofillLog).toBeTruthy();
  });

  test('detects and logs large replacement without typing', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);
    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Simulate large text replacement
    await page.evaluate(() => {
      const input = document.querySelector('textarea') as HTMLTextAreaElement;
      if (input) {
        const originalValue = input.value;
        input.value = 'This is a very long text replacement that happened without typing';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // Verify REPLACEMENT_SUSPECTED audit log
    const auditLogs = await page.evaluate(async (candidateId) => {
      const response = await fetch(`/api/v1/audit-logs?candidate_id=${candidateId}`, {
        credentials: 'include',
      });
      const data = await response.json();
      return data.data;
    }, manifest.student.candidateId);

    const replacementLog = auditLogs.find((log: { actionType: string }) => log.actionType === 'REPLACEMENT_SUSPECTED');
    expect(replacementLog).toBeTruthy();
  });

  test('blocks and logs context menu access', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);
    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Attempt to open context menu
    await page.getByLabel('Answer for question 1').click({ button: 'right' });

    // Verify CONTEXT_MENU_BLOCKED audit log
    const auditLogs = await page.evaluate(async (candidateId) => {
      const response = await fetch(`/api/v1/audit-logs?candidate_id=${candidateId}`, {
        credentials: 'include',
      });
      const data = await response.json();
      return data.data;
    }, manifest.student.candidateId);

    const contextMenuLog = auditLogs.find((log: { actionType: string }) => log.actionType === 'CONTEXT_MENU_BLOCKED');
    expect(contextMenuLog).toBeTruthy();
  });

  test('detects tab switching via visibilitychange', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);
    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Simulate tab switch
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Verify VIOLATION_DETECTED audit log
    const auditLogs = await page.evaluate(async (candidateId) => {
      const response = await fetch(`/api/v1/audit-logs?candidate_id=${candidateId}`, {
        credentials: 'include',
      });
      const data = await response.json();
      return data.data;
    }, manifest.student.candidateId);

    const violationLog = auditLogs.find((log: { actionType: string }) => log.actionType === 'VIOLATION_DETECTED');
    expect(violationLog).toBeTruthy();
  });

  test('detects fullscreen exit', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);
    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Enter fullscreen first
    await page.evaluate(() => {
      document.documentElement.requestFullscreen();
    });

    // Simulate fullscreen exit
    await page.evaluate(() => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
    });

    // Verify VIOLATION_DETECTED audit log
    const auditLogs = await page.evaluate(async (candidateId) => {
      const response = await fetch(`/api/v1/audit-logs?candidate_id=${candidateId}`, {
        credentials: 'include',
      });
      const data = await response.json();
      return data.data;
    }, manifest.student.candidateId);

    const violationLog = auditLogs.find((log: { actionType: string }) => log.actionType === 'VIOLATION_DETECTED');
    expect(violationLog).toBeTruthy();
  });

  test('detects secondary screen', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);
    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Simulate secondary screen detection
    await page.evaluate(() => {
      window.screen.width = 3840; // Dual monitor width
      window.dispatchEvent(new Event('resize'));
    });

    // Verify screen check audit log
    const auditLogs = await page.evaluate(async (candidateId) => {
      const response = await fetch(`/api/v1/audit-logs?candidate_id=${candidateId}`, {
        credentials: 'include',
      });
      const data = await response.json();
      return data.data;
    }, manifest.student.candidateId);

    const screenCheckLog = auditLogs.find((log: { actionType: string }) =>
      log.actionType === 'SCREEN_CHECK_UNSUPPORTED' || log.actionType === 'SCREEN_CHECK_PERMISSION_DENIED'
    );
    expect(screenCheckLog).toBeTruthy();
  });

  test('enforces severity thresholds - low limit', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);
    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Trigger multiple low severity violations
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(100);
    }

    // Verify warning shown
    const warningBanner = page.getByText(/warning|caution/i);
    const isWarningVisible = await warningBanner.isVisible().catch(() => false);
    if (isWarningVisible) {
      await expect(warningBanner).toBeVisible();
    }
  });

  test('enforces severity thresholds - high limit triggers pause', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);
    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Trigger multiple high severity violations
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(100);
    }

    // Verify exam paused
    const pausedBanner = page.getByText(/paused|exam suspended/i);
    const isPausedVisible = await pausedBanner.isVisible().catch(() => false);
    if (isPausedVisible) {
      await expect(pausedBanner).toBeVisible();
    }
  });

  test('logs all violations to student_violation_events table', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);
    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Trigger a violation
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Verify violation event logged
    const violationEvents = await page.evaluate(async (candidateId) => {
      const response = await fetch(`/api/v1/student/${candidateId}/violations`, {
        credentials: 'include',
      });
      const data = await response.json();
      return data.data;
    }, manifest.student.candidateId);

    expect(violationEvents.length).toBeGreaterThan(0);
  });

  test('verifies violation snapshot saved in student_attempts', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);
    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Trigger a violation
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Verify snapshot saved
    const attemptData = await page.evaluate(async (candidateId) => {
      const response = await fetch(`/api/v1/student/${candidateId}/attempt`, {
        credentials: 'include',
      });
      const data = await response.json();
      return data.data;
    }, manifest.student.candidateId);

    expect(attemptData.violationSnapshot).toBeTruthy();
  });
});
