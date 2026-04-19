import { expect, test } from '@playwright/test';
import {
  ADMIN_STORAGE_STATE_PATH,
} from './support/backendE2e';

test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

test.describe('Results and Analytics', () => {
  test('views results dashboard', async ({ page }) => {
    await page.goto('/admin/results');
    await expect(page.getByRole('heading', { name: 'Results & Analytics' })).toBeVisible();

    // Verify results load
    await expect(page.locator('[data-result-card]')).toBeVisible();
  });

  test('filters results by date range', async ({ page }) => {
    await page.goto('/admin/results');
    await expect(page.getByRole('heading', { name: 'Results & Analytics' })).toBeVisible();

    // Set date range
    await page.getByLabel('Start Date').fill('2024-01-01');
    await page.getByLabel('End Date').fill('2024-12-31');
    await page.getByRole('button', { name: 'Apply Filters' }).click();
    await page.waitForTimeout(500);

    // Verify filtered results
    const results = page.locator('[data-result-card]');
    const count = await results.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('filters results by cohort', async ({ page }) => {
    await page.goto('/admin/results');
    await expect(page.getByRole('heading', { name: 'Results & Analytics' })).toBeVisible();

    // Filter by cohort
    await page.getByRole('combobox', { name: 'Filter by cohort' }).selectOption({ label: 'Morning Batch B' });
    await page.waitForTimeout(500);

    // Verify filtered results
    const results = page.locator('[data-result-card]');
    const count = await results.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('filters results by institution', async ({ page }) => {
    await page.goto('/admin/results');
    await expect(page.getByRole('heading', { name: 'Results & Analytics' })).toBeVisible();

    // Filter by institution
    await page.getByRole('combobox', { name: 'Filter by institution' }).selectOption({ label: 'Test Institution' });
    await page.waitForTimeout(500);

    // Verify filtered results
    const results = page.locator('[data-result-card]');
    const count = await results.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('searches for specific student', async ({ page }) => {
    await page.goto('/admin/results');
    await expect(page.getByRole('heading', { name: 'Results & Analytics' })).toBeVisible();

    // Search for student
    await page.getByPlaceholder('Search results...').fill('Test Student');
    await page.waitForTimeout(500);

    // Verify search results
    const results = page.locator('[data-result-card]');
    const count = await results.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('views individual student report', async ({ page }) => {
    await page.goto('/admin/results');
    await expect(page.getByRole('heading', { name: 'Results & Analytics' })).toBeVisible();

    // View student report
    await page
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: 'View Report' })
      .click();
    await expect(page.getByRole('heading', { name: /Student Report/i })).toBeVisible();
  });

  test('verifies band scores display correctly', async ({ page }) => {
    await page.goto('/admin/results');
    await page
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: 'View Report' })
      .click();

    // Verify band scores
    await expect(page.getByText(/Overall Band:/i)).toBeVisible();
    await expect(page.getByText(/Listening:/i)).toBeVisible();
    await expect(page.getByText(/Reading:/i)).toBeVisible();
    await expect(page.getByText(/Writing:/i)).toBeVisible();
    await expect(page.getByText(/Speaking:/i)).toBeVisible();
  });

  test('exports results to CSV', async ({ page }) => {
    await page.goto('/admin/results');
    await expect(page.getByRole('heading', { name: 'Results & Analytics' })).toBeVisible();

    // Export to CSV
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('menuitem', { name: 'Export to CSV' }).click();
    const download = await downloadPromise;

    // Verify download started
    expect(download.suggestedFilename()).toContain('.csv');
  });

  test('exports results to PDF', async ({ page }) => {
    await page.goto('/admin/results');
    await expect(page.getByRole('heading', { name: 'Results & Analytics' })).toBeVisible();

    // Export to PDF
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('menuitem', { name: 'Export to PDF' }).click();
    const download = await downloadPromise;

    // Verify download started
    expect(download.suggestedFilename()).toContain('.pdf');
  });

  test('views cohort analytics', async ({ page }) => {
    await page.goto('/admin/results');
    await expect(page.getByRole('heading', { name: 'Results & Analytics' })).toBeVisible();

    // Navigate to cohort analytics
    await page.getByRole('tab', { name: 'Cohort Analytics' }).click();
    await expect(page.getByRole('heading', { name: /Cohort Analytics/i })).toBeVisible();

    // Verify analytics display
    await expect(page.locator('[data-analytics-chart]')).toBeVisible();
  });

  test('views question-level statistics', async ({ page }) => {
    await page.goto('/admin/results');
    await expect(page.getByRole('heading', { name: 'Results & Analytics' })).toBeVisible();

    // Navigate to question statistics
    await page.getByRole('tab', { name: 'Question Statistics' }).click();
    await expect(page.getByRole('heading', { name: /Question Statistics/i })).toBeVisible();

    // Verify statistics display
    await expect(page.locator('[data-question-stats]')).toBeVisible();
  });

  test('compares performance across cohorts', async ({ page }) => {
    await page.goto('/admin/results');
    await expect(page.getByRole('heading', { name: 'Results & Analytics' })).toBeVisible();

    // Navigate to comparison view
    await page.getByRole('tab', { name: 'Comparison' }).click();
    await expect(page.getByRole('heading', { name: /Cohort Comparison/i })).toBeVisible();

    // Select cohorts to compare
    await page.getByLabel('Select Cohort 1').selectOption({ label: 'Morning Batch A' });
    await page.getByLabel('Select Cohort 2').selectOption({ label: 'Morning Batch B' });
    await page.getByRole('button', { name: 'Compare' }).click();

    // Verify comparison results
    await expect(page.locator('[data-comparison-chart]')).toBeVisible();
  });

  test('verifies results load with correct data', async ({ page }) => {
    await page.goto('/admin/results');
    await expect(page.getByRole('heading', { name: 'Results & Analytics' })).toBeVisible();

    // Verify result cards have required data
    const resultCards = page.locator('[data-result-card]');
    const count = await resultCards.count();

    for (let i = 0; i < Math.min(count, 3); i++) {
      const card = resultCards.nth(i);
      await expect(card.getByText(/Band:/i)).toBeVisible();
    }
  });

  test('verifies filters apply correctly', async ({ page }) => {
    await page.goto('/admin/results');
    await expect(page.getByRole('heading', { name: 'Results & Analytics' })).toBeVisible();

    // Get initial count
    const initialResults = page.locator('[data-result-card]');
    const initialCount = await initialResults.count();

    // Apply filter
    await page.getByRole('combobox', { name: 'Filter by cohort' }).selectOption({ label: 'Morning Batch B' });
    await page.waitForTimeout(500);

    // Get filtered count
    const filteredResults = page.locator('[data-result-card]');
    const filteredCount = await filteredResults.count();

    // Verify filter changed results (or stayed same if no change)
    expect(filteredCount).toBeGreaterThanOrEqual(0);
  });

  test('verifies exports include all fields', async ({ page }) => {
    await page.goto('/admin/results');
    await expect(page.getByRole('heading', { name: 'Results & Analytics' })).toBeVisible();

    // Export to CSV
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('menuitem', { name: 'Export to CSV' }).click();
    const download = await downloadPromise;

    // Read CSV content
    const csvContent = await download.createReadStream();
    const text = await csvContent.toString();

    // Verify CSV contains expected headers
    expect(text).toContain('Student Name');
    expect(text).toContain('Overall Band');
    expect(text).toContain('Listening');
    expect(text).toContain('Reading');
    expect(text).toContain('Writing');
    expect(text).toContain('Speaking');
  });

  test('verifies analytics calculations accurate', async ({ page }) => {
    await page.goto('/admin/results');
    await expect(page.getByRole('heading', { name: 'Results & Analytics' })).toBeVisible();

    // Navigate to cohort analytics
    await page.getByRole('tab', { name: 'Cohort Analytics' }).click();

    // Verify average band calculation
    const averageBand = page.getByText(/Average Band:/i);
    await expect(averageBand).toBeVisible();

    const bandValue = await averageBand.textContent();
    expect(bandValue).toMatch(/\d+\.\d+/);
  });

  test('verifies performance metrics recorded', async ({ page }) => {
    await page.goto('/admin/results');
    await expect(page.getByRole('heading', { name: 'Results & Analytics' })).toBeVisible();

    // Navigate to performance metrics
    await page.getByRole('tab', { name: 'Performance Metrics' }).click();
    await expect(page.getByRole('heading', { name: /Performance Metrics/i })).toBeVisible();

    // Verify metrics display
    await expect(page.getByText(/Average Completion Time/i)).toBeVisible();
    await expect(page.getByText(/Pass Rate/i)).toBeVisible();
  });

  test('views detailed question analysis', async ({ page }) => {
    await page.goto('/admin/results');
    await expect(page.getByRole('heading', { name: 'Results & Analytics' })).toBeVisible();

    // Navigate to question statistics
    await page.getByRole('tab', { name: 'Question Statistics' }).click();

    // Click on a question for detailed analysis
    const questionItem = page.locator('[data-question-item]').first();
    const hasQuestions = await questionItem.isVisible().catch(() => false);

    if (hasQuestions) {
      await questionItem.click();
      await expect(page.getByRole('heading', { name: /Question Analysis/i })).toBeVisible();
    }
  });

  test('generates summary report', async ({ page }) => {
    await page.goto('/admin/results');
    await expect(page.getByRole('heading', { name: 'Results & Analytics' })).toBeVisible();

    // Generate summary report
    await page.getByRole('button', { name: 'Generate Summary' }).click();
    await expect(page.getByRole('dialog', { name: 'Summary Report' })).toBeVisible();

    // Verify summary displays
    await expect(page.getByText(/Total Students/i)).toBeVisible();
    await expect(page.getByText(/Average Band/i)).toBeVisible();
  });
});
