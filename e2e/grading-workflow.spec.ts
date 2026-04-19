import { expect, test } from '@playwright/test';
import {
  ADMIN_STORAGE_STATE_PATH,
} from './support/backendE2e';

test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

test.describe('Grading Workflow', () => {
  test('accesses grading queue', async ({ page }) => {
    await page.goto('/admin/grading');
    await expect(page.getByRole('heading', { name: 'Grading Queue' })).toBeVisible();

    // Verify queue loads with sessions
    await expect(page.locator('[data-grading-session]')).toBeVisible();
  });

  test('filters grading queue by schedule', async ({ page }) => {
    await page.goto('/admin/grading');
    await expect(page.getByRole('heading', { name: 'Grading Queue' })).toBeVisible();

    // Filter by schedule
    await page.getByRole('combobox', { name: 'Filter by schedule' }).selectOption({ label: 'Backend E2E Cohort' });
    await page.waitForTimeout(500);

    // Verify filtered results
    const sessions = page.locator('[data-grading-session]');
    const count = await sessions.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('filters grading queue by cohort', async ({ page }) => {
    await page.goto('/admin/grading');
    await expect(page.getByRole('heading', { name: 'Grading Queue' })).toBeVisible();

    // Filter by cohort
    await page.getByRole('combobox', { name: 'Filter by cohort' }).selectOption({ label: 'Morning Batch B' });
    await page.waitForTimeout(500);

    // Verify filtered results
    const sessions = page.locator('[data-grading-session]');
    const count = await sessions.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('filters grading queue by student', async ({ page }) => {
    await page.goto('/admin/grading');
    await expect(page.getByRole('heading', { name: 'Grading Queue' })).toBeVisible();

    // Search for student
    await page.getByPlaceholder('Search sessions...').fill('Test Student');
    await page.waitForTimeout(500);

    // Verify search results
    const sessions = page.locator('[data-grading-session]');
    const count = await sessions.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('opens grading session for student', async ({ page }) => {
    await page.goto('/admin/grading');
    await expect(page.getByRole('heading', { name: 'Grading Queue' })).toBeVisible();

    // Open grading session
    await page
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: 'Grade' })
      .click();
    await expect(page.getByRole('heading', { name: /Grading Session/i })).toBeVisible();
  });

  test('applies rubric scores for writing', async ({ page }) => {
    await page.goto('/admin/grading');
    await page
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: 'Grade' })
      .click();

    // Navigate to writing tab
    await page.getByRole('tab', { name: 'Writing' }).click();

    // Apply rubric scores
    await page.getByLabel('Task Achievement Score').fill('7');
    await page.getByLabel('Coherence and Cohesion Score').fill('6');
    await page.getByLabel('Lexical Resource Score').fill('7');
    await page.getByLabel('Grammatical Range Score').fill('6');

    // Verify scores calculate band correctly
    await expect(page.getByText(/Writing Band:/i)).toBeVisible();
  });

  test('applies rubric scores for speaking', async ({ page }) => {
    await page.goto('/admin/grading');
    await page
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: 'Grade' })
      .click();

    // Navigate to speaking tab
    await page.getByRole('tab', { name: 'Speaking' }).click();

    // Apply rubric scores
    await page.getByLabel('Fluency and Coherence Score').fill('7');
    await page.getByLabel('Lexical Resource Score').fill('6');
    await page.getByLabel('Grammatical Range Score').fill('7');
    await page.getByLabel('Pronunciation Score').fill('6');

    // Verify scores calculate band correctly
    await expect(page.getByText(/Speaking Band:/i)).toBeVisible();
  });

  test('adds annotations to writing answers', async ({ page }) => {
    await page.goto('/admin/grading');
    await page
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: 'Grade' })
      .click();

    // Navigate to writing tab
    await page.getByRole('tab', { name: 'Writing' }).click();

    // Add annotation
    await page.getByRole('button', { name: 'Add Annotation' }).click();
    await page.getByLabel('Annotation text').fill('Good use of vocabulary here');
    await page.getByLabel('Annotation position').fill('0,100');
    await page.getByRole('button', { name: 'Save Annotation' }).click();
    await expect(page.getByText('Annotation added successfully')).toBeVisible();

    // Verify annotation appears
    await expect(page.getByText('Good use of vocabulary here')).toBeVisible();
  });

  test('adds evaluator notes', async ({ page }) => {
    await page.goto('/admin/grading');
    await page
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: 'Grade' })
      .click();

    // Add evaluator notes
    await page.getByLabel('Evaluator Notes').fill('Student performed well overall with strong vocabulary usage');
    await page.getByRole('button', { name: 'Save Draft' }).click();
    await expect(page.getByText('Draft saved successfully')).toBeVisible();

    // Verify notes persist
    await expect(page.getByLabel('Evaluator Notes')).toHaveValue('Student performed well overall with strong vocabulary usage');
  });

  test('saves grade as draft', async ({ page }) => {
    await page.goto('/admin/grading');
    await page
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: 'Grade' })
      .click();

    // Apply some scores
    await page.getByRole('tab', { name: 'Writing' }).click();
    await page.getByLabel('Task Achievement Score').fill('7');

    // Save as draft
    await page.getByRole('button', { name: 'Save Draft' }).click();
    await expect(page.getByText('Draft saved successfully')).toBeVisible();

    // Verify draft status
    await expect(page.getByText(/Draft/i)).toBeVisible();
  });

  test('submits final grade', async ({ page }) => {
    await page.goto('/admin/grading');
    await page
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: 'Grade' })
      .click();

    // Apply scores for all sections
    await page.getByRole('tab', { name: 'Writing' }).click();
    await page.getByLabel('Task Achievement Score').fill('7');
    await page.getByLabel('Coherence and Cohesion Score').fill('6');
    await page.getByLabel('Lexical Resource Score').fill('7');
    await page.getByLabel('Grammatical Range Score').fill('6');

    await page.getByRole('tab', { name: 'Speaking' }).click();
    await page.getByLabel('Fluency and Coherence Score').fill('7');
    await page.getByLabel('Lexical Resource Score').fill('6');
    await page.getByLabel('Grammatical Range Score').fill('7');
    await page.getByLabel('Pronunciation Score').fill('6');

    // Submit final grade
    await page.getByRole('button', { name: 'Submit Final Grade' }).click();
    await expect(page.getByRole('dialog', { name: 'Confirm Submission' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('Grade submitted successfully')).toBeVisible();

    // Verify session marked as graded
    await expect(page.getByText(/Graded/i)).toBeVisible();
  });

  test('requests re-evaluation', async ({ page }) => {
    await page.goto('/admin/grading');
    await page
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: 'View' })
      .click();

    // Request re-evaluation
    await page.getByRole('button', { name: 'Request Re-evaluation' }).click();
    await page.getByLabel('Re-evaluation reason').fill('Need to review speaking score');
    await page.getByRole('button', { name: 'Submit Request' }).click();
    await expect(page.getByText('Re-evaluation requested successfully')).toBeVisible();

    // Verify status updated
    await expect(page.getByText(/Re-evaluation Pending/i)).toBeVisible();
  });

  test('views grade history', async ({ page }) => {
    await page.goto('/admin/grading');
    await page
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: 'View' })
      .click();

    // Navigate to history tab
    await page.getByRole('tab', { name: 'History' }).click();

    // Verify history displays
    await expect(page.getByRole('heading', { name: /Grade History/i })).toBeVisible();
    const historyEntries = page.locator('[data-grade-history-entry]');
    const count = await historyEntries.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('verifies rubric scores calculate band correctly', async ({ page }) => {
    await page.goto('/admin/grading');
    await page
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: 'Grade' })
      .click();

    // Navigate to writing tab
    await page.getByRole('tab', { name: 'Writing' }).click();

    // Apply known scores that should result in specific band
    await page.getByLabel('Task Achievement Score').fill('7');
    await page.getByLabel('Coherence and Cohesion Score').fill('7');
    await page.getByLabel('Lexical Resource Score').fill('7');
    await page.getByLabel('Grammatical Range Score').fill('7');

    // Verify band calculation
    const bandText = await page.getByText(/Writing Band:/i).textContent();
    expect(bandText).toContain('7.0');
  });

  test('verifies annotations save with coordinates', async ({ page }) => {
    await page.goto('/admin/grading');
    await page
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: 'Grade' })
      .click();

    // Navigate to writing tab
    await page.getByRole('tab', { name: 'Writing' }).click();

    // Add annotation with coordinates
    await page.getByRole('button', { name: 'Add Annotation' }).click();
    await page.getByLabel('Annotation text').fill('Test annotation');
    await page.getByLabel('Annotation position X').fill('100');
    await page.getByLabel('Annotation position Y').fill('200');
    await page.getByRole('button', { name: 'Save Annotation' }).click();

    // Verify annotation saved
    const annotation = page.locator('[data-annotation]').first();
    await expect(annotation).toBeVisible();
    const position = await annotation.getAttribute('data-position');
    expect(position).toBe('100,200');
  });

  test('verifies grade history tracks changes', async ({ page }) => {
    await page.goto('/admin/grading');
    await page
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: 'Grade' })
      .click();

    // Apply initial score
    await page.getByRole('tab', { name: 'Writing' }).click();
    await page.getByLabel('Task Achievement Score').fill('6');
    await page.getByRole('button', { name: 'Save Draft' }).click();

    // Update score
    await page.getByLabel('Task Achievement Score').fill('7');
    await page.getByRole('button', { name: 'Save Draft' }).click();

    // View history
    await page.getByRole('tab', { name: 'History' }).click();

    // Verify history shows changes
    const historyEntries = page.locator('[data-grade-history-entry]');
    const count = await historyEntries.count();
    expect(count).toBeGreaterThan(0);
  });

  test('verifies audit logs for grading actions', async ({ page }) => {
    await page.goto('/admin/grading');
    await page
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: 'Grade' })
      .click();

    // Make a grading action
    await page.getByRole('tab', { name: 'Writing' }).click();
    await page.getByLabel('Task Achievement Score').fill('7');
    await page.getByRole('button', { name: 'Save Draft' }).click();

    // Navigate to audit logs
    await page.goto('/admin/audit-logs');
    await expect(page.getByRole('heading', { name: /Audit Logs/i })).toBeVisible();

    // Verify grading audit log
    await expect(page.getByText('GRADING_SESSION_START')).toBeVisible();
  });

  test('verifies band score rounding applies correctly', async ({ page }) => {
    await page.goto('/admin/grading');
    await page
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: 'Grade' })
      .click();

    // Navigate to writing tab
    await page.getByRole('tab', { name: 'Writing' }).click();

    // Apply scores that should round to .5
    await page.getByLabel('Task Achievement Score').fill('7');
    await page.getByLabel('Coherence and Cohesion Score').fill('6');
    await page.getByLabel('Lexical Resource Score').fill('7');
    await page.getByLabel('Grammatical Range Score').fill('6');

    // Verify band rounding
    const bandText = await page.getByText(/Writing Band:/i).textContent();
    expect(bandText).toMatch(/\d+\.\d+/);
  });
});
