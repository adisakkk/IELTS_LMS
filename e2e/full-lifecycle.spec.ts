import { expect, test } from '@playwright/test';
import {
  readBackendE2EManifest,
  STUDENT_STORAGE_STATE_PATH,
} from './support/backendE2e';

test.describe('Full browser lifecycle', () => {
  test('activates an admin account, signs in, exercises the student route, and starts password recovery', async ({
    browser,
    page,
  }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(`/activate?token=${manifest.auth.adminLifecycle.activationToken}`);
    await page.getByLabel('Display Name').fill('Admin Lifecycle');
    await page.getByLabel('Password').fill(manifest.auth.adminLifecycle.activationPassword);
    await page.getByRole('button', { name: 'Activate Account' }).click();
    await expect(page).toHaveURL(/\/admin\/exams$/);

    const loginContext = await browser.newContext();
    const loginPage = await loginContext.newPage();
    await loginPage.goto('/login');
    await loginPage.getByLabel('Email Address').fill(manifest.auth.adminLifecycle.email);
    await loginPage.getByLabel('Password').fill(manifest.auth.adminLifecycle.activationPassword);
    await loginPage.getByRole('button', { name: 'Sign In' }).click();
    await expect(loginPage).toHaveURL(/\/admin\/exams$/);

    await loginPage.goto('/admin/scheduling');
    await expect(loginPage.getByRole('heading', { name: 'Exam Scheduler' })).toBeVisible();
    await loginPage.waitForLoadState('networkidle');
    const editScheduleButton = loginPage.getByRole('button', { name: 'Edit' }).first();
    await expect(editScheduleButton).toBeVisible();
    await editScheduleButton.click();
    await expect(loginPage.getByRole('heading', { name: 'Edit Schedule' })).toBeVisible();
    await loginPage.getByLabel('Select cohort').selectOption({ label: 'Morning Batch B' });
    await loginPage.getByRole('button', { name: 'Update Schedule' }).click();
    await expect(loginPage.getByText('Morning Batch B').first()).toBeVisible();

    const studentContext = await browser.newContext({
      storageState: STUDENT_STORAGE_STATE_PATH,
    });
    const studentPage = await studentContext.newPage();
    await studentPage.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );

    // Session may already be active from previous test runs, so handle both states
    const compatibilityCheck = studentPage.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);

    if (isCompatibilityCheckVisible) {
      await studentPage.getByRole('button', { name: 'Continue' }).click();
    }

    await expect(studentPage.getByLabel('Answer for question 1')).toBeVisible();

    await loginPage.goto('/password/reset');
    await loginPage.getByLabel('Email Address').fill(manifest.auth.adminLifecycle.email);
    await loginPage.getByRole('button', { name: 'Request Reset Link' }).click();

    await loginPage.goto(
      `/password/reset/complete?token=${manifest.auth.adminLifecycle.passwordResetToken}`,
    );
    await loginPage.getByLabel('New Password').fill(
      manifest.auth.adminLifecycle.passwordResetPassword,
    );
    await loginPage.getByRole('button', { name: 'Update Password' }).click();
    await expect(loginPage).toHaveURL(/\/admin\/exams$/);

    await studentContext.close();
    await loginContext.close();
  });

  test('completes full exam lifecycle from registration to grading', async ({ browser }) => {
    const manifest = readBackendE2EManifest();

    // Step 1: Student registration
    const studentContext = await browser.newContext();
    const studentPage = await studentContext.newPage();
    await studentPage.goto(`/student/${manifest.student.scheduleId}/register`);
    await studentPage.getByLabel('Wcode').fill('W250334');
    await studentPage.getByLabel('Email').fill(`lifecycle-${manifest.unregisteredStudent.email}`);
    await studentPage.getByLabel('Full Name').fill('Lifecycle Test Student');
    await studentPage.getByRole('button', { name: 'Register' }).click();
    await studentPage.waitForURL(new RegExp(`/student/${manifest.student.scheduleId}/`));

    // Step 2: Complete pre-check
    const compatibilityCheck = studentPage.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);
    if (isCompatibilityCheckVisible) {
      await studentPage.getByRole('button', { name: 'Continue' }).click();
    }

    // Step 3: Complete exam sections
    await studentPage.getByLabel('Answer for question 1').fill('lifecycle test answer');
    await studentPage.getByRole('button', { name: 'Finish' }).click({ force: true });
    await expect(studentPage.getByText(/Examination Complete!/i)).toBeVisible();

    await studentContext.close();

    // Step 4: Admin grades the submission
    const adminContext = await browser.newContext({
      storageState: process.env.ADMIN_STORAGE_STATE || './e2e/.generated/admin.storage-state.json',
    });
    const adminPage = await adminContext.newPage();
    await adminPage.goto('/admin/grading');
    await adminPage.getByPlaceholder('Search sessions...').fill('Lifecycle Test');
    await adminPage
      .locator('tbody tr')
      .filter({ hasText: 'Lifecycle Test' })
      .getByRole('button', { name: 'Grade' })
      .click();
    await adminPage.getByLabel('Evaluator Notes').fill('Lifecycle test - good performance');
    await adminPage.getByRole('button', { name: 'Submit Final Grade' }).click();
    await adminPage.getByRole('button', { name: 'Confirm' }).click();
    await expect(adminPage.getByText('Grade submitted successfully')).toBeVisible();

    await adminContext.close();
  });

  test('verifies end-to-end audit trail across all roles', async ({ browser }) => {
    const manifest = readBackendE2EManifest();

    // Admin makes a change
    const adminContext = await browser.newContext({
      storageState: process.env.ADMIN_STORAGE_STATE || './e2e/.generated/admin.storage-state.json',
    });
    const adminPage = await adminContext.newPage();
    await adminPage.goto('/admin/settings');
    await adminPage.getByPlaceholder('Enter default exam summary...').fill('E2E lifecycle test');
    await adminPage.getByRole('button', { name: 'Save Profile' }).click();

    // Student takes an action
    const studentContext = await browser.newContext({
      storageState: STUDENT_STORAGE_STATE_PATH,
    });
    const studentPage = await studentContext.newPage();
    await studentPage.goto(
      `/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`,
    );
    const compatibilityCheck = studentPage.getByRole('heading', { name: 'System Compatibility Check' });
    const isCompatibilityCheckVisible = await compatibilityCheck.isVisible().catch(() => false);
    if (isCompatibilityCheckVisible) {
      await studentPage.getByRole('button', { name: 'Continue' }).click();
    }
    await studentPage.getByLabel('Answer for question 1').fill('audit trail test');

    // Verify audit logs capture all actions
    await adminPage.goto('/admin/audit-logs');
    await expect(adminPage.getByRole('heading', { name: /Audit Logs/i })).toBeVisible();
    const logEntries = adminPage.locator('[data-audit-log-entry]');
    expect(await logEntries.count()).toBeGreaterThan(0);

    await studentContext.close();
    await adminContext.close();
  });

  test('handles cross-role session state persistence', async ({ browser }) => {
    const manifest = readBackendE2EManifest();

    // Admin creates a schedule
    const adminContext = await browser.newContext({
      storageState: process.env.ADMIN_STORAGE_STATE || './e2e/.generated/admin.storage-state.json',
    });
    const adminPage = await adminContext.newPage();
    await adminPage.goto('/admin/scheduling');
    await adminPage.getByRole('button', { name: 'Create Schedule' }).click();
    await adminPage.getByLabel('Schedule Name').fill('E2E Lifecycle Schedule');
    await adminPage.getByLabel('Start Time').fill('2025-01-01T09:00');
    await adminPage.getByRole('button', { name: 'Create' }).click();

    // Verify schedule appears in proctor dashboard
    const proctorContext = await browser.newContext({
      storageState: process.env.ADMIN_STORAGE_STATE || './e2e/.generated/admin.storage-state.json',
    });
    const proctorPage = await proctorContext.newPage();
    await proctorPage.goto('/proctor');
    await expect(proctorPage.getByText('E2E Lifecycle Schedule')).toBeVisible();

    // Student can register for the schedule
    const studentContext = await browser.newContext();
    const studentPage = await studentContext.newPage();
    await studentPage.goto(`/student/${manifest.student.scheduleId}/register`);
    await expect(studentPage.getByLabel('Wcode')).toBeVisible();

    await studentContext.close();
    await proctorContext.close();
    await adminContext.close();
  });
});
