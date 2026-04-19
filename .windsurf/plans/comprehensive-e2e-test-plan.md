# Comprehensive E2E Test Plan - IELTS Proctoring System

## Overview

This document outlines a comprehensive end-to-end testing strategy for the IELTS Proctoring System, covering the full exam lifecycle from exam creation through student delivery, proctoring, grading, and results. The plan ensures all business logic features are tested with proper logging verification and proctor UI activity tracking.

## System Architecture Summary

### Backend (Rust)
- **Crates**: api, application, domain, infrastructure, worker
- **Key Services**: ProctoringService, DeliveryService, SchedulingService, AuthService
- **Database**: PostgreSQL with RLS and comprehensive audit trails

### Frontend (React/TypeScript)
- **Features**: admin, builder, proctor, student
- **Key Components**: ProctorApp, StudentApp, ExamBuilder, AdminDashboard
- **Monitoring**: Performance monitoring, error logging, telemetry

### Key Business Logic Areas
1. **Exam Management**: Creation, versioning, publishing, scheduling
2. **Student Delivery**: Registration, pre-check, exam session, submission
3. **Proctoring**: Real-time monitoring, alerts, interventions, audit logs
4. **Security**: Input protection, violation detection, severity enforcement
5. **Grading**: Rubrics, annotations, band scores, moderation
6. **Results**: Analytics, reports, exports

---

## Test Categories

### 1. Exam Lifecycle Tests

#### 1.1 Exam Builder Workflow
**File**: `e2e/exam-builder-workflow.spec.ts` (existing - enhance)

**Test Scenarios**:
- Create new exam with all question types (TFNG, CLOZE, MATCHING, MAP, MCQ, etc.)
- Add listening parts with audio pins
- Add reading passages with images
- Configure writing tasks with charts/prompts
- Configure speaking parts with cue cards
- Set security settings (fullscreen, tab switching, secondary screen detection)
- Configure severity thresholds
- Save and publish exam version
- Clone exam for new version
- Archive old versions

**Verification Points**:
- Exam persists in database with correct structure
- All question types render correctly
- Media assets upload successfully
- Security configuration applies to student session
- Version history tracks changes
- Audit logs record all builder actions

#### 1.2 Scheduling and Cohort Management
**File**: `e2e/scheduling-workflow.spec.ts` (new)

**Test Scenarios**:
- Create schedule with cohort assignment
- Configure start/end times and buffers
- Set auto-start and auto-stop flags
- Assign proctors to schedule
- Create student registrations with wcode
- Edit schedule configuration
- Cancel schedule
- Recurring schedules (daily, weekly, monthly)

**Verification Points**:
- Schedule appears in admin scheduling UI
- Runtime initializes correctly
- Proctor assignments work
- Student registrations link to schedule
- Email notifications sent (if configured)
- Audit logs track schedule changes

---

### 2. Student Delivery Tests

#### 2.1 Registration and Authentication
**File**: `e2e/student-registration.spec.ts` (new)

**Test Scenarios**:
- Register with wcode and email
- Register with legacy student key
- Handle duplicate registration
- Verify email confirmation flow
- Login with registered credentials
- Password reset flow
- Session token management

**Verification Points**:
- Registration creates student_attempts record
- Wcode validation works
- Email links expire correctly
- JWT tokens issue and refresh
- Audit logs: PRECHECK_COMPLETED, SESSION_START

#### 2.2 System Compatibility Pre-check
**File**: `e2e/student-precheck.spec.ts` (new)

**Test Scenarios**:
- Browser compatibility check
- Screen resolution validation
- Webcam permission check
- Microphone permission check
- Network connectivity test
- Device fingerprint generation
- Safari acknowledgment flow

**Verification Points**:
- Pre-check data saves correctly
- Device fingerprint hash stored
- Unsupported browsers show warning
- Permission denials logged
- Audit logs: PRECHECK_WARNING_ACKNOWLEDGED

#### 2.3 Exam Session - Full Module Flow
**File**: `e2e/student-exam-session.spec.ts` (new - comprehensive)

**Test Scenarios**:

**Listening Module**:
- Navigate through listening parts
- Answer TFNG, CLOZE, MATCHING, MCQ questions
- Audio playback controls work
- Time tracking accurate
- Submit listening section

**Reading Module**:
- Navigate reading passages
- Answer all reading question types
- Image stimulus display
- Word count validation
- Submit reading section

**Writing Module**:
- Task 1 with chart interpretation
- Task 2 essay response
- Word count enforcement
- Autosave functionality
- Rich text editor features
- Submit writing section

