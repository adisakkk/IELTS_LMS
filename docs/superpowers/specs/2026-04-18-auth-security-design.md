# Authentication and Security Design Spec

Status: Draft

This spec defines the authentication and security architecture for the current IELTS proctoring system. It is scoped to the existing single-tenant deployment model, the current browser-based client footprint, and the active backend routes already present in the Rust backend worktree.

## Scope

This spec covers:

- staff authentication
- student authentication
- session management
- exam attempt security
- authorization and route protection
- results and media access protection
- rate limiting and abuse controls
- security-relevant data model changes
- rollout and migration sequencing

This spec does not cover:

- multi-tenant SaaS isolation as a first-class v1 requirement
- native mobile auth flows
- third-party API client auth
- external identity provider integration
- compliance policy text or legal retention policy beyond technical controls

## Fixed Product Decisions

These decisions are already chosen for this design:

- Deployment model: `single-tenant first`
- Identity ownership: `first-party auth`
- Staff access model: normal login
- Staff MFA: `not required in v1`
- Student account model: `institution-provisioned/imported accounts`
- Student clients: the same web app in desktop browsers and iPad Safari/PWA, not native apps

## Current Code Alignment

The recommendation in this spec is intentionally shaped by the current codebase:

- [LoginPage.tsx](/Users/rd-cream/Downloads/remix_-ielts-proctoring-system/.worktrees/rust-backend/src/features/auth/LoginPage.tsx) is a stub and does not preserve any existing real auth contract.
- [apiClient.ts](/Users/rd-cream/Downloads/remix_-ielts-proctoring-system/.worktrees/rust-backend/src/app/api/apiClient.ts) is same-origin browser `fetch`, which is a good fit for secure cookie sessions.
- [studentAttemptRepository.ts](/Users/rd-cream/Downloads/remix_-ielts-proctoring-system/.worktrees/rust-backend/src/services/studentAttemptRepository.ts) already models a separate hot path for student exam traffic with `attemptId`, `clientSessionId`, pending mutation buffering, and dedicated backend endpoints.
- [StudentNetworkProvider.tsx](/Users/rd-cream/Downloads/remix_-ielts-proctoring-system/.worktrees/rust-backend/src/components/student/providers/StudentNetworkProvider.tsx) sends live heartbeats during exam mode, and [studentIntegrityService.ts](/Users/rd-cream/Downloads/remix_-ielts-proctoring-system/.worktrees/rust-backend/src/services/studentIntegrityService.ts) defaults that traffic to every `15s`.
- [useProctorRouteController.ts](/Users/rd-cream/Downloads/remix_-ielts-proctoring-system/.worktrees/rust-backend/src/features/proctor/hooks/useProctorRouteController.ts) is polling-based today, so staff auth does not need a token-first realtime architecture.
- The current backend security findings show that the primary problem is not missing frontend route guards; it is missing backend principal extraction and missing server-side scope enforcement.

## Security Problems This Design Must Fix

This design explicitly addresses the active findings:

1. Builder, schedule, library, and settings routes currently mint synthetic admin principals.
2. Proctor routes currently trust caller-supplied `actor_id` and `proctor_id`.
3. Grading routes currently trust caller-supplied `teacher_id` and `actor_id`.
4. Student delivery currently uses a predictable `studentKey` as the effective credential.
5. Public routes currently lack route-specific abuse throttles.
6. Results and exports are currently publicly readable.

## Goals

- Use normal login UX for staff and students.
- Keep auth natural for browser and iPad Safari clients.
- Preserve low latency on live student exam traffic.
- Preserve acceptable throughput during exam bursts, especially heartbeat and answer mutation traffic.
- Make server-side identity authoritative on every protected route.
- Remove all client-asserted actor identity from privileged APIs.
- Separate identity, authorization, and live exam attempt control.
- Make revocation, session termination, and auditability straightforward.

## Non-Goals

- No JWT-first architecture for the whole app.
- No localStorage or sessionStorage as the source of truth for logged-in identity.
- No open public student self-signup.
- No MFA requirement in v1.

## Chosen Architecture

The recommended architecture is a hybrid model:

- `Opaque secure cookie sessions` for normal authenticated identity in the browser
- `Short-lived attempt-scoped exam credential` for hot student exam APIs

This is not “two competing auth systems.” It is one identity system plus one narrow high-frequency execution credential for live exam traffic.

### Why This Is The Best Fit

Compared with a single opaque session for everything:

- better latency on heartbeat and mutation traffic
- better throughput during live exam bursts
- cleaner separation between “who is this user” and “what active exam attempt may this browser control”

