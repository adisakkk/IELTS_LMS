import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StudentAppWrapper } from '../StudentAppWrapper';
import { createDefaultConfig } from '../../../constants/examDefaults';
import { studentAttemptRepository } from '../../../services/studentAttemptRepository';
import type { ExamState } from '../../../types';
import type { ExamSessionRuntime } from '../../../types/domain';
import type { StudentAttempt } from '../../../types/studentAttempt';

describe('StudentApp runtime-backed mode', () => {
  const state: ExamState = {
    title: 'Mock Exam',
    type: 'Academic',
    activeModule: 'writing',
    activePassageId: 'p1',
    activeListeningPartId: 'l1',
    config: createDefaultConfig('Academic', 'Academic'),
    reading: { passages: [] },
    listening: { parts: [] },
    writing: {
      task1Prompt: 'Task 1 prompt',
      task2Prompt: 'Task 2 prompt',
    },
    speaking: {
      part1Topics: [],
      cueCard: '',
      part3Discussion: [],
    },
  };

  it('shows the waiting overlay when the runtime locks the student between sections', () => {
    const runtimeSnapshot: ExamSessionRuntime = {
      id: 'runtime-1',
      scheduleId: 'sched-1',
      examId: 'exam-1',
      examTitle: 'Mock Exam',
      cohortName: 'Cohort A',
      deliveryMode: 'proctor_start',
      status: 'live',
      actualStartAt: '2026-01-01T00:00:00.000Z',
      actualEndAt: null,
      activeSectionKey: null,
      currentSectionKey: 'writing',
      currentSectionRemainingSeconds: 300,
      waitingForNextSection: true,
      isOverrun: false,
      totalPausedSeconds: 0,
      sections: [
        {
          sectionKey: 'writing',
          label: 'Writing',
          order: 1,
          plannedDurationMinutes: 60,
          gapAfterMinutes: 0,
          status: 'completed',
          availableAt: '2026-01-01T00:00:00.000Z',
          actualStartAt: '2026-01-01T00:00:00.000Z',
          actualEndAt: '2026-01-01T01:00:00.000Z',
          pausedAt: null,
          accumulatedPausedSeconds: 0,
          extensionMinutes: 0,
          completionReason: 'auto_timeout',
          projectedStartAt: '2026-01-01T00:00:00.000Z',
          projectedEndAt: '2026-01-01T01:00:00.000Z',
        },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T01:00:00.000Z',
    };

    const { container } = render(
      <StudentAppWrapper state={state} onExit={() => {}} runtimeSnapshot={runtimeSnapshot} />,
    );

    expect(container).toBeInTheDocument();
  });

  it('submits the runtime-backed attempt through the repository when Finish is clicked', async () => {
    const user = userEvent.setup();
    const submitState: ExamState = {
      title: 'Submit Exam',
      type: 'Academic',
      activeModule: 'reading',
      activePassageId: 'p1',
      activeListeningPartId: 'l1',
      config: createDefaultConfig('Academic', 'Academic'),
      reading: {
        passages: [
          {
            id: 'p1',
            title: 'Passage 1',
            content: 'Seeded passage',
            blocks: [
              {
                id: 'reading-block-1',
                type: 'SHORT_ANSWER',
                instruction: 'Answer the question using one word from the passage.',
                questions: [
                  {
                    id: 'q1',
                    prompt: 'Question 1',
                    correctAnswer: 'seeded answer',
                    answerRule: 'ONE_WORD',
                  },
                ],
              },
            ],
          },
        ],
      },
      listening: { parts: [] },
      writing: {
        task1Prompt: 'Task 1 prompt',
        task2Prompt: 'Task 2 prompt',
      },
      speaking: {
        part1Topics: [],
        cueCard: '',
        part3Discussion: [],
      },
    };

    const runtimeSnapshot: ExamSessionRuntime = {
      id: 'runtime-1',
      scheduleId: 'sched-1',
      examId: 'exam-1',
      examTitle: 'Submit Exam',
      cohortName: 'Cohort A',
      deliveryMode: 'proctor_start',
      status: 'live',
      actualStartAt: '2026-01-01T00:00:00.000Z',
      actualEndAt: null,
      activeSectionKey: 'reading',
      currentSectionKey: 'reading',
      currentSectionRemainingSeconds: 1800,
      waitingForNextSection: false,
      isOverrun: false,
      totalPausedSeconds: 0,
      sections: [
        {
          sectionKey: 'reading',
          label: 'Reading',
          order: 1,
          plannedDurationMinutes: 60,
          gapAfterMinutes: 0,
          status: 'live',
          availableAt: '2026-01-01T00:00:00.000Z',
          actualStartAt: '2026-01-01T00:00:00.000Z',
          actualEndAt: null,
          pausedAt: null,
          accumulatedPausedSeconds: 0,
          extensionMinutes: 0,
          completionReason: undefined,
          projectedStartAt: '2026-01-01T00:00:00.000Z',
          projectedEndAt: '2026-01-01T01:00:00.000Z',
        },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const submittedAttempt: StudentAttempt = {
      id: 'attempt-1',
      scheduleId: 'sched-1',
      studentKey: 'student-sched-1-alice',
      examId: 'exam-1',
      examTitle: 'Submit Exam',
      candidateId: 'alice',
      candidateName: 'Alice Roe',
      candidateEmail: 'alice@example.com',
      phase: 'post-exam',
      currentModule: 'reading',
      currentQuestionId: null,
      answers: { q1: 'seeded answer' },
      writingAnswers: {},
      flags: {},
      violations: [],
      proctorStatus: 'active',
      proctorNote: null,
      proctorUpdatedAt: null,
      proctorUpdatedBy: null,
      lastWarningId: null,
      lastAcknowledgedWarningId: null,
      integrity: {
        preCheck: {
          completedAt: '2026-01-01T00:00:00.000Z',
          browserFamily: 'chrome',
          browserVersion: 120,
          screenDetailsSupported: true,
          heartbeatReady: true,
          acknowledgedSafariLimitation: false,
          checks: [],
        },
        deviceFingerprintHash: null,
        lastDisconnectAt: null,
        lastReconnectAt: null,
        lastHeartbeatAt: null,
        lastHeartbeatStatus: 'idle',
      },
      recovery: {
        lastRecoveredAt: null,
        lastLocalMutationAt: null,
        lastPersistedAt: '2026-01-01T00:10:00.000Z',
        pendingMutationCount: 0,
        syncState: 'saved',
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:10:00.000Z',
    };

    const submitAttempt = vi
      .spyOn(studentAttemptRepository as any, 'submitAttempt')
      .mockResolvedValue(submittedAttempt);

    const attemptSnapshot: StudentAttempt = {
      id: 'attempt-1',
      scheduleId: 'sched-1',
      studentKey: 'student-sched-1-alice',
      examId: 'exam-1',
      examTitle: 'Submit Exam',
      candidateId: 'alice',
      candidateName: 'Alice Roe',
      candidateEmail: 'alice@example.com',
      phase: 'exam',
      currentModule: 'reading',
      currentQuestionId: 'q1',
      answers: {},
      writingAnswers: {},
      flags: {},
      violations: [],
      proctorStatus: 'active',
      proctorNote: null,
      proctorUpdatedAt: null,
      proctorUpdatedBy: null,
      lastWarningId: null,
      lastAcknowledgedWarningId: null,
      integrity: {
        preCheck: {
          completedAt: '2026-01-01T00:00:00.000Z',
          browserFamily: 'chrome',
          browserVersion: 120,
          screenDetailsSupported: true,
          heartbeatReady: true,
          acknowledgedSafariLimitation: false,
          checks: [],
        },
        deviceFingerprintHash: null,
        lastDisconnectAt: null,
        lastReconnectAt: null,
        lastHeartbeatAt: null,
        lastHeartbeatStatus: 'idle',
      },
      recovery: {
        lastRecoveredAt: null,
        lastLocalMutationAt: null,
        lastPersistedAt: null,
        pendingMutationCount: 0,
        syncState: 'saved',
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    render(
      <StudentAppWrapper
        state={submitState}
        onExit={() => {}}
        scheduleId={attemptSnapshot.scheduleId}
        attemptSnapshot={attemptSnapshot}
        runtimeSnapshot={runtimeSnapshot}
      />,
    );

    await user.type(screen.getByLabelText('Answer for question 1'), 'seeded answer');
    await user.click(screen.getByRole('button', { name: 'Finish' }));

    await waitFor(() => {
      expect(submitAttempt).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByText(/Examination Complete!/i)).toBeInTheDocument();
    });
  });
});