**Speaking Module**:
- Part 1 topics display
- Cue card with preparation timer
- Part 3 discussion questions
- Audio recording works
- Submit speaking section

**Verification Points**:
- Mutations apply in correct order
- Answers persist across page refreshes
- Time remaining updates correctly
- Section transitions work
- Final submission creates submission record
- Audit logs: SECTION_START, SECTION_END for each module
- Performance metrics recorded

#### 2.4 Security Features
**File**: `e2e/student-security.spec.ts` (new)

**Test Scenarios**:

**Input Protection**:
- Attempt paste in input field → PASTE_BLOCKED logged
- Trigger autofill → AUTOFILL_SUSPECTED logged
- Large replacement without typing → REPLACEMENT_SUSPECTED logged
- Context menu blocked → CONTEXT_MENU_BLOCKED logged

**Proctoring Detection**:
- Switch tabs (visibilitychange) → VIOLATION_DETECTED logged
- Exit fullscreen → VIOLATION_DETECTED logged
- Secondary screen detection → SCREEN_CHECK_UNSUPPORTED/PERMISSION_DENIED logged
- Heartbeat miss → HEARTBEAT_MISSED logged
- Heartbeat lost (hard threshold) → HEARTBEAT_LOST logged
- Network disconnect → NETWORK_DISCONNECTED logged
- Network reconnect → NETWORK_RECONNECTED logged
- Device fingerprint mismatch → DEVICE_CONTINUITY_FAILED logged

**Severity Enforcement**:
- Exceed low limit (5) → Warning shown
- Exceed medium limit (3) → Warning shown
- Exceed high limit (2) → Exam paused
- Critical event → Immediate termination

**Verification Points**:
- All violations logged to student_violation_events
- Audit logs created for each violation type
- Severity thresholds trigger correct actions
- Proctor receives alerts in real-time
- Student UI shows appropriate warnings/overlays
- Violation snapshot saved in student_attempts

#### 2.5 Network Resilience
**File**: `e2e/student-network.spec.ts` (new)

**Test Scenarios**:
- Disconnect during exam (pause on offline enabled)
- Reconnect with buffered answers
- Disconnect with pause on offline disabled
- Heartbeat timeout handling
- Mutation replay on reconnect
- Session recovery after crash

**Verification Points**:
- Answers buffered locally when offline
- Mutations replayed in order on reconnect
- Exam pauses/resumes correctly
- Audit logs: NETWORK_DISCONNECTED, NETWORK_RECONNECTED
- No data loss after reconnect

---

### 3. Proctoring Tests

#### 3.1 Proctor Dashboard and Session Monitoring
**File**: `e2e/proctor-dashboard.spec.ts` (new)

**Test Scenarios**:
- View all scheduled sessions
- Filter by status (scheduled, live, completed)
- View session detail with student roster
- Real-time student status updates
- Alert panel displays unacknowledged alerts
- Audit log panel shows timeline
- Presence indicator shows active proctors
- Session notes creation and resolution

**Verification Points**:
- Dashboard loads with correct data
- WebSocket updates propagate in real-time
- Student cards show current status
- Alert counts accurate
- Audit logs ordered by timestamp
- Presence tracking works

#### 3.2 Cohort Control Operations
**File**: `e2e/proctor-cohort-control.spec.ts` (new - enhance existing)

**Test Scenarios**:
- Start scheduled session (manual start)
- Pause entire cohort
- Resume entire cohort
- Extend current section (+5, +10, +15 minutes)
- End section now (skip to next)
- Complete entire exam early
- Cancel scheduled session

**Verification Points**:
- Runtime status changes correctly
- All students affected simultaneously
- Student UI reflects pause/resume
- Time extensions apply to all
- Section transitions work
- Audit logs: COHORT_PAUSE, COHORT_RESUME, EXTENSION_GRANTED, SECTION_END, SESSION_END
- Control events logged to cohort_control_events table
- WebSocket notifications sent to all students

#### 3.3 Individual Student Interventions
**File**: `e2e/proctor-student-interventions.spec.ts` (new)

**Test Scenarios**:
- Warn individual student
- Pause individual student
- Resume individual student
- Terminate individual student
- View student detail with violations
- Add session note for student
- Acknowledge alert for student

**Verification Points**:
- Student status updates in proctor UI
- Student receives warning overlay
- Student exam pauses/resumes
- Student exam terminates with reason
- Proctor status field updated in student_attempts
- Audit logs: STUDENT_WARN, STUDENT_PAUSE, STUDENT_RESUME, STUDENT_TERMINATE
- Violation events linked to attempt
- Notes saved with category

