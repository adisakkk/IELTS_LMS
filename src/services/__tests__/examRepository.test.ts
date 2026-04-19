import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { examRepository, LocalStorageExamRepository } from '../examRepository';
import { ExamSessionRuntime, CohortControlEvent } from '../../types/domain';

describe('LocalStorageExamRepository runtime storage', () => {
  let repository: LocalStorageExamRepository;

  beforeEach(() => {
    localStorage.clear();
    repository = new LocalStorageExamRepository();
  });

  it('persists and deletes runtimes by schedule id', async () => {
    const runtime: ExamSessionRuntime = {
      id: 'runtime-1',
      scheduleId: 'sched-1',
      examId: 'exam-1',
      examTitle: 'IELTS Mock',
      cohortName: 'Cohort A',
      deliveryMode: 'proctor_start',
      status: 'live',
      actualStartAt: '2026-01-01T00:00:00.000Z',
      actualEndAt: null,
      activeSectionKey: 'reading',
      currentSectionKey: 'reading',
      currentSectionRemainingSeconds: 1200,
      waitingForNextSection: false,
      isOverrun: false,
      totalPausedSeconds: 0,
      sections: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    };

    await repository.saveRuntime(runtime);
    const loaded = await repository.getRuntimeByScheduleId('sched-1');
    expect(loaded).toEqual(runtime);

    await repository.deleteRuntime('sched-1');
    const deleted = await repository.getRuntimeByScheduleId('sched-1');
    expect(deleted).toBeNull();
  });

  it('persists control events and returns them in time order', async () => {
    const events: CohortControlEvent[] = [
      {
        id: 'evt-2',
        scheduleId: 'sched-1',
        runtimeId: 'runtime-1',
        examId: 'exam-1',
        actor: 'Proctor',
        action: 'pause_runtime',
        timestamp: '2026-01-01T00:05:00.000Z'
      },
      {
        id: 'evt-1',
        scheduleId: 'sched-1',
        runtimeId: 'runtime-1',
        examId: 'exam-1',
        actor: 'Proctor',
        action: 'start_runtime',
        timestamp: '2026-01-01T00:00:00.000Z'
      }
    ];

    await repository.saveControlEvent(events[0]);
    await repository.saveControlEvent(events[1]);

    const loaded = await repository.getControlEventsByScheduleId('sched-1');
    expect(loaded.map(event => event.id)).toEqual(['evt-1', 'evt-2']);
  });
});

describe('examRepository backend adapters', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('loads exams from the backend when the builder flag is enabled', async () => {
    vi.stubEnv('VITE_FEATURE_USE_BACKEND_BUILDER', 'true');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              id: '11111111-1111-1111-1111-111111111111',
              slug: 'mock-exam',
              title: 'Mock Exam',
              examType: 'Academic',
              status: 'draft',
              visibility: 'organization',
              ownerId: 'owner-1',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              currentDraftVersionId: null,
              currentPublishedVersionId: null,
              schemaVersion: 3,
              revision: 4,
            },
          ],
          metadata: {
            requestId: 'req-1',
            timestamp: '2026-01-01T00:00:00.000Z',
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    const exams = await examRepository.getAllExams();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/exams/',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(exams).toEqual([
      expect.objectContaining({
        id: '11111111-1111-1111-1111-111111111111',
        type: 'Academic',
        owner: 'owner-1',
        canEdit: true,
        canPublish: true,
        canDelete: true,
      }),
    ]);
  });

  it('creates schedules through the backend when the scheduling flag is enabled', async () => {
    vi.stubEnv('VITE_FEATURE_USE_BACKEND_SCHEDULING', 'true');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            id: '22222222-2222-2222-2222-222222222222',
            examId: 'exam-1',
            examTitle: 'Mock Exam',
            publishedVersionId: 'ver-1',
            cohortName: 'Cohort A',
            institution: 'Center',
            startTime: '2026-01-01T09:00:00.000Z',
            endTime: '2026-01-01T12:00:00.000Z',
            plannedDurationMinutes: 180,
            deliveryMode: 'proctor_start',
            recurrenceType: 'none',
            recurrenceInterval: 1,
            autoStart: false,
            autoStop: false,
            status: 'scheduled',
            createdAt: '2026-01-01T00:00:00.000Z',
            createdBy: 'admin-1',
            updatedAt: '2026-01-01T00:00:00.000Z',
            revision: 1,
          },
          metadata: {
            requestId: 'req-2',
            timestamp: '2026-01-01T00:00:00.000Z',
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    await examRepository.saveSchedule({
      id: 'sched-local',
      examId: 'exam-1',
      examTitle: 'Mock Exam',
      publishedVersionId: 'ver-1',
      cohortName: 'Cohort A',
      institution: 'Center',
      startTime: '2026-01-01T09:00:00.000Z',
      endTime: '2026-01-01T12:00:00.000Z',
      plannedDurationMinutes: 180,
      deliveryMode: 'proctor_start',
      autoStart: false,
      autoStop: false,
      status: 'scheduled',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'Admin',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/schedules/',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual(
      expect.objectContaining({
        examId: 'exam-1',
        cohortName: 'Cohort A',
        publishedVersionId: 'ver-1',
      }),
    );
  });

  it('surfaces backend builder failures instead of silently returning null', async () => {
    vi.stubEnv('VITE_FEATURE_USE_BACKEND_BUILDER', 'true');
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'builder unavailable' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch;

    await expect(examRepository.getExamById('missing')).rejects.toThrow('builder unavailable');
  });
});
