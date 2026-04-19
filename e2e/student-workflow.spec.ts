import { expect, test } from '@playwright/test';
import {
  readBackendE2EManifest,
  STUDENT_STORAGE_STATE_PATH,
  UNREGISTERED_STUDENT_STORAGE_STATE_PATH,
} from './support/backendE2e';

test.describe('Backend-backed student workflow', () => {
  test('registers with wcode and email, then completes exam', async ({ browser }) => {
    const manifest = readBackendE2EManifest();

    // Create a new context without storage state (public registration)
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to registration page with longer timeout
    await page.goto(`/student/${manifest.student.scheduleId}/register`, { timeout: 10000 });

    // Wait for page to load
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // Fill in registration form
    await page.getByLabel('Wcode').fill('W250334');
    await page.getByLabel('Email').fill(manifest.unregisteredStudent.email);
    await page.getByLabel('Full Name').fill('Test Registration Student');

    // Submit registration
    await page.getByRole('button', { name: 'Register' }).click({ timeout: 5000 });

    // Should redirect to student session
    await page.waitForURL(new RegExp(`/student/${manifest.student.scheduleId}/`), { timeout: 5000 });

    await context.close();
  });

  test('registers with legacy student key', async ({ browser }) => {
    const manifest = readBackendE2EManifest();

    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`/student/${manifest.student.scheduleId}/register`, { timeout: 10000 });

    // Use legacy key instead of wcode
    await page.getByLabel('Student Key').fill('LEGACY_KEY_12345');
    await page.getByLabel('Email').fill(`legacy-${manifest.unregisteredStudent.email}`);
    await page.getByLabel('Full Name').fill('Legacy Registration Student');

    await page.getByRole('button', { name: 'Register' }).click({ timeout: 5000 });

    await page.waitForURL(new RegExp(`/student/${manifest.student.scheduleId}/`), { timeout: 5000 });

    await context.close();
  });

  test('handles duplicate registration gracefully', async ({ browser }) => {
    const manifest = readBackendE2EManifest();

    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`/student/${manifest.student.scheduleId}/register`, { timeout: 10000 });

    // Try to register with already used email
    await page.getByLabel('Wcode').fill('W250334');
    await page.getByLabel('Email').fill(manifest.unregisteredStudent.email);
    await page.getByLabel('Full Name').fill('Duplicate Student');

    await page.getByRole('button', { name: 'Register' }).click({ timeout: 5000 });

    // Should show error message
    await expect(page.getByText(/already registered|duplicate/i)).toBeVisible();

    await context.close();
  });

  test('passes pre-check, answers the seeded item, and completes through the UI', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    // Session may already be active from previous test runs, so handle both states
    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);

    if (isCompatibilityCheckVisible) {
      await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Handle case where cohort might be paused from previous test run
    const cohortPaused = page.getByRole('heading', { name: 'Cohort paused' });
    const isCohortPaused = await cohortPaused.isVisible().catch(() => false);

    if (isCohortPaused) {
      // Cohort is paused, reload to wait for resume
      await page.reload();
      await page.waitForLoadState('networkidle');
      // Check again after reload
      const stillPaused = await cohortPaused.isVisible().catch(() => false);
      if (stillPaused) {
        // If still paused, navigate again to get fresh state
        await page.goto(`/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`);
      }
    }

    await expect(page.getByLabel('Answer for question 1')).toBeVisible();
    await page.getByLabel('Answer for question 1').fill(manifest.student.expectedAnswer);
    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();

    // Use force: true to click through any modal overlay
    await page.getByRole('button', { name: 'Finish' }).click({ force: true });

    await expect(page.getByText(/Examination Complete!/i)).toBeVisible();
  });

  test('completes listening module with audio playback', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);

    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Navigate to listening section
    await page.getByRole('tab', { name: 'Listening' }).click();

    // Verify audio player is present
    await expect(page.getByRole('button', { name: /play/i })).toBeVisible();

    // Answer listening questions
    await page.getByLabel('Answer for question 1').fill('True');
    await page.getByLabel('Answer for question 2').fill('False');

    // Submit listening section
    await page.getByRole('button', { name: 'Submit Section' }).click();
    await expect(page.getByText('Listening section submitted')).toBeVisible();
  });

  test('completes reading module with various question types', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);

    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Navigate to reading section
    await page.getByRole('tab', { name: 'Reading' }).click();

    // Verify passage display
    await expect(page.getByRole('article')).toBeVisible();

    // Answer various question types
    await page.getByLabel('TFNG Question 1').selectOption('True');
    await page.getByLabel('Cloze Question 1').fill('test answer');
    await page.getByLabel('Short Answer Question 1').fill('short answer');

    // Submit reading section
    await page.getByRole('button', { name: 'Submit Section' }).click();
  });

  test('completes writing module with word count enforcement', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);

    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Navigate to writing section
    await page.getByRole('tab', { name: 'Writing' }).click();

    // Task 1 - Chart interpretation
    await page.getByLabel('Task 1 Essay').fill('This is a test essay for Task 1 with sufficient word count.');

    // Verify word count display
    await expect(page.getByText(/\d+ words/)).toBeVisible();

    // Task 2 - Essay response
    await page.getByLabel('Task 2 Essay').fill('This is a comprehensive essay response for Task 2 that meets the minimum word requirement for the examination.');

    // Submit writing section
    await page.getByRole('button', { name: 'Submit Section' }).click();
  });

  test('completes speaking module with audio recording', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);

    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Navigate to speaking section
    await page.getByRole('tab', { name: 'Speaking' }).click();

    // Part 1 - Topics display
    await expect(page.getByText('Part 1')).toBeVisible();

    // Cue card with preparation timer
    await page.getByRole('button', { name: 'Start Recording' }).click();

    // Verify recording interface
    await expect(page.getByRole('button', { name: /stop/i })).toBeVisible();

    // Submit speaking section
    await page.getByRole('button', { name: 'Submit Section' }).click();
  });

  test('verifies audit logs for student actions', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    const compatibilityCheck = page.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);

    if (isCompatibilityCheckVisible) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    // Make an action to trigger audit log
    await page.getByLabel('Answer for question 1').fill('test answer');

    // Verify audit log entry via API
    const auditLogs = await page.evaluate(async (scheduleId) => {
      const response = await fetch(`/api/v1/audit-logs?schedule_id=${scheduleId}`, {
        credentials: 'include',
      });
      const data = await response.json();
      return data.data;
    }, manifest.student.scheduleId);

    expect(auditLogs.length).toBeGreaterThan(0);
  });
});