#### 3.4 Alert Management
**File**: `e2e/proctor-alerts.spec.ts` (new)

**Test Scenarios**:
- Receive real-time alerts for violations
- Filter alerts by severity
- Filter alerts by student
- Acknowledge individual alert
- Acknowledge all alerts for schedule
- Alert auto-dismissal rules
- Alert notification sounds (if enabled)

**Verification Points**:
- Alerts appear in AlertPanel
- Alert counts update in dashboard
- Acknowledgment updates audit log
- Alert latency measured (telemetry: violation_to_alert_latency)
- Old alerts auto-dismiss based on rules

#### 3.5 Violation Rules Configuration
**File**: `e2e/proctor-violation-rules.spec.ts` (new)

**Test Scenarios**:
- Create violation count rule (e.g., 5 violations → warn)
- Create specific violation type rule (e.g., TAB_SWITCH → pause)
- Create severity threshold rule (e.g., 3 high → terminate)
- Enable/disable rules
- Test rule triggers during exam
- Delete rules

**Verification Points**:
- Rules saved to violation_rules table
- Rules trigger correct auto-actions
- Auto-actions logged as AUTO_ACTION
- Rule evaluation happens in real-time
- Multiple rules can coexist

#### 3.6 Live Mode and Degraded State
**File**: `e2e/proctor-live-mode.spec.ts` (new)

**Test Scenarios**:
- Operate in live mode (WebSocket enabled)
- Simulate WebSocket failure
- Verify degraded mode fallback
- Polling fallback in degraded mode
- Recovery from degraded mode
- Manual live mode toggle

**Verification Points**:
- Live mode shows real-time updates
- Degraded mode shows warning banner
- Polling interval configured correctly
- Recovery restores WebSocket
- degraded_live_mode flag set correctly

---

### 4. Grading and Results Tests

#### 4.1 Grading Workflow
**File**: `e2e/grading-workflow.spec.ts` (new - enhance existing)

**Test Scenarios**:
- Access grading queue
- Filter by schedule, cohort, student
- Open grading session for student
- Apply rubric scores for writing
- Apply rubric scores for speaking
- Add annotations to writing answers
- Add evaluator notes
- Save grade as draft
- Submit final grade
- Request re-evaluation
- View grade history

**Verification Points**:
- Grading session creates correctly
- Rubric scores calculate band correctly
- Annotations save with coordinates
- Grade history tracks changes
- Audit logs: GRADING_SESSION_START, GRADE_SUBMITTED
- Band score rounding applies correctly

#### 4.2 Results and Analytics
**File**: `e2e/results-analytics.spec.ts` (new)

**Test Scenarios**:
- View results dashboard
- Filter by date range, cohort, institution
- View individual student report
- Export results to CSV
- Export results to PDF
- View cohort analytics
- View question-level statistics
- Compare performance across cohorts

**Verification Points**:
- Results load with correct data
- Filters apply correctly
- Exports include all fields
- Analytics calculations accurate
- Performance metrics recorded

---

### 5. Admin and Settings Tests

#### 5.1 Global Settings Management
**File**: `e2e/admin-settings.spec.ts` (new - enhance existing)

**Test Scenarios**:
- Configure exam defaults (general, sections, standards, progression, delivery, scoring, security)
- Reset to baseline
- Save custom profile
- Apply profile to new exams
- Configure media cache settings
- Configure outbox settings

**Verification Points**:
- Settings persist in database
- Defaults apply to new exams
- Profile selection works
- Audit logs track settings changes

#### 5.2 User and Role Management
**File**: `e2e/admin-users.spec.ts` (new)

**Test Scenarios**:
- Create admin user
- Create proctor user
- Assign proctor to schedule
- Revoke proctor access
- Deactivate user
- Reset user password
- View user activity logs

**Verification Points**:
- Users created with correct roles
- Schedule assignments work
- Role-based access control enforced
- Audit logs track user management

#### 5.3 Media Library Management
**File**: `e2e/admin-media.spec.ts` (new)

**Test Scenarios**:
- Upload audio files
- Upload images
- Manage question bank items
- Manage passage library
- Delete unused media
- View storage budget

**Verification Points**:
- Media uploads succeed
- Storage budget enforced
- Question bank items accessible
- Passage library items accessible
- Telemetry: storage_budget_bytes, storage_budget_level

---

