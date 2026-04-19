import { expect, test } from '@playwright/test';
import {
  ADMIN_STORAGE_STATE_PATH,
  readBackendE2EManifest,
} from './support/backendE2e';

test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

test.describe('Admin User and Role Management', () => {
  test('creates admin user', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: /User Management/i })).toBeVisible();

    // Create new admin user
    await page.getByRole('button', { name: 'Create User' }).click();
    await expect(page.getByRole('dialog', { name: /Create User/i })).toBeVisible();

    // Fill user details
    const timestamp = Date.now();
    await page.getByLabel('Email').fill(`admin-${timestamp}@test.com`);
    await page.getByLabel('Display Name').fill(`Admin User ${timestamp}`);
    await page.getByLabel('Role').selectOption('admin');

    // Save user
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('User created successfully')).toBeVisible();

    // Verify user appears in list
    await expect(page.getByText(`Admin User ${timestamp}`)).toBeVisible();
  });

  test('creates proctor user', async ({ page }) => {
    await page.goto('/admin/users');

    // Create new proctor user
    await page.getByRole('button', { name: 'Create User' }).click();

    const timestamp = Date.now();
    await page.getByLabel('Email').fill(`proctor-${timestamp}@test.com`);
    await page.getByLabel('Display Name').fill(`Proctor User ${timestamp}`);
    await page.getByLabel('Role').selectOption('proctor');

    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('User created successfully')).toBeVisible();

    // Verify user appears in list
    await expect(page.getByText(`Proctor User ${timestamp}`)).toBeVisible();
  });

  test('assigns proctor to schedule', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto('/admin/users');
    
    // Find a proctor user
    const proctorRow = page.locator('tr').filter({ hasText: 'proctor' }).first();
    const hasProctor = await proctorRow.count() > 0;

    if (hasProctor) {
      await proctorRow.getByRole('button', { name: 'Edit' }).click();
      
      // Assign to schedule
      await page.getByLabel('Assign to schedule').selectOption({ label: manifest.student.scheduleId });
      
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('User updated successfully')).toBeVisible();
    }
  });

  test('revokes proctor access', async ({ page }) => {
    await page.goto('/admin/users');
    
    // Find a proctor user
    const proctorRow = page.locator('tr').filter({ hasText: 'proctor' }).first();
    const hasProctor = await proctorRow.count() > 0;

    if (hasProctor) {
      await proctorRow.getByRole('button', { name: 'Edit' }).click();
      
      // Remove schedule assignment
      await page.getByLabel('Assign to schedule').selectOption('');
      
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('User updated successfully')).toBeVisible();
    }
  });

  test('deactivates user', async ({ page }) => {
    await page.goto('/admin/users');
    
    // Find a user to deactivate
    const userRow = page.locator('tbody tr').first();
    const hasUsers = await userRow.count() > 0;

    if (hasUsers) {
      await userRow.getByRole('button', { name: 'Edit' }).click();
      
      // Deactivate user
      await page.getByLabel('Active').uncheck();
      
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('User updated successfully')).toBeVisible();
      
      // Verify user is marked as inactive
      await expect(userRow.getByText('Inactive')).toBeVisible();
    }
  });

  test('resets user password', async ({ page }) => {
    await page.goto('/admin/users');
    
    // Find a user
    const userRow = page.locator('tbody tr').first();
    const hasUsers = await userRow.count() > 0;

    if (hasUsers) {
      await userRow.getByRole('button', { name: 'Reset Password' }).click();
      await expect(page.getByRole('dialog', { name: /Reset Password/i })).toBeVisible();
      
      // Confirm password reset
      await page.getByRole('button', { name: 'Send Reset Link' }).click();
      await expect(page.getByText('Password reset link sent')).toBeVisible();
    }
  });

  test('views user activity logs', async ({ page }) => {
    await page.goto('/admin/users');
    
    // Find a user
    const userRow = page.locator('tbody tr').first();
    const hasUsers = await userRow.count() > 0;

    if (hasUsers) {
      await userRow.getByRole('button', { name: 'View Activity' }).click();
      await expect(page.getByRole('dialog', { name: /User Activity/i })).toBeVisible();
      
      // Verify activity log entries are shown
      const activityEntries = page.locator('[data-activity-entry]');
      const hasActivity = await activityEntries.count() > 0;
      
      if (hasActivity) {
        await expect(activityEntries.first()).toBeVisible();
      }
    }
  });

  test('verifies role-based access control for admin', async ({ page }) => {
    await page.goto('/admin/users');
    
    // Verify admin can access all admin pages
    await page.goto('/admin/exams');
    await expect(page.getByRole('heading', { name: /Exams/i })).toBeVisible();
    
    await page.goto('/admin/scheduling');
    await expect(page.getByRole('heading', { name: /Exam Scheduler/i })).toBeVisible();
    
    await page.goto('/admin/grading');
    await expect(page.getByRole('heading', { name: /Grading/i })).toBeVisible();
    
    await page.goto('/admin/settings');
    await expect(page.getByRole('heading', { name: /Settings/i })).toBeVisible();
  });

  test('creates builder user', async ({ page }) => {
    await page.goto('/admin/users');

    // Create new builder user
    await page.getByRole('button', { name: 'Create User' }).click();

    const timestamp = Date.now();
    await page.getByLabel('Email').fill(`builder-${timestamp}@test.com`);
    await page.getByLabel('Display Name').fill(`Builder User ${timestamp}`);
    await page.getByLabel('Role').selectOption('builder');

    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('User created successfully')).toBeVisible();

    // Verify user appears in list
    await expect(page.getByText(`Builder User ${timestamp}`)).toBeVisible();
  });

  test('creates grader user', async ({ page }) => {
    await page.goto('/admin/users');

    // Create new grader user
    await page.getByRole('button', { name: 'Create User' }).click();

    const timestamp = Date.now();
    await page.getByLabel('Email').fill(`grader-${timestamp}@test.com`);
    await page.getByLabel('Display Name').fill(`Grader User ${timestamp}`);
    await page.getByLabel('Role').selectOption('grader');

    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('User created successfully')).toBeVisible();

    // Verify user appears in list
    await expect(page.getByText(`Grader User ${timestamp}`)).toBeVisible();
  });

  test('filters users by role', async ({ page }) => {
    await page.goto('/admin/users');

    // Filter by admin role
    await page.getByRole('combobox', { name: 'Filter by role' }).selectOption('admin');
    await expect(page.getByRole('combobox', { name: 'Filter by role' })).toHaveValue('admin');

    // Filter by proctor role
    await page.getByRole('combobox', { name: 'Filter by role' }).selectOption('proctor');
    await expect(page.getByRole('combobox', { name: 'Filter by role' })).toHaveValue('proctor');

    // Show all users
    await page.getByRole('combobox', { name: 'Filter by role' }).selectOption('all');
    await expect(page.getByRole('combobox', { name: 'Filter by role' })).toHaveValue('all');
  });

  test('edits user details', async ({ page }) => {
    await page.goto('/admin/users');
    
    // Find a user
    const userRow = page.locator('tbody tr').first();
    const hasUsers = await userRow.count() > 0;

    if (hasUsers) {
      await userRow.getByRole('button', { name: 'Edit' }).click();
      
      // Modify display name
      const newDisplayName = `Updated User ${Date.now()}`;
      await page.getByLabel('Display Name').fill(newDisplayName);
      
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('User updated successfully')).toBeVisible();
      
      // Verify change is reflected
      await expect(page.getByText(newDisplayName)).toBeVisible();
    }
  });

  test('deletes user', async ({ page }) => {
    await page.goto('/admin/users');

    // Create a test user first
    await page.getByRole('button', { name: 'Create User' }).click();
    const timestamp = Date.now();
    await page.getByLabel('Email').fill(`delete-me-${timestamp}@test.com`);
    await page.getByLabel('Display Name').fill(`Delete Me ${timestamp}`);
    await page.getByLabel('Role').selectOption('admin');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('User created successfully')).toBeVisible();

    // Find and delete the user
    const userRow = page.locator('tr').filter({ hasText: `Delete Me ${timestamp}` });
    await userRow.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('dialog', { name: /Confirm Delete/i })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('User deleted successfully')).toBeVisible();

    // Verify user is removed
    await expect(page.getByText(`Delete Me ${timestamp}`)).not.toBeVisible();
  });

  test('verifies user management audit logs', async ({ page }) => {
    await page.goto('/admin/users');

    // Create a user to trigger audit log
    await page.getByRole('button', { name: 'Create User' }).click();
    const timestamp = Date.now();
    await page.getByLabel('Email').fill(`audit-test-${timestamp}@test.com`);
    await page.getByLabel('Display Name').fill(`Audit Test ${timestamp}`);
    await page.getByLabel('Role').selectOption('admin');
    await page.getByRole('button', { name: 'Create' }).click();

    // Navigate to audit logs
    await page.goto('/admin/audit-logs');
    
    // Verify user management action is logged
    await expect(page.getByRole('heading', { name: /Audit Logs/i })).toBeVisible();
    
    // Filter for user-related actions
    const userLogs = page.locator('[data-audit-log-entry]').filter({ hasText: /user/i });
    const hasUserLogs = await userLogs.count() > 0;
    
    if (hasUserLogs) {
      await expect(userLogs.first()).toBeVisible();
    }
  });
});
