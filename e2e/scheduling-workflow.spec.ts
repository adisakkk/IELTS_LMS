import { expect, test } from '@playwright/test';
import {
  ADMIN_STORAGE_STATE_PATH,
} from './support/backendE2e';

test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

test.describe('Scheduling and Cohort Management', () => {
  test('creates schedule with cohort assignment', async ({ page }) => {
    await page.goto('/admin/scheduling');
    await expect(page.getByRole('heading', { name: 'Exam Scheduler' })).toBeVisible();

    // Create new schedule
    await page.getByRole('button', { name: 'Create Schedule' }).click();
    await expect(page.getByRole('heading', { name: 'Create Schedule' })).toBeVisible();

    // Fill schedule details
    await page.getByLabel('Schedule Name').fill('E2E Test Schedule');
    await page.getByLabel('Select Exam').selectOption({ label: /IELTS Academic/i });
    await page.getByLabel('Select Cohort').selectOption({ label: 'Morning Batch B' });

    // Configure start/end times
    await page.getByLabel('Start Time').fill('2025-02-01T09:00');
    await page.getByLabel('End Time').fill('2025-02-01T12:00');

    // Set buffer times
    await page.getByLabel('Pre-exam Buffer (minutes)').fill('15');
    await page.getByLabel('Post-exam Buffer (minutes)').fill('10');

    // Save schedule
    await page.getByRole('button', { name: 'Create Schedule' }).click();
    await expect(page.getByText('Schedule created successfully')).toBeVisible();

    // Verify schedule appears in list
    await expect(page.getByText('E2E Test Schedule')).toBeVisible();
  });

  test('configures auto-start and auto-stop flags', async ({ page }) => {
    await page.goto('/admin/scheduling');
    await page.getByRole('button', { name: 'Create Schedule' }).click();

    await page.getByLabel('Schedule Name').fill('Auto-start Test Schedule');
    await page.getByLabel('Select Exam').selectOption({ label: /IELTS Academic/i });
    await page.getByLabel('Select Cohort').selectOption({ label: 'Morning Batch B' });
    await page.getByLabel('Start Time').fill('2025-02-02T09:00');
    await page.getByLabel('End Time').fill('2025-02-02T12:00');

    // Enable auto-start
    await page.getByLabel('Auto-start Runtime').check();
    await expect(page.getByLabel('Auto-start Runtime')).toBeChecked();

    // Enable auto-stop
    await page.getByLabel('Auto-stop Runtime').check();
    await expect(page.getByLabel('Auto-stop Runtime')).toBeChecked();

    await page.getByRole('button', { name: 'Create Schedule' }).click();
    await expect(page.getByText('Schedule created successfully')).toBeVisible();
  });

  test('assigns proctors to schedule', async ({ page }) => {
    await page.goto('/admin/scheduling');

    // Find existing schedule
    const scheduleRow = page.locator('tbody tr').first();
    await scheduleRow.getByRole('button', { name: 'Edit' }).click();

    // Assign proctors
    await page.getByRole('tab', { name: 'Proctors' }).click();
    await page.getByRole('button', { name: 'Add Proctor' }).click();
    await page.getByLabel('Select Proctor').selectOption({ label: /Proctor/i });
    await page.getByRole('button', { name: 'Assign' }).click();
    await expect(page.getByText('Proctor assigned successfully')).toBeVisible();

    // Verify proctor appears in list
    await expect(page.locator('[data-proctor-assignment]')).toBeVisible();
  });

  test('edits schedule configuration', async ({ page }) => {
    await page.goto('/admin/scheduling');

    // Find existing schedule
    const scheduleRow = page.locator('tbody tr').first();
    await scheduleRow.getByRole('button', { name: 'Edit' }).click();

    // Modify start time
    await page.getByLabel('Start Time').fill('2025-02-03T10:00');
    await page.getByLabel('End Time').fill('2025-02-03T13:00');

    // Update buffer times
    await page.getByLabel('Pre-exam Buffer (minutes)').fill('20');
    await page.getByLabel('Post-exam Buffer (minutes)').fill('15');

    // Save changes
    await page.getByRole('button', { name: 'Update Schedule' }).click();
    await expect(page.getByText('Schedule updated successfully')).toBeVisible();
  });

  test('cancels schedule', async ({ page }) => {
    await page.goto('/admin/scheduling');

    // Create a schedule to cancel
    await page.getByRole('button', { name: 'Create Schedule' }).click();
    await page.getByLabel('Schedule Name').fill('Schedule to Cancel');
    await page.getByLabel('Select Exam').selectOption({ label: /IELTS Academic/i });
    await page.getByLabel('Select Cohort').selectOption({ label: 'Morning Batch B' });
    await page.getByLabel('Start Time').fill('2025-02-04T09:00');
    await page.getByLabel('End Time').fill('2025-02-04T12:00');
    await page.getByRole('button', { name: 'Create Schedule' }).click();

    // Cancel the schedule
    const scheduleRow = page.locator('tbody tr').filter({ hasText: 'Schedule to Cancel' });
    await scheduleRow.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog', { name: 'Confirm Cancel' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('Schedule cancelled successfully')).toBeVisible();

    // Verify status changed to cancelled
    await expect(scheduleRow.getByText('Cancelled')).toBeVisible();
  });

  test('creates recurring schedule (daily)', async ({ page }) => {
    await page.goto('/admin/scheduling');
    await page.getByRole('button', { name: 'Create Schedule' }).click();

    await page.getByLabel('Schedule Name').fill('Daily Recurring Schedule');
    await page.getByLabel('Select Exam').selectOption({ label: /IELTS Academic/i });
    await page.getByLabel('Select Cohort').selectOption({ label: 'Morning Batch B' });

    // Enable recurring
    await page.getByLabel('Recurring Schedule').check();

    // Set daily recurrence
    await page.getByLabel('Recurrence Pattern').selectOption('daily');
    await page.getByLabel('Start Time').fill('2025-02-05T09:00');
    await page.getByLabel('End Time').fill('2025-02-05T12:00');

    // Set recurrence end date
    await page.getByLabel('Recurrence End Date').fill('2025-02-28');

    await page.getByRole('button', { name: 'Create Schedule' }).click();
    await expect(page.getByText('Schedule created successfully')).toBeVisible();
  });

  test('creates recurring schedule (weekly)', async ({ page }) => {
    await page.goto('/admin/scheduling');
    await page.getByRole('button', { name: 'Create Schedule' }).click();

    await page.getByLabel('Schedule Name').fill('Weekly Recurring Schedule');
    await page.getByLabel('Select Exam').selectOption({ label: /IELTS Academic/i });
    await page.getByLabel('Select Cohort').selectOption({ label: 'Morning Batch B' });

    // Enable recurring
    await page.getByLabel('Recurring Schedule').check();

    // Set weekly recurrence
    await page.getByLabel('Recurrence Pattern').selectOption('weekly');
    await page.getByLabel('Days of Week').selectOption(['Monday', 'Wednesday', 'Friday']);
    await page.getByLabel('Start Time').fill('2025-02-06T09:00');
    await page.getByLabel('End Time').fill('2025-02-06T12:00');

    await page.getByRole('button', { name: 'Create Schedule' }).click();
    await expect(page.getByText('Schedule created successfully')).toBeVisible();
  });

  test('verifies runtime initialization', async ({ page }) => {
    await page.goto('/admin/scheduling');

    // Find a scheduled session
    const scheduleRow = page.locator('tbody tr').first();
    await scheduleRow.getByRole('button', { name: 'View Runtime' }).click();

    // Verify runtime status
    await expect(page.getByRole('heading', { name: /Runtime Status/i })).toBeVisible();
    await expect(page.getByText('Runtime Status:')).toBeVisible();
  });

  test('verifies audit logs for schedule changes', async ({ page }) => {
    await page.goto('/admin/scheduling');

    // Make a change to trigger audit log
    const scheduleRow = page.locator('tbody tr').first();
    await scheduleRow.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Schedule Name').fill('Updated Schedule Name');
    await page.getByRole('button', { name: 'Update Schedule' }).click();

    // Navigate to audit logs
    await page.goto('/admin/audit-logs');
    await expect(page.getByRole('heading', { name: /Audit Logs/i })).toBeVisible();

    // Verify audit log entry exists
    await expect(page.getByText('SCHEDULE_UPDATED')).toBeVisible();
  });
});