### 6. Audit Log Verification Tests

#### 6.1 Comprehensive Audit Log Coverage
**File**: `e2e/audit-log-verification.spec.ts` (new)

**Test Scenarios**:
Verify all audit action types are logged correctly:

**Session Lifecycle**:
- SESSION_START
- SESSION_PAUSE
- SESSION_RESUME
- SESSION_END

**Section Transitions**:
- SECTION_START
- SECTION_END

**Violations**:
- VIOLATION_DETECTED
- AUTOFILL_SUSPECTED
- PASTE_BLOCKED
- REPLACEMENT_SUSPECTED
- SCREEN_CHECK_UNSUPPORTED
- SCREEN_CHECK_PERMISSION_DENIED
- CLIPBOARD_BLOCKED
- CONTEXT_MENU_BLOCKED
- HEARTBEAT_MISSED
- HEARTBEAT_LOST
- NETWORK_DISCONNECTED
- NETWORK_RECONNECTED
- DEVICE_CONTINUITY_FAILED

**Proctor Interventions**:
- STUDENT_WARN
- STUDENT_PAUSE
- STUDENT_RESUME
- STUDENT_TERMINATE
- COHORT_PAUSE
- COHORT_RESUME
- EXTENSION_GRANTED
- ALERT_ACKNOWLEDGED

**System Actions**:
- AUTO_ACTION
- NOTE_CREATED
- HANDOVER_INITIATED
- PRECHECK_COMPLETED
- PRECHECK_WARNING_ACKNOWLEDGED

**Verification Points**:
- Each action type logged with correct timestamp
- Actor field populated (system or user ID)
- target_student_id populated when applicable
- Payload contains relevant metadata
- acknowledged_at and acknowledged_by for alerts
- Logs queryable by schedule, student, action type
- Logs ordered chronologically

#### 6.2 Audit Log Integrity
**File**: `e2e/audit-log-integrity.spec.ts` (new)

**Test Scenarios**:
- Verify log sequence完整性
- Verify no gaps in timestamps
- Verify revision consistency
- Verify actor authentication
- Verify payload structure validity

**Verification Points**:
- No missing log entries
- Timestamps are monotonic
- Revision numbers increment correctly
- Actor references valid users
- Payloads are valid JSON

---

### 7. Performance and Telemetry Tests

#### 7.1 Backend Performance Metrics
**File**: `e2e/telemetry-verification.spec.ts` (new)

**Test Scenarios**:
- Verify HTTP request latency metrics
- Verify DB operation latency metrics
- Verify answer commit latency metrics
- Verify violation to alert latency metrics
- Verify WebSocket connection metrics
- Verify outbox backlog metrics
- Verify storage budget metrics

**Verification Points**:
- Metrics registered in Prometheus registry
- Latency histograms populated
- Gauges update correctly
- Threshold hits counted
- Metrics accessible via /metrics endpoint

#### 7.2 Frontend Performance Monitoring
**File**: `e2e/frontend-performance.spec.ts` (new)

**Test Scenarios**:
- Measure API request performance
- Measure component render performance
- Verify slow operation warnings
- Verify performance markers
- Verify P95 calculations

**Verification Points**:
- PerformanceMonitor records metrics
- Slow operations logged
- Performance marks created
- P95 calculations accurate

---

### 8. Integration and Edge Case Tests

#### 8.1 Concurrent User Scenarios
**File**: `e2e/concurrent-users.spec.ts` (new)

**Test Scenarios**:
- Multiple students start exam simultaneously
- Multiple proctors monitor same session
- Concurrent answer submissions
- Concurrent proctor interventions
- Race condition handling

**Verification Points**:
- No deadlocks or race conditions
- All mutations apply in order
- Proctor UI updates correctly
- Database handles concurrent writes

#### 8.2 Browser Compatibility
**File**: `e2e/browser-compatibility.spec.ts` (new)

**Test Scenarios**:
- Chrome latest
- Firefox latest
- Safari (with acknowledgment)
- Edge latest
- Mobile browsers (if supported)

**Verification Points**:
- Core functionality works in all browsers
- Fallbacks for unsupported APIs
- Safari acknowledgment flow works
- Mobile responsive design

#### 8.3 Error Recovery
**File**: `e2e/error-recovery.spec.ts` (new)

**Test Scenarios**:
- Backend API failure handling
- Database connection failure
- WebSocket reconnection
- File upload failure
- Payment failure (if applicable)

**Verification Points**:
- Graceful error messages
- Retry logic works
- State preserved on error
- Error logs captured

