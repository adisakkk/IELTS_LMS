# Full Lifecycle E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One browser-led Playwright story that proves auth, admin scheduling, proctor controls, student delivery, and password recovery all work end to end.

**Architecture:** Seed the backend with explicit auth fixtures and raw tokens so browser tests can complete activation and password-reset flows without backend shortcuts. Move student submission into the app runtime path so the E2E test clicks `Finish` instead of posting directly. Keep the long lifecycle in one Playwright spec, then trim the existing shallow specs so they exercise the same real UI surfaces.

**Tech Stack:** Rust backend seeding, React + TypeScript, Playwright, Vitest.

---

### Task 1: Seed auth fixtures and expose them in the Playwright manifest

**Files:**
- Modify: `backend/crates/api/src/bin/e2e_seed.rs`
- Modify: `e2e/support/backendE2E.ts`
- Modify: `e2e/global-setup.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from '@playwright/test';
import { readBackendE2EManifest } from './support/backendE2E';

test('seed manifest includes browser-auth tokens', () => {
  const manifest = readBackendE2EManifest();

  expect(manifest.auth.adminLifecycle.email).toContain('@');
  expect(manifest.auth.adminLifecycle.activationToken).toBeTruthy();
  expect(manifest.auth.adminLifecycle.passwordResetToken).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm playwright test e2e/full-lifecycle.spec.ts -g "seed manifest includes browser-auth tokens" --project=chromium`

Expected: fail because `manifest.auth` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Add a seeded pending-activation admin user plus raw activation and password-reset tokens. Keep the existing builder/student fixtures intact.

```rust
let admin_auth = create_auth_lifecycle_user(
    &pool,
    &config,
    UserRole::Admin,
    ADMIN_EMAIL,
    ADMIN_NAME,
).await?;
let activation_token = insert_account_activation_token(&pool, admin_auth.user_id).await?;
let password_reset_token = insert_password_reset_token(&pool, admin_auth.user_id).await?;
```

Extend the manifest shape so Playwright can read the browser story data.

```ts
export interface BackendE2EManifest {
  frontendOrigin: string;
  generatedAt: string;
  builder: { /* existing fields */ };
  student: { /* existing fields */ };
  auth: {
    adminLifecycle: {
      email: string;
      activationToken: string;
      activationPassword: string;
      passwordResetToken: string;
      passwordResetPassword: string;
    };
  };
}
```

- [ ] **Step 4: Re-run the test to verify it passes**

Run: `pnpm playwright test e2e/full-lifecycle.spec.ts -g "seed manifest includes browser-auth tokens" --project=chromium`

Expected: pass, and the generated manifest should include the new `auth` block.

- [ ] **Step 5: Commit**

```bash
git add backend/crates/api/src/bin/e2e_seed.rs e2e/support/backendE2E.ts e2e/global-setup.ts
git commit -m "feat: seed browser auth fixtures for e2e"
```

### Task 2: Move backend-backed student submit behind the app runtime path

**Files:**
- Modify: `src/services/studentAttemptRepository.ts`
- Modify: `src/components/student/providers/StudentAttemptProvider.tsx`
- Modify: `src/components/student/StudentApp.tsx`
- Modify: `src/components/student/providers/__tests__/StudentAttemptProvider.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('submits the attempt through the repository when Finish is clicked', async () => {
  // render the student providers with a runtime-backed attempt
  // click Finish
  // expect the repository submit method to be called once
  // expect the UI to show the examination complete screen
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest src/components/student/providers/__tests__/StudentAttemptProvider.test.tsx`

Expected: fail because there is no repository submit method wired into the app yet.

- [ ] **Step 3: Write the minimal implementation**

Add a `submitAttempt(attemptId)` method to the repository, expose it through the provider actions, and call it from the runtime-backed `Finish` path before the completion screen renders.

```ts
// repository
submitAttempt(attemptId: string): Promise<void>;

// provider action
submitAttempt: () => Promise<void>;

// app flow
await attemptActions.submitAttempt();
runtimeActions.submitModule();
```

- [ ] **Step 4: Re-run the test to verify it passes**

