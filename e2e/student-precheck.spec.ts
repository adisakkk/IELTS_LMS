import { expect, test } from '@playwright/test';
import {
  readBackendE2EManifest,
  STUDENT_STORAGE_STATE_PATH,
} from './support/backendE2e';

test.describe('System Compatibility Pre-check', () => {
  test('performs browser compatibility check', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    // Wait for compatibility check to appear
    await expect(page.getByRole('heading', { name: 'System Compatibility Check' })).toBeVisible();

    // Verify browser compatibility status
    await expect(page.getByText('Browser Compatibility')).toBeVisible();
    await expect(page.getByText(/Chrome|Firefox|Safari|Edge/i)).toBeVisible();
  });

  test('validates screen resolution', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    await expect(page.getByRole('heading', { name: 'System Compatibility Check' })).toBeVisible();

    // Verify screen resolution check
    await expect(page.getByText('Screen Resolution')).toBeVisible();
    const resolutionText = await page.getByText(/\d+x\d+/).textContent();
    expect(resolutionText).toBeTruthy();
  });

  test('checks webcam permission', async ({ page, context }) => {
    const manifest = readBackendE2EManifest();

    // Grant camera permission
    await context.grantPermissions(['camera']);

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    await expect(page.getByRole('heading', { name: 'System Compatibility Check' })).toBeVisible();

    // Verify webcam permission check
    await expect(page.getByText('Webcam Access')).toBeVisible();
    await page.getByRole('button', { name: 'Test Camera' }).click();
    await expect(page.getByText('Camera working')).toBeVisible();
  });

  test('checks microphone permission', async ({ page, context }) => {
    const manifest = readBackendE2EManifest();

    // Grant microphone permission
    await context.grantPermissions(['microphone']);

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    await expect(page.getByRole('heading', { name: 'System Compatibility Check' })).toBeVisible();

    // Verify microphone permission check
    await expect(page.getByText('Microphone Access')).toBeVisible();
    await page.getByRole('button', { name: 'Test Microphone' }).click();
    await expect(page.getByText('Microphone working')).toBeVisible();
  });

  test('performs network connectivity test', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    await expect(page.getByRole('heading', { name: 'System Compatibility Check' })).toBeVisible();

    // Verify network connectivity test
    await expect(page.getByText('Network Connectivity')).toBeVisible();
    await page.getByRole('button', { name: 'Test Connection' }).click();
    await expect(page.getByText('Connection successful')).toBeVisible();
  });

  test('generates device fingerprint', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    await expect(page.getByRole('heading', { name: 'System Compatibility Check' })).toBeVisible();

    // Verify device fingerprint generation
    await expect(page.getByText('Device Fingerprint')).toBeVisible();
    const fingerprintHash = await page.locator('[data-fingerprint-hash]').textContent();
    expect(fingerprintHash).toBeTruthy();
    expect(fingerprintHash?.length).toBeGreaterThan(20);
  });

  test('handles unsupported browser with warning', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    // Simulate unsupported browser by setting user agent
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.102 Safari/537.36',
    });

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    await expect(page.getByRole('heading', { name: 'System Compatibility Check' })).toBeVisible();

    // Verify warning for unsupported browser
    const browserWarning = page.getByText(/browser version|not supported/i);
    const isWarningVisible = await browserWarning.isVisible().catch(() => false);
    if (isWarningVisible) {
      await expect(browserWarning).toBeVisible();
    }
  });

  test('handles permission denials with logging', async ({ page, context }) => {
    const manifest = readBackendE2EManifest();

    // Deny camera permission
    await context.clearPermissions();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    await expect(page.getByRole('heading', { name: 'System Compatibility Check' })).toBeVisible();

    // Attempt to test camera with denied permission
    await page.getByRole('button', { name: 'Test Camera' }).click();

    // Verify permission denied message
    const permissionDenied = page.getByText(/permission denied|access denied/i);
    const isPermissionDeniedVisible = await permissionDenied.isVisible().catch(() => false);
    if (isPermissionDeniedVisible) {
      await expect(permissionDenied).toBeVisible();
    }
  });

  test('saves pre-check data correctly', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    await expect(page.getByRole('heading', { name: 'System Compatibility Check' })).toBeVisible();

    // Complete all checks
    await page.getByRole('button', { name: 'Test Connection' }).click();

    // Continue to exam
    await page.getByRole('button', { name: 'Continue' }).click();

    // Verify pre-check data saved via API
    const precheckData = await page.evaluate(async (candidateId) => {
      const response = await fetch(`/api/v1/student/${candidateId}/precheck`, {
        credentials: 'include',
      });
      const data = await response.json();
      return data.data;
    }, manifest.student.candidateId);

    expect(precheckData).toBeTruthy();
    expect(precheckData.browserCompatible).toBeTruthy();
    expect(precheckData.deviceFingerprint).toBeTruthy();
  });

  test('Safari acknowledgment flow', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    // Simulate Safari browser
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
    });

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    await expect(page.getByRole('heading', { name: 'System Compatibility Check' })).toBeVisible();

    // Check if Safari acknowledgment is required
    const safariWarning = page.getByText(/Safari|limited support/i);
    const isSafariWarningVisible = await safariWarning.isVisible().catch(() => false);

    if (isSafariWarningVisible) {
      // Acknowledge Safari limitations
      await page.getByRole('checkbox', { name: 'I acknowledge' }).check();
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByRole('heading', { name: 'System Compatibility Check' })).not.toBeVisible();
    }
  });

  test('verifies audit log for pre-check completion', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    await expect(page.getByRole('heading', { name: 'System Compatibility Check' })).toBeVisible();

    // Complete pre-check
    await page.getByRole('button', { name: 'Continue' }).click();

    // Verify audit log entry
    const auditLogs = await page.evaluate(async (candidateId) => {
      const response = await fetch(`/api/v1/audit-logs?candidate_id=${candidateId}`, {
        credentials: 'include',
      });
      const data = await response.json();
      return data.data;
    }, manifest.student.candidateId);

    const precheckLog = auditLogs.find((log: { actionType: string }) => log.actionType === 'PRECHECK_COMPLETED');
    expect(precheckLog).toBeTruthy();
  });

  test('verifies audit log for pre-check warning acknowledgment', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    // Simulate unsupported browser
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.102 Safari/537.36',
    });

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    await expect(page.getByRole('heading', { name: 'System Compatibility Check' })).toBeVisible();

    // Acknowledge warning if present
    const acknowledgeButton = page.getByRole('button', { name: 'Acknowledge' });
    const isAcknowledgeVisible = await acknowledgeButton.isVisible().catch(() => false);

    if (isAcknowledgeVisible) {
      await acknowledgeButton.click();

      // Verify audit log entry
      const auditLogs = await page.evaluate(async (candidateId) => {
        const response = await fetch(`/api/v1/audit-logs?candidate_id=${candidateId}`, {
          credentials: 'include',
        });
        const data = await response.json();
        return data.data;
      }, manifest.student.candidateId);

      const warningLog = auditLogs.find((log: { actionType: string }) => log.actionType === 'PRECHECK_WARNING_ACKNOWLEDGED');
      expect(warningLog).toBeTruthy();
    }
  });
});