---

## Test Data Management

### Seed Data Requirements
- Admin user with activation token
- Proctor user with schedule assignments
- Published exam with all question types
- Scheduled exam with cohort
- Student registrations with wcodes
- Media assets (audio, images)

### Test Data Cleanup
- Truncate audit logs after test runs
- Reset student_attempts to initial state
- Clear violation events
- Reset runtime state
- Delete test registrations

---

## Test Execution Strategy

### Test Ordering
1. **Smoke Tests** - Quick validation of critical paths
2. **Exam Lifecycle** - Build and schedule exams
3. **Student Delivery** - Registration through submission
4. **Proctoring** - Monitoring and interventions
5. **Grading** - Assessment and results
6. **Audit Verification** - Log integrity checks
7. **Performance** - Telemetry validation
8. **Edge Cases** - Concurrent, error recovery

### Parallel Execution
- Student sessions can run in parallel
- Proctor monitoring can run alongside student sessions
- Admin operations can run in parallel with delivery
- Audit verification can run after main flows

### Continuous Integration
- Run smoke tests on every PR
- Run full suite on merge to main
- Run performance tests nightly
- Run browser compatibility tests weekly

---

## Logging Verification Strategy

### Backend Log Verification
```typescript
// Example: Verify audit log entry
await expect(
  page.evaluate(() => {
    return fetch('/api/proctor/audit-logs')
      .then(r => r.json())
      .then(logs => logs.find(log => 
        log.actionType === 'STUDENT_WARN' && 
        log.targetStudentId === studentId
      ))
  })
).resolves.toMatchObject({
  actionType: 'STUDENT_WARN',
  actor: expect.any(String),
  targetStudentId: studentId,
  payload: expect.objectContaining({
    message: expect.any(String)
  })
})
```

### Frontend Log Verification
```typescript
// Example: Verify performance metric
await expect(
  page.evaluate(() => {
    return window.performanceMonitor.getMetricsByName('API: /api/student/bootstrap')
  })
).resolves.toHaveLengthGreaterThan(0)
```

### Database Log Verification
```typescript
// Example: Direct database query for audit logs
const auditLogs = await db.query(`
  SELECT * FROM session_audit_logs 
  WHERE schedule_id = $1 
  ORDER BY created_at DESC
`, [scheduleId])
```

---

## Proctor UI Activity Tracking Verification

### Real-time Updates
- Verify WebSocket receives updates
- Verify student status changes reflect in UI
- Verify alerts appear immediately
- Verify audit logs append in real-time

### State Persistence
- Verify UI state survives page refresh
- Verify filter preferences persist
- Verify selected student persists
- Verify note drafts persist

### Activity Logging
- Verify proctor presence tracked
- Verify proctor actions logged
- Verify session note creation logged
- Verify alert acknowledgment logged

---

## Success Criteria

### Coverage Goals
- **Code Coverage**: >80% for critical paths
- **Feature Coverage**: 100% of documented features
- **Audit Log Coverage**: 100% of action types
- **Browser Coverage**: 4 major browsers

### Performance Goals
- **API Response Time**: <500ms for 95th percentile
- **WebSocket Latency**: <100ms for updates
- **Page Load Time**: <2s for student exam
- **Answer Commit**: <200ms for mutations

### Reliability Goals
- **Test Pass Rate**: >95%
- **Flaky Test Rate**: <5%
- **Test Execution Time**: <30 minutes for full suite

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- Set up test infrastructure
- Create test data seeding utilities
- Implement smoke tests
- Implement basic exam lifecycle tests

### Phase 2: Core Flows (Week 3-4)
- Implement student delivery tests
- Implement proctoring tests
- Implement grading tests
- Implement audit log verification

### Phase 3: Advanced Features (Week 5-6)
- Implement security feature tests
- Implement network resilience tests
- Implement violation rule tests
- Implement performance tests

### Phase 4: Integration and Polish (Week 7-8)
- Implement concurrent user tests
- Implement edge case tests
- Implement browser compatibility tests
- Optimize test execution time
- Add test reporting and dashboards

---

## Maintenance

### Test Updates
- Update tests when new features added
- Update tests when business logic changes
- Update audit log verification when new action types added
- Update performance baselines quarterly

### Test Data Maintenance
- Refresh seed data monthly
- Archive old test data quarterly
- Clean up test artifacts weekly

### Documentation
- Keep this plan updated with new test scenarios
- Document test utilities and helpers
- Document test data requirements
- Document known flaky tests and workarounds
