import { beforeEach, describe, expect, it } from 'vitest';
import { gradingService } from '../gradingService';
import { gradingRepository } from '../gradingRepository';
import { examRepository } from '../examRepository';
import { seedGradingData } from '../../utils/gradingSeedData';
import { ExamSchedule } from '../../types/domain';

const createSchedule = (id = 'sched-existing-1'): ExamSchedule => {
  const now = new Date().toISOString();

  return {
    id,
    examId: 'exam-1',
    examTitle: 'Academic Practice Test 1',
    publishedVersionId: 'ver-1',
    cohortName: 'Elite 2025-A',
    institution: 'IELTS Excellence Center',
    startTime: now,
    endTime: now,
    plannedDurationMinutes: 180,
    deliveryMode: 'proctor_start',
    status: 'live',
    createdAt: now,
    createdBy: 'Test Runner',
    updatedAt: now,
    autoStart: true,
    autoStop: true
  };
};

const sectionAnswers = {
  listening: {
    type: 'listening' as const,
    parts: [
      {
        partId: 'l1',
        questions: [
          {
            questionId: 'lq1',
            studentAnswer: 'A',
            correctAnswer: 'A',
            isCorrect: true,
            score: 1,
            maxScore: 1,
            scoringRule: 'exact_match'
          }
        ]
      }
    ]
  },
  reading: {
    type: 'reading' as const,
    passages: [
      {
        passageId: 'p1',
        questions: [
          {
            questionId: 'rq1',
            studentAnswer: 'TRUE',
            correctAnswer: 'TRUE',
            isCorrect: true,
            score: 1,
            maxScore: 1,
            scoringRule: 'exact_match'
          }
        ]
      }
    ]
  },
  writing: {
    type: 'writing' as const,
    tasks: [
      {
        taskId: 'task1',
        taskLabel: 'Task 1',
        text: 'Task 1 response',
        wordCount: 3,
        prompt: 'Summarise the chart.'
      },
      {
        taskId: 'task2',
        taskLabel: 'Task 2',
        text: 'Task 2 response',
        wordCount: 3,
        prompt: 'Discuss both views.'
      }
    ]
  },
  speaking: {
    type: 'speaking' as const,
    part1Answers: ['Sample answer']
  }
};

describe('GradingService', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('links session rows by scheduleId and answer payloads by submission id', async () => {
    const schedule = createSchedule();
    await examRepository.saveSchedule(schedule);
    await gradingService.buildGradingSessions();

    const result = await gradingService.createStudentSubmission(
      schedule.id,
      schedule.examId,
      schedule.publishedVersionId,
      'STU-001',
      'Alice Example',
      'alice@example.com',
      schedule.cohortName,
      sectionAnswers
    );

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    const submission = result.data!;
    const sessionSubmissions = await gradingService.getSessionStudentSubmissions(schedule.id);
    expect(sessionSubmissions.success).toBe(true);
    expect(sessionSubmissions.data).toHaveLength(1);
    expect(sessionSubmissions.data?.[0].id).toBe(submission.id);

    const sectionSubmissions = await gradingRepository.getSectionSubmissionsBySubmissionId(submission.id);
    expect(sectionSubmissions).toHaveLength(4);
    expect(sectionSubmissions.map(section => section.section).sort()).toEqual([
      'listening',
      'reading',
      'speaking',
      'writing'
    ]);

    const writingSubmissions = (await gradingRepository.getAllWritingSubmissions()).filter(
      writing => writing.submissionId === submission.id
    );
    expect(writingSubmissions).toHaveLength(2);
  });

  it('seeds against an existing schedule without duplicating the mock student', async () => {
    const schedule = createSchedule('sched-seeded-1');
    await examRepository.saveSchedule(schedule);

    await seedGradingData();
    await seedGradingData();

    const sessions = await gradingRepository.getAllSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(schedule.id);

    const seededSubmissions = await gradingService.getSessionStudentSubmissions(schedule.id);
    expect(seededSubmissions.success).toBe(true);
    expect(seededSubmissions.data).toHaveLength(1);
    expect(seededSubmissions.data?.[0].studentId).toBe('STU-MOCK-001');

    const seededSections = await gradingRepository.getSectionSubmissionsBySubmissionId(
      seededSubmissions.data![0].id
    );
    expect(seededSections).toHaveLength(4);

    const seededWriting = (await gradingRepository.getAllWritingSubmissions()).filter(
      writing => writing.submissionId === seededSubmissions.data![0].id
    );
    expect(seededWriting).toHaveLength(2);
  });

  it('schedules a pending result locally and reuses it when the release happens', async () => {
    const schedule = createSchedule('sched-release-1');
    await examRepository.saveSchedule(schedule);
    await gradingService.buildGradingSessions();

    const submissionResult = await gradingService.createStudentSubmission(
      schedule.id,
      schedule.examId,
      schedule.publishedVersionId,
      'STU-REL-001',
      'Release Example',
      'release@example.com',
      schedule.cohortName,
      sectionAnswers,
    );
    expect(submissionResult.success).toBe(true);

    const submissionId = submissionResult.data!.id;
    const startReview = await gradingService.startReview(
      submissionId,
      'grader-1',
      'Taylor Grader',
    );
    expect(startReview.success).toBe(true);

    const savedDraft = await gradingService.saveReviewDraft(
      {
        ...startReview.data!,
        sectionDrafts: {
          listening: { overallBand: 7 },
          reading: { overallBand: 6.5 },
          writing: {
            task1: { overallBand: 6, wordCount: 120, gradingStatus: 'in_review' },
            task2: { overallBand: 6.5, wordCount: 260, gradingStatus: 'in_review' },
          },
          speaking: { overallBand: 7 },
        },
        teacherSummary: {
          strengths: ['Clear structure'],
          improvementPriorities: ['Add more evidence'],
          recommendedPractice: ['Timed writing drills'],
        },
      },
      'grader-1',
      'Taylor Grader',
    );
    expect(savedDraft.success).toBe(true);

    const scheduled = await gradingService.scheduleRelease(
      submissionId,
      '2026-01-02T09:00:00.000Z',
      'grader-1',
      'Taylor Grader',
    );
    expect(scheduled.success).toBe(true);

    const pendingResults = await gradingRepository.getStudentResultsBySubmission(submissionId);
    expect(pendingResults).toHaveLength(1);
    expect(pendingResults[0]).toMatchObject({
      releaseStatus: 'ready_to_release',
      scheduledReleaseDate: '2026-01-02T09:00:00.000Z',
    });

    const released = await gradingService.releaseResult(
      submissionId,
      'grader-1',
      'Taylor Grader',
    );
    expect(released.success).toBe(true);
    expect(released.data?.id).toBe(pendingResults[0].id);

    const finalResults = await gradingRepository.getStudentResultsBySubmission(submissionId);
    expect(finalResults).toHaveLength(1);
    expect(finalResults[0]).toMatchObject({
      id: pendingResults[0].id,
      releaseStatus: 'released',
      releasedBy: 'grader-1',
    });
  });
});