Run: `pnpm vitest src/components/student/providers/__tests__/StudentAttemptProvider.test.tsx`

Expected: pass, with no direct `fetch(.../submit)` inside the Playwright spec.

- [ ] **Step 5: Commit**

```bash
git add src/services/studentAttemptRepository.ts src/components/student/providers/StudentAttemptProvider.tsx src/components/student/StudentApp.tsx src/components/student/providers/__tests__/StudentAttemptProvider.test.tsx
git commit -m "feat: route student submit through the app"
```

### Task 3: Replace shallow Playwright coverage with a real lifecycle spec and focused regression checks

**Files:**
- Create: `e2e/full-lifecycle.spec.ts`
- Modify: `e2e/student-workflow.spec.ts`
- Modify: `e2e/admin-workflow.spec.ts`
- Modify: `e2e/proctor-workflow.spec.ts`
- Modify: `e2e/smoke.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('runs the full browser lifecycle', async ({ browser, page }) => {
  const manifest = readBackendE2EManifest();

  await page.goto(`/activate?token=${manifest.auth.adminLifecycle.activationToken}`);
  await page.getByLabel('Display Name').fill('Admin Lifecycle');
  await page.getByLabel('Password').fill(manifest.auth.adminLifecycle.activationPassword);
  await page.getByRole('button', { name: 'Activate Account' }).click();
  await expect(page).toHaveURL(/\/admin\/exams$/);

  await page.goto('/login');
  await page.getByLabel('Email Address').fill(manifest.auth.adminLifecycle.email);
  await page.getByLabel('Password').fill(manifest.auth.adminLifecycle.activationPassword);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/admin\/exams$/);

  const studentContext = await browser.newContext({ storageState: STUDENT_STORAGE_STATE_PATH });
  const studentPage = await studentContext.newPage();
  await studentPage.goto(`/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`);
  await expect(studentPage.getByLabel('Answer for question 1')).toBeVisible();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm playwright test e2e/full-lifecycle.spec.ts --project=chromium`

Expected: fail on missing auth fixture fields and the direct-submit/student-path gaps.

- [ ] **Step 3: Write the minimal implementation**

Make the new spec use the real auth pages, the real admin/proctor controls, and the active `/student/:scheduleId/:studentId?` route. Update the weak smoke test to stop visiting `/student`.

```ts
await page.goto(`/student/${manifest.student.scheduleId}/${manifest.student.candidateId}`);
await page.getByRole('button', { name: 'Pause Cohort' }).click();
await expect(studentPage.getByText(/paused/i)).toBeVisible();
await page.getByRole('button', { name: 'Resume Cohort' }).click();
```

- [ ] **Step 4: Re-run the test to verify it passes**

Run:
`pnpm playwright test e2e/full-lifecycle.spec.ts e2e/student-workflow.spec.ts e2e/admin-workflow.spec.ts e2e/proctor-workflow.spec.ts e2e/smoke.spec.ts --project=chromium`

Expected: pass with the full lifecycle using browser auth and the corrected student route.

- [ ] **Step 5: Commit**

```bash
git add e2e/full-lifecycle.spec.ts e2e/student-workflow.spec.ts e2e/admin-workflow.spec.ts e2e/proctor-workflow.spec.ts e2e/smoke.spec.ts
git commit -m "feat: cover the full browser lifecycle in e2e"
```

### Task 4: Verify the targeted suite before handoff

**Files:**
- None

- [ ] **Step 1: Run the focused checks**

Run:
`pnpm vitest src/components/student/providers/__tests__/StudentAttemptProvider.test.tsx`
`pnpm playwright test e2e/full-lifecycle.spec.ts e2e/smoke.spec.ts --project=chromium`

Expected: both commands pass cleanly.

- [ ] **Step 2: Inspect for regressions**

Confirm the generated manifest still contains the builder and student fixtures, the auth spec no longer uses backend-side submit, and the smoke test points at the active student route.

- [ ] **Step 3: Final commit if anything changed during verification**

```bash
git add -A
git commit -m "test: verify full lifecycle e2e coverage"
```