Compared with JWT everywhere:

- simpler browser security model
- simpler logout and forced session revocation
- no need to expose long-lived bearer tokens to browser storage
- better fit for same-origin browser-only clients

## Identity Model

### User Classes

The system has four primary authenticated actor classes:

- `admin`
- `builder`
- `proctor`
- `grader`
- `student`

In v1 single-tenant mode, these roles are scoped to one deployment, not to multiple organizations sharing one backend.

### Staff Accounts

Staff accounts are first-party identities managed by the application.

Requirements:

- email as login identifier
- password hashes stored with `Argon2id`
- account states: `active`, `disabled`, `locked`, `pending_activation`
- explicit role assignment on the server
- no role derived from client state

### Student Accounts

Students do not self-register publicly.

Requirements:

- admins or institution operators create or import student accounts first
- student account activation occurs through a controlled activation or password-set flow
- a student account proves identity
- schedule enrollment proves authorization to access a specific exam session

The design must separate:

- `account identity`
- `schedule enrollment`
- `active exam attempt`

This is the key correction to the current `studentKey` model.

## Authentication Model

### Primary Web Session

The primary session model for both staff and students is:

- opaque server-side session
- secure `HttpOnly` cookie
- browser same-origin usage

Recommended cookie properties:

- `__Host-session`
- `Secure`
- `HttpOnly`
- `SameSite=Lax`
- path `/`

The session cookie is the only browser credential needed for normal app navigation and normal API access.

### Session Storage

Primary sessions are stored in a backend table, not encoded as self-contained long-lived JWTs.

Each session row includes:

- session id
- user id
- role snapshot or role version marker
- issued at
- last seen at
- expires at
- idle timeout deadline
- user agent hash or normalized device descriptor
- ip metadata for audit
- revoked at
- revocation reason

### Session Lifetimes

Recommended v1 defaults:

- staff session idle timeout: `30 minutes`
- staff session absolute lifetime: `12 hours`
- student account session idle timeout: `60 minutes`
- student account session absolute lifetime: `12 hours`

These values balance security with realistic exam and proctoring workflows. They must remain configurable.

### Session Rotation

The backend must rotate the session id:

- on successful login
- on password reset completion
- on account activation
- on privilege-affecting account changes

This prevents session fixation and makes role changes safer.

### Logout and Revocation

The system must support:

- logout current session
- logout all sessions for a user
- admin-forced session revocation
- automatic revocation when account becomes disabled or locked

## Student Exam Attempt Credential

### Why It Exists

The student account session is the right credential for identity and exam entry, but it is not the best standalone credential for the high-frequency exam execution path represented by:

- `/mutations:batch`
- `/heartbeat`
- `/submit`
- future student exam websocket

Those routes are distinct in the current code and already revolve around:

- `attemptId`
- `clientSessionId`
- reconnect and buffering semantics
- frequent background calls

### Design

When a logged-in student enters an enrolled schedule and the backend authorizes exam entry, the backend:

1. verifies the student account session
2. verifies enrollment and eligibility for the target schedule
3. creates or resumes the student attempt
4. creates or resumes an `attempt_sessions` row
5. issues a short-lived attempt-scoped exam credential from that row

The attempt credential is bound to:

- `user_id`
- `schedule_id`
- `attempt_id`
- `client_session_id`
- optional device continuity fingerprint hash when available

### Credential Format

The attempt credential should be a short-lived signed token verified locally by the API process.

Requirements:

- lifetime target `10-15 minutes`
- renewable while the parent web session is still valid and the attempt is still active
- never used as the general app auth credential
- never granted broader scope than one attempt in one schedule

Transport contract:

- the browser sends the exam credential as `Authorization: Bearer <attempt_token>` only to exam-execution routes
- the browser keeps the attempt token in memory only
- page reload or reconnect may remint the attempt token through a session-authenticated bootstrap flow
- the token must never be persisted in localStorage

Renewal contract:

- `bootstrap` returns the initial attempt token
- if a valid attempt token has less than `5 minutes` remaining, the backend may return a refreshed token in the response body of a successful exam-execution request
- the frontend replaces the in-memory token atomically after a successful refresh

### Why Not Use The Main Session For These Calls

Using the normal web session for every heartbeat and mutation is possible, but it is not the best fit for this codebase:

- it puts all hot exam traffic on the main session lookup path
- it makes authorization broader than necessary
- it does not match the current attempt-specific execution model already present in the repo

Attempt-scoped credentials keep the hot path narrow, cheap to validate, and easy to revoke independently.

