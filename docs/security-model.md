# Security Model Documentation

## Overview

The IELTS Proctoring System employs a **layered deterrence and audit** approach to browser-based exam security. This document describes the security model, its capabilities, and its acknowledged limitations.

## Philosophy

The system operates on the principle of **deterrence through detection and auditability** rather than absolute prevention. Browser JavaScript cannot provide true lockdown security, but it can:

1. **Make cheating harder** - Add friction to common cheating methods
2. **Make cheating noisier** - Log suspicious activities for review
3. **Make cheating attributable** - Tie actions to specific sessions and users
4. **Make cheating reviewable** - Provide detailed audit trails for human review

## Security Layers

### Layer 1: Input Protection (Phase 1)

The system protects input fields from unauthorized content injection:

#### ProtectedInput Component
- **Autofill detection**: Logs `AUTOFILL_SUSPECTED` when `insertReplacementText` events occur
- **Paste detection**: Logs `PASTE_BLOCKED` on all paste attempts with target metadata
- **Large replacement detection**: Logs `REPLACEMENT_SUSPECTED` for value changes >50 characters without preceding keydown

#### Configuration
```typescript
security: {
  preventAutofill: boolean;
  preventAutocorrect: boolean;
}
```

#### Applied To
- All text inputs in `QuestionRenderer.tsx`
- ContentEditable editor in `StudentWriting.tsx`
- Global clipboard operations in `StudentKeyboardProvider.tsx`

### Layer 2: Proctoring Detection (Phase 2)

The system monitors for suspicious behaviors during exam sessions:

#### Secondary Screen Detection
- Uses `getScreenDetails()` API when available
- Logs `SCREEN_CHECK_UNSUPPORTED` for browsers without API support (informational)
- Logs `SCREEN_CHECK_PERMISSION_DENIED` when permission is denied (informational)
- Raises violation when multiple screens are detected

#### Tab Switching Detection
- Monitors `visibilitychange`, `blur`, and `pagehide` events
- Deduplicates events within 500ms to prevent false positives
- Logs event type in violation metadata
- Configurable response: `none`, `warn`, or `terminate`

#### Heartbeat Monitoring
- Sends periodic heartbeats during exam phase
- Tracks consecutive missed heartbeats
- **Warning threshold** (default: 2): Logs `HEARTBEAT_MISSED`
- **Hard block threshold** (default: 4): Logs `HEARTBEAT_LOST` and blocks exam

#### Configuration
```typescript
security: {
  detectSecondaryScreen: boolean;
  tabSwitchRule: 'none' | 'warn' | 'terminate';
  heartbeatIntervalSeconds: number;
  heartbeatMissThreshold: number;
  heartbeatWarningThreshold: number;
  heartbeatHardBlockThreshold: number;
}
```

### Layer 3: Severity-Based Enforcement (Phase 3)

The system replaces single-event termination with configurable severity thresholds:

#### Severity Levels
- **Low**: Background switch, blur, pagehide, unsupported screen detection, permission denial, heartbeat missed
- **Medium**: Clipboard paste, tab switch, repeated fullscreen exits
- **High**: Secondary screen detected, repeated violations + network loss
- **Critical**: Device continuity failure, heartbeat lost (hard threshold exceeded)

#### Threshold Configuration
```typescript
security: {
  severityThresholds: {
    lowLimit: number;      // Default: 5
    mediumLimit: number;   // Default: 3
    highLimit: number;     // Default: 2
    criticalAction: 'terminate';
  }
}
```

#### Enforcement Actions
- **Low limit exceeded**: Warn student
- **Medium limit exceeded**: Warn student
- **High limit exceeded**: Pause exam
- **Critical event**: Immediate termination

## Audit Logging

All security events are logged with detailed metadata:

### Audit Event Types
- `AUTOFILL_SUSPECTED`: Potential autofill or autocorrect detected
- `PASTE_BLOCKED`: Paste attempt blocked
- `REPLACEMENT_SUSPECTED`: Large value change without keyboard input
- `SCREEN_CHECK_UNSUPPORTED`: Browser doesn't support screen detection API
- `SCREEN_CHECK_PERMISSION_DENIED`: Screen detection permission denied
- `HEARTBEAT_MISSED`: Heartbeat warning threshold reached
- `HEARTBEAT_LOST`: Heartbeat hard block threshold reached
- `CLIPBOARD_BLOCKED`: Clipboard operation blocked
- `CONTEXT_MENU_BLOCKED`: Context menu blocked
- `VIOLATION_DETECTED`: General violation with severity and action metadata
- `NETWORK_DISCONNECTED`: Network connection lost
- `NETWORK_RECONNECTED`: Network connection restored
- `DEVICE_CONTINUITY_FAILED`: Device fingerprint mismatch

### Audit Log Structure
```typescript
{
  id: string;
  sessionId: string;
  actionType: AuditActionType;
  timestamp: string;
  actor: string;
  targetStudentId?: string;
  payload: Record<string, unknown>;
}
```

## Limitations and Acknowledgments

### Browser JavaScript Limitations

The following limitations are inherent to browser-based security:

1. **No true lockdown**: Users can potentially bypass JavaScript restrictions through:
   - Browser extensions
   - Developer tools
   - Modified browser builds
   - Virtual machines with screen sharing

2. **Screen detection limitations**:
   - `getScreenDetails()` API is not supported in all browsers
   - Safari lacks this API entirely
   - Permission can be denied
   - Virtual screen sharing can spoof detection

3. **Input protection limitations**:
   - Can be bypassed by disabling JavaScript
   - ContentEditable editors are harder to protect than inputs
   - Autocomplete behavior varies by browser

4. **Network monitoring limitations**:
   - Cannot detect local network changes
   - Cannot distinguish between network issues and intentional disconnection
   - Heartbeat timing can be affected by browser throttling

### Recommended Mitigations

For production use, consider:

1. **Hybrid approach**: Combine browser-based monitoring with:
   - Server-side anomaly detection
   - Proctor verification of suspicious sessions
   - Post-exam statistical analysis

2. **Device requirements**: Require:
   - Specific browser versions with full API support
   - Disabled browser extensions
   - Clean browser profile

3. **Human oversight**: Use audit logs for:
   - Manual review of flagged sessions
   - Pattern analysis across multiple exams
   - Student interviews when suspicious patterns emerge

4. **Native wrappers**: For high-stakes exams, consider:
   - Electron-based desktop applications
   - Mobile apps with OS-level permissions
   - Dedicated kiosk mode

## Configuration Guide

### Default Security Settings

```typescript
security: {
  requireFullscreen: true,
  tabSwitchRule: 'warn',
  detectSecondaryScreen: true,
  preventAutofill: true,
  preventAutocorrect: true,
  fullscreenAutoReentry: true,
  fullscreenMaxViolations: 3,
  heartbeatIntervalSeconds: 15,
  heartbeatMissThreshold: 3,
  heartbeatWarningThreshold: 2,
  heartbeatHardBlockThreshold: 4,
  pauseOnOffline: true,
  bufferAnswersOffline: true,
  requireDeviceContinuityOnReconnect: true,
  allowSafariWithAcknowledgement: true,
  proctoringFlags: {
    webcam: true,
    audio: true,
    screen: true
  },
  severityThresholds: {
    lowLimit: 5,
    mediumLimit: 3,
    highLimit: 2,
    criticalAction: 'terminate'
  }
}
```

### Tuning Thresholds

Adjust thresholds based on:

- **Exam stakes**: Higher stakes = stricter thresholds
- **Student population**: Technical students may trigger more false positives
- **Network reliability**: Unstable networks require looser heartbeat thresholds
- **Browser support**: If Safari is required, adjust screen detection expectations

### Monitoring Recommendations

1. **Review audit logs** regularly for:
   - Unexpected patterns in violation types
   - False positive rates
   - Browser-specific issues

2. **Calibrate thresholds** based on:
   - False positive vs. false negative tradeoffs
   - Student feedback
   - Proctor workload

3. **Track metrics**:
   - Violation rates by type
   - Session termination rates
   - Appeal rates

## Conclusion

This security model provides a **practical balance** between deterrence and usability for browser-based exams. It acknowledges the limitations of client-side JavaScript while maximizing the value of detection and auditability for post-exam review.

For optimal security, combine this system with:
- Server-side validation
- Human proctor oversight
- Clear communication of security policies to students
- Regular review and calibration of thresholds