## Authorization Model

Authentication answers `who is this`.

Authorization answers `what may this actor do right now`.

The backend must derive authorization entirely from the authenticated principal and persisted server state.

### Core Rule

No privileged route may trust actor identity fields from the request body.

This means:

- remove `actor_id` from proctor command payloads
- remove `teacher_id` and `actor_id` from grading action payloads where they represent caller identity
- remove `proctor_id` as a trusted identity source for privileged presence updates
- derive actor identity from the authenticated principal extracted by the backend

### Staff Authorization

Staff authorization comes from server-managed role and assignment data:

- builder and admin actions require corresponding staff role
- proctor actions require active assignment to the schedule or an admin override
- grading actions require grader assignment or admin override
- results export requires privileged staff role

### Student Authorization

Student authorization has three levels:

1. authenticated student account
2. enrolled and eligible for the schedule
3. active attempt credential for hot exam operations

This prevents an authenticated student from accessing arbitrary schedules and prevents one attempt credential from controlling another attempt.

## Route Protection Model

### Public Routes

Only a small set of routes may remain unauthenticated:

- health and readiness
- login
- account activation
- password set and password reset initiation and completion

Everything else must be authenticated or explicitly denied.

### Staff-Protected Routes

These route groups require authenticated staff principals:

- `/api/v1/exams`
- `/api/v1/versions`
- `/api/v1/schedules`
- `/api/v1/library`
- `/api/v1/settings`
- `/api/v1/proctor`
- `/api/v1/grading`
- `/api/v1/results`
- privileged `/api/v1/media`

### Student-Protected Routes

Student account session required:

- student dashboard and schedule discovery
- exam entry
- pre-check submission
- bootstrap

Attempt-scoped exam credential required:

- mutation batch
- heartbeat
- submit
- future student live socket

### WebSocket Protection

The current websocket route in [routes/ws.rs](/Users/rd-cream/Downloads/remix_-ielts-proctoring-system/.worktrees/rust-backend/backend/crates/api/src/routes/ws.rs) must not stay open and anonymous.

Rules:

- staff websocket connections require authenticated staff principal
- student exam websocket requires authenticated student plus valid attempt credential
- websocket subscriptions are scoped by schedule or attempt authorization
- per-user and per-instance connection caps are enforced

## CSRF and Browser Security

Because the primary auth model is cookie-based, CSRF protection is required for cookie-authenticated mutating routes.

Requirements:

- CSRF token or double-submit protection on staff and normal student mutation routes
- same-origin enforcement for sensitive state-changing routes
- `Origin` and `Referer` validation for browser requests where practical

The attempt-scoped exam token reduces CSRF exposure on the hot exam path because those requests must present the narrow exam credential in addition to the general browser session context.

The frontend must not store long-lived identity credentials in localStorage.

## Compensating Controls For No MFA

Because MFA is explicitly out of scope for v1, the backend must compensate with stronger surrounding controls.

Required controls:

- Argon2id password hashing with tuned cost parameters
- per-account and per-IP login throttling
- exponential backoff on repeated failed logins
- temporary lock after repeated failures
- password reset tokens with short expiry and one-time use
- session list and forced logout capability
- re-auth requirement for very sensitive flows such as password change and large export actions
- high-quality audit logging for login, logout, password reset, activation, lock, unlock, export, and privileged actor actions

## Data Model Changes

The existing schema should be extended with explicit identity and session tables.

### New Core Tables

- `users`
- `user_password_credentials`
- `user_sessions`
- `user_session_events`
- `password_reset_tokens`
- `account_activation_tokens`
- `student_profiles`
- `staff_profiles`
- `attempt_sessions`

### Existing Table Changes

The current `schedule_registrations` table is the right place to model exam enrollment, but it should stop relying on predictable student keys as credentials.

Recommended changes:

- add `user_id` to `schedule_registrations`
- retain `student_id` as the institution-facing business identifier, distinct from `user_id`
- treat `student_key` as an internal legacy compatibility field during migration only
- move authorization to `user_id + schedule_id + access_state`

The `student_attempts` table should:

- reference `user_id`
- reference `registration_id`
- stop treating `student_key` as a credential

The `attempt_sessions` table should:

- bind one active browser exam execution context to one attempt
- store `client_session_id`
- store token id or session id metadata
- support revocation without logging the student out of the whole app

## Database Security Backstop

The current database already uses RLS-style helpers for some exam tables, but not for the full set of sensitive schedule, delivery, proctoring, grading, results, and media tables.

This design requires a second line of defense:

- extend scoped policy enforcement to the sensitive tables that currently rely only on broad runtime grants
- ensure each protected request sets actor and scope context before protected queries
- ensure result, grading, schedule, and proctor tables cannot be read or mutated broadly by default

The API remains the first enforcement layer. Database policy is the backstop.

## Rate Limiting and Abuse Controls

The current app should not use one global limiter. It needs route-shaped controls that match product traffic.

### Login and Account Flows

- per-IP login rate limit
- per-account login rate limit
- tighter limit on password reset initiation
- account activation token retry limits

### Student Exam Entry

- per-user, per-schedule, and per-IP throttles on exam entry
- limit failed attempt-session creation and refresh bursts

### Student Hot Path

Apply limits primarily per `attempt_id` or attempt credential, not only per IP.

Rules:

- heartbeat route: generous sustained rate, small burst allowance
- mutation route: moderate sustained rate, larger burst allowance for reconnect replay
- submit route: strict idempotency and low retry volume

This avoids punishing legitimate lab or classroom traffic where many students share one NAT IP.

### Staff Routes

- moderate request limits on admin and grading APIs
- stricter limits on exports and bulk actions

### WebSocket

- per-user connection cap
- per-instance connection cap
- per-schedule subscription cap once a single live cohort threatens instance stability

### Uploads

- authentication required
- content type allowlist
- size limits by asset type
- per-user and per-route quotas

## Privacy and Sensitive Data Access

The current public access to results and exports must end.

Rules:

- results list, result detail, analytics, export, and release events require authenticated privileged staff role
- student-facing results, if added later, must return only the authenticated student’s own released result
- media asset reads require owner or authorized staff scope

## Performance Considerations

### Latency

The design keeps response time acceptable because:

- normal staff and student identity uses simple cookie sessions
- same-origin browser requests avoid complex token exchange flows
- hot student exam calls can validate attempt credentials locally
- the backend still uses existing attempt-specific identifiers already present in the current code

### Throughput

The design scales better than “one web session for everything” because:

- heartbeat and mutation traffic use narrow attempt credentials
- route-specific throttles match actual traffic shape
- privileged admin traffic and exam traffic are separated conceptually and operationally

### UX

The design serves the target UX because:

- staff and students both get normal login
- students do not manage weird schedule tokens manually
- institutions keep control of student account creation
- exam access still remains schedule-bound and attempt-bound
- iPad Safari and desktop browsers use the same auth model

## Implementation Sequence

### Phase 1: Identity Foundation

- add user and session tables
- implement real login, logout, activation, password reset
- add secure cookie session middleware
- replace stub login frontend

### Phase 2: Server Principal Enforcement

- add principal extractor in Rust API
- remove synthetic admin contexts
- remove caller-asserted actor identity from proctor and grading commands
- enforce role and assignment checks on protected routes

### Phase 3: Student Account and Enrollment Binding

- add `user_id` linkage to student registrations and attempts
- stop using predictable `studentKey` as the credential
- update frontend student flow to use authenticated student identity

### Phase 4: Attempt-Scoped Exam Credential

- introduce attempt session issuance and renewal
- protect bootstrap, mutation, heartbeat, submit, and exam websocket with the attempt credential
- keep offline buffering and reconnect semantics

### Phase 5: Rate Limits, Results Protection, and DB Backstop

- add route-specific throttles
- protect results, exports, media, and websocket subscriptions
- extend DB policy backstops to sensitive tables

## Testing Requirements

The design is not complete without verification.

Required test categories:

- login and logout contract tests
- session expiry and revocation tests
- role enforcement tests for builder, proctor, grading, and results routes
- student enrollment and schedule access tests
- attempt credential scope tests
- CSRF tests on cookie-authenticated mutation routes
- brute-force and rate-limit tests
- websocket authorization tests
- regression tests covering the six active security findings

## Alternatives Considered

### Opaque Session For Every Request

Rejected as the primary recommendation because it is simpler but does not fit the current high-frequency student attempt traffic as well as an attempt-scoped execution credential.

### JWT Everywhere

Rejected because the app is browser-only, same-origin, and does not need a token-first client platform architecture. It adds browser credential complexity without enough product benefit.

## Final Recommendation

Use:

- first-party account auth
- opaque secure cookie sessions for staff and student identity
- institution-provisioned student accounts
- server-derived authorization on every protected route
- short-lived attempt-scoped exam credential for student live exam APIs
- route-specific abuse controls
- DB backstop policies for sensitive tables

This is the most precise fit for the current codebase, the current client footprint, the current proctoring and delivery traffic shape, and the current security failures.
