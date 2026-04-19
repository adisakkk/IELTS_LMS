import { backendGet, isBackendGradingEnabled, isBackendNotFound } from './backendBridge';
import type {
  GradingSession,
  ReleaseEvent,
  ReviewDraft,
  ReviewEvent,
  SectionSubmission,
  StudentResult,
  StudentSubmission,
  WritingTaskSubmission,
} from '../types/grading';

const STORAGE_KEY_SESSIONS = 'ielts_grading_sessions';
const STORAGE_KEY_SUBMISSIONS = 'ielts_student_submissions';
const STORAGE_KEY_SECTION_SUBMISSIONS = 'ielts_section_submissions';
const STORAGE_KEY_WRITING_SUBMISSIONS = 'ielts_writing_submissions';
const STORAGE_KEY_REVIEW_DRAFTS = 'ielts_review_drafts';
const STORAGE_KEY_REVIEW_EVENTS = 'ielts_review_events';
const STORAGE_KEY_STUDENT_RESULTS = 'ielts_student_results';
const STORAGE_KEY_RELEASE_EVENTS = 'ielts_release_events';

const reviewDraftRevisions = new Map<string, number>();

function normalizeTeacherSummary(value: unknown): NonNullable<ReviewDraft['teacherSummary']> {
  if (value && typeof value === 'object') {
    const payload = value as Record<string, unknown>;
    return {
      strengths: Array.isArray(payload.strengths) ? payload.strengths as string[] : [],
      improvementPriorities: Array.isArray(payload.improvementPriorities)
        ? payload.improvementPriorities as string[]
        : [],
      recommendedPractice: Array.isArray(payload.recommendedPractice)
        ? payload.recommendedPractice as string[]
        : [],
    };
  }

  return {
    strengths: [],
    improvementPriorities: [],
    recommendedPractice: [],
  };
}

function normalizeStudentResultSummary(
  value: unknown,
): NonNullable<StudentResult['teacherSummary']> {
  const summary = normalizeTeacherSummary(value);
  return {
    strengths: summary.strengths,
    improvementPriorities: summary.improvementPriorities,
    recommendedPractice: summary.recommendedPractice,
  };
}

function normalizeSectionBands(value: unknown): StudentResult['sectionBands'] {
  if (value && typeof value === 'object') {
    const payload = value as Record<string, unknown>;
    return {
      listening: Number(payload.listening ?? 0),
      reading: Number(payload.reading ?? 0),
      writing: Number(payload.writing ?? 0),
      speaking: Number(payload.speaking ?? 0),
    };
  }

  return {
    listening: 0,
    reading: 0,
    writing: 0,
    speaking: 0,
  };
}

export function rememberReviewDraftRevision(id: string, revision: number | undefined): void {
  if (Number.isInteger(revision)) {
    reviewDraftRevisions.set(id, revision as number);
  }
}

export function getReviewDraftRevision(id: string): number | undefined {
  return reviewDraftRevisions.get(id);
}

export interface IGradingRepository {
  getAllSessions(): Promise<GradingSession[]>;
  getSessionById(id: string): Promise<GradingSession | null>;
  getSessionsBySchedule(scheduleId: string): Promise<GradingSession[]>;
  saveSession(session: GradingSession): Promise<void>;
  deleteSession(id: string): Promise<void>;
  getAllSubmissions(): Promise<StudentSubmission[]>;
  getSubmissionById(id: string): Promise<StudentSubmission | null>;
  getSubmissionsBySession(sessionId: string): Promise<StudentSubmission[]>;
  getSubmissionsByStudent(studentId: string): Promise<StudentSubmission[]>;
  getSubmissionsByTeacher(teacherId: string): Promise<StudentSubmission[]>;
  saveSubmission(submission: StudentSubmission): Promise<void>;
  deleteSubmission(id: string): Promise<void>;
  getAllSectionSubmissions(): Promise<SectionSubmission[]>;
  getSectionSubmissionById(id: string): Promise<SectionSubmission | null>;
  getSectionSubmissionsBySubmissionId(submissionId: string): Promise<SectionSubmission[]>;
  saveSectionSubmission(section: SectionSubmission): Promise<void>;
  deleteSectionSubmission(id: string): Promise<void>;
  getAllWritingSubmissions(): Promise<WritingTaskSubmission[]>;
  getWritingSubmissionById(id: string): Promise<WritingTaskSubmission | null>;
  getWritingSubmissionsBySectionSubmissionId(sectionSubmissionId: string): Promise<WritingTaskSubmission[]>;
  getWritingSubmissionsBySubmissionId(submissionId: string): Promise<WritingTaskSubmission[]>;
  saveWritingSubmission(writing: WritingTaskSubmission): Promise<void>;
  deleteWritingSubmission(id: string): Promise<void>;
  getAllReviewDrafts(): Promise<ReviewDraft[]>;
  getReviewDraftById(id: string): Promise<ReviewDraft | null>;
  getReviewDraftBySubmission(submissionId: string): Promise<ReviewDraft | null>;
  saveReviewDraft(draft: ReviewDraft): Promise<void>;
  deleteReviewDraft(id: string): Promise<void>;
  getReviewEvents(submissionId: string, limit?: number): Promise<ReviewEvent[]>;
  saveReviewEvent(event: ReviewEvent): Promise<void>;
  getAllStudentResults(): Promise<StudentResult[]>;
  getStudentResultById(id: string): Promise<StudentResult | null>;
  getStudentResultsBySubmission(submissionId: string): Promise<StudentResult[]>;
  getStudentResultsByStudent(studentId: string): Promise<StudentResult[]>;
  saveStudentResult(result: StudentResult): Promise<void>;
  deleteStudentResult(id: string): Promise<void>;
  getReleaseEvents(resultId: string, limit?: number): Promise<ReleaseEvent[]>;
  saveReleaseEvent(event: ReleaseEvent): Promise<void>;
  clearAll(): Promise<void>;
}

export class LocalStorageGradingRepository implements IGradingRepository {
  private getItem<T>(key: string): T[] {
    const item = localStorage.getItem(key);
    return item ? (JSON.parse(item) as T[]) : [];
  }

  private setItem<T>(key: string, data: T[]): void {
    localStorage.setItem(key, JSON.stringify(data));
  }

  async getAllSessions(): Promise<GradingSession[]> {
    return this.getItem<GradingSession>(STORAGE_KEY_SESSIONS);
  }

  async getSessionById(id: string): Promise<GradingSession | null> {
    return (await this.getAllSessions()).find((session) => session.id === id) ?? null;
  }

  async getSessionsBySchedule(scheduleId: string): Promise<GradingSession[]> {
    return (await this.getAllSessions()).filter((session) => session.scheduleId === scheduleId);
  }

  async saveSession(session: GradingSession): Promise<void> {
    const sessions = await this.getAllSessions();
    const index = sessions.findIndex((candidate) => candidate.id === session.id);
    if (index >= 0) {
      sessions[index] = { ...session, updatedAt: new Date().toISOString() };
    } else {
      sessions.push(session);
    }
    this.setItem(STORAGE_KEY_SESSIONS, sessions);
  }

  async deleteSession(id: string): Promise<void> {
    this.setItem(
      STORAGE_KEY_SESSIONS,
      (await this.getAllSessions()).filter((session) => session.id !== id),
    );
  }

  async getAllSubmissions(): Promise<StudentSubmission[]> {
    return this.getItem<StudentSubmission>(STORAGE_KEY_SUBMISSIONS);
  }

  async getSubmissionById(id: string): Promise<StudentSubmission | null> {
    return (await this.getAllSubmissions()).find((submission) => submission.id === id) ?? null;
  }

  async getSubmissionsBySession(sessionId: string): Promise<StudentSubmission[]> {
    return (await this.getAllSubmissions()).filter((submission) => submission.scheduleId === sessionId);
  }

  async getSubmissionsByStudent(studentId: string): Promise<StudentSubmission[]> {
    return (await this.getAllSubmissions()).filter((submission) => submission.studentId === studentId);
  }

  async getSubmissionsByTeacher(teacherId: string): Promise<StudentSubmission[]> {
    return (await this.getAllSubmissions()).filter(
      (submission) => submission.assignedTeacherId === teacherId,
    );
  }

  async saveSubmission(submission: StudentSubmission): Promise<void> {
    const submissions = await this.getAllSubmissions();
    const index = submissions.findIndex((candidate) => candidate.id === submission.id);
    if (index >= 0) {
      submissions[index] = { ...submission, updatedAt: new Date().toISOString() };
    } else {
      submissions.push(submission);
    }
    this.setItem(STORAGE_KEY_SUBMISSIONS, submissions);
  }

  async deleteSubmission(id: string): Promise<void> {
    this.setItem(
      STORAGE_KEY_SUBMISSIONS,
      (await this.getAllSubmissions()).filter((submission) => submission.id !== id),
    );
  }

  async getAllSectionSubmissions(): Promise<SectionSubmission[]> {
    return this.getItem<SectionSubmission>(STORAGE_KEY_SECTION_SUBMISSIONS);
  }

  async getSectionSubmissionById(id: string): Promise<SectionSubmission | null> {
    return (await this.getAllSectionSubmissions()).find((section) => section.id === id) ?? null;
  }

  async getSectionSubmissionsBySubmissionId(submissionId: string): Promise<SectionSubmission[]> {
    return (await this.getAllSectionSubmissions()).filter(
      (section) => section.submissionId === submissionId,
    );
  }

  async saveSectionSubmission(section: SectionSubmission): Promise<void> {
    const sections = await this.getAllSectionSubmissions();
    const index = sections.findIndex((candidate) => candidate.id === section.id);
    if (index >= 0) {
      sections[index] = section;
    } else {
      sections.push(section);
    }
    this.setItem(STORAGE_KEY_SECTION_SUBMISSIONS, sections);
  }

  async deleteSectionSubmission(id: string): Promise<void> {
    this.setItem(
      STORAGE_KEY_SECTION_SUBMISSIONS,
      (await this.getAllSectionSubmissions()).filter((section) => section.id !== id),
    );
  }

  async getAllWritingSubmissions(): Promise<WritingTaskSubmission[]> {
    return this.getItem<WritingTaskSubmission>(STORAGE_KEY_WRITING_SUBMISSIONS);
  }

  async getWritingSubmissionById(id: string): Promise<WritingTaskSubmission | null> {
    return (await this.getAllWritingSubmissions()).find((writing) => writing.id === id) ?? null;
  }

  async getWritingSubmissionsBySectionSubmissionId(
    sectionSubmissionId: string,
  ): Promise<WritingTaskSubmission[]> {
    return (await this.getAllWritingSubmissions()).filter(
      (writing) => (writing as WritingTaskSubmission & { sectionSubmissionId?: string }).sectionSubmissionId === sectionSubmissionId,
    );
  }

  async getWritingSubmissionsBySubmissionId(submissionId: string): Promise<WritingTaskSubmission[]> {
    return (await this.getAllWritingSubmissions()).filter(
      (writing) => writing.submissionId === submissionId,
    );
  }

  async saveWritingSubmission(writing: WritingTaskSubmission): Promise<void> {
    const writings = await this.getAllWritingSubmissions();
    const index = writings.findIndex((candidate) => candidate.id === writing.id);
    if (index >= 0) {
      writings[index] = writing;
    } else {
      writings.push(writing);
    }
    this.setItem(STORAGE_KEY_WRITING_SUBMISSIONS, writings);
  }

  async deleteWritingSubmission(id: string): Promise<void> {
    this.setItem(
      STORAGE_KEY_WRITING_SUBMISSIONS,
      (await this.getAllWritingSubmissions()).filter((writing) => writing.id !== id),
    );
  }

  async getAllReviewDrafts(): Promise<ReviewDraft[]> {
    return this.getItem<ReviewDraft>(STORAGE_KEY_REVIEW_DRAFTS);
  }

  async getReviewDraftById(id: string): Promise<ReviewDraft | null> {
    return (await this.getAllReviewDrafts()).find((draft) => draft.id === id) ?? null;
  }

  async getReviewDraftBySubmission(submissionId: string): Promise<ReviewDraft | null> {
    return (await this.getAllReviewDrafts()).find((draft) => draft.submissionId === submissionId) ?? null;
  }

  async saveReviewDraft(draft: ReviewDraft): Promise<void> {
    const drafts = await this.getAllReviewDrafts();
    const index = drafts.findIndex((candidate) => candidate.id === draft.id);
    if (index >= 0) {
      drafts[index] = { ...draft, updatedAt: new Date().toISOString() };
    } else {
      drafts.push(draft);
    }
    this.setItem(STORAGE_KEY_REVIEW_DRAFTS, drafts);
  }

  async deleteReviewDraft(id: string): Promise<void> {
    this.setItem(
      STORAGE_KEY_REVIEW_DRAFTS,
      (await this.getAllReviewDrafts()).filter((draft) => draft.id !== id),
    );
  }

  async getReviewEvents(submissionId: string, limit = 100): Promise<ReviewEvent[]> {
    return this.getItem<ReviewEvent>(STORAGE_KEY_REVIEW_EVENTS)
      .filter((event) => event.submissionId === submissionId)
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
      .slice(0, limit);
  }

  async saveReviewEvent(event: ReviewEvent): Promise<void> {
    const events = this.getItem<ReviewEvent>(STORAGE_KEY_REVIEW_EVENTS);
    events.push(event);
    this.setItem(STORAGE_KEY_REVIEW_EVENTS, events);
  }

  async getAllStudentResults(): Promise<StudentResult[]> {
    return this.getItem<StudentResult>(STORAGE_KEY_STUDENT_RESULTS);
  }

  async getStudentResultById(id: string): Promise<StudentResult | null> {
    return (await this.getAllStudentResults()).find((result) => result.id === id) ?? null;
  }

  async getStudentResultsBySubmission(submissionId: string): Promise<StudentResult[]> {
    return (await this.getAllStudentResults()).filter((result) => result.submissionId === submissionId);
  }

  async getStudentResultsByStudent(studentId: string): Promise<StudentResult[]> {
    return (await this.getAllStudentResults()).filter((result) => result.studentId === studentId);
  }

  async saveStudentResult(result: StudentResult): Promise<void> {
    const results = await this.getAllStudentResults();
    const index = results.findIndex((candidate) => candidate.id === result.id);
    if (index >= 0) {
      results[index] = { ...result, updatedAt: new Date().toISOString() };
    } else {
      results.push(result);
    }
    this.setItem(STORAGE_KEY_STUDENT_RESULTS, results);
  }

  async deleteStudentResult(id: string): Promise<void> {
    this.setItem(
      STORAGE_KEY_STUDENT_RESULTS,
      (await this.getAllStudentResults()).filter((result) => result.id !== id),
    );
  }

  async getReleaseEvents(resultId: string, limit = 100): Promise<ReleaseEvent[]> {
    return this.getItem<ReleaseEvent>(STORAGE_KEY_RELEASE_EVENTS)
      .filter((event) => event.resultId === resultId)
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
      .slice(0, limit);
  }

  async saveReleaseEvent(event: ReleaseEvent): Promise<void> {
    const events = this.getItem<ReleaseEvent>(STORAGE_KEY_RELEASE_EVENTS);
    events.push(event);
    this.setItem(STORAGE_KEY_RELEASE_EVENTS, events);
  }

  async clearAll(): Promise<void> {
    localStorage.removeItem(STORAGE_KEY_SESSIONS);
    localStorage.removeItem(STORAGE_KEY_SUBMISSIONS);
    localStorage.removeItem(STORAGE_KEY_SECTION_SUBMISSIONS);
    localStorage.removeItem(STORAGE_KEY_WRITING_SUBMISSIONS);
    localStorage.removeItem(STORAGE_KEY_REVIEW_DRAFTS);
    localStorage.removeItem(STORAGE_KEY_REVIEW_EVENTS);
    localStorage.removeItem(STORAGE_KEY_STUDENT_RESULTS);
    localStorage.removeItem(STORAGE_KEY_RELEASE_EVENTS);
  }
}

class BackendGradingRepository implements IGradingRepository {
  constructor(private readonly cache: LocalStorageGradingRepository) {}

  private mapSession(payload: any): GradingSession {
    return {
      id: payload.id,
      scheduleId: payload.scheduleId,
      examId: payload.examId,
      examTitle: payload.examTitle,
      publishedVersionId: payload.publishedVersionId,
      cohortName: payload.cohortName,
      institution: payload.institution ?? undefined,
      startTime: payload.startTime,
      endTime: payload.endTime,
      status: payload.status,
      totalStudents: payload.totalStudents,
      submittedCount: payload.submittedCount,
      pendingManualReviews: payload.pendingManualReviews,
      inProgressReviews: payload.inProgressReviews,
      finalizedReviews: payload.finalizedReviews,
      overdueReviews: payload.overdueReviews,
      assignedTeachers: Array.isArray(payload.assignedTeachers) ? payload.assignedTeachers : [],
      createdAt: payload.createdAt,
      createdBy: payload.createdBy,
      updatedAt: payload.updatedAt,
    };
  }

  private mapSubmission(payload: any): StudentSubmission {
    return {
      id: payload.id,
      submissionId: payload.id,
      scheduleId: payload.scheduleId,
      examId: payload.examId,
      publishedVersionId: payload.publishedVersionId,
      studentId: payload.studentId,
      studentName: payload.studentName,
      studentEmail: payload.studentEmail ?? undefined,
      cohortName: payload.cohortName,
      submittedAt: payload.submittedAt,
      timeSpentSeconds: payload.timeSpentSeconds,
      gradingStatus: payload.gradingStatus,
      assignedTeacherId: payload.assignedTeacherId ?? undefined,
      assignedTeacherName: payload.assignedTeacherName ?? undefined,
      isFlagged: payload.isFlagged,
      flagReason: payload.flagReason ?? undefined,
      isOverdue: payload.isOverdue,
      dueDate: payload.dueDate ?? undefined,
      sectionStatuses: payload.sectionStatuses,
      createdAt: payload.createdAt,
      updatedAt: payload.updatedAt,
    };
  }

  private mapSection(payload: any): SectionSubmission {
    return {
      id: payload.id,
      submissionId: payload.submissionId,
      section: payload.section,
      answers: payload.answers,
      autoGradingResults: payload.autoGradingResults ?? undefined,
      gradingStatus: payload.gradingStatus,
      reviewedBy: payload.reviewedBy ?? undefined,
      reviewedAt: payload.reviewedAt ?? undefined,
      finalizedBy: payload.finalizedBy ?? undefined,
      finalizedAt: payload.finalizedAt ?? undefined,
      submittedAt: payload.submittedAt,
    };
  }

  private mapWritingTask(payload: any): WritingTaskSubmission {
    return {
      id: payload.id,
      submissionId: payload.submissionId,
      taskId: payload.taskId,
      taskLabel: payload.taskLabel,
      prompt: payload.prompt,
      studentText: payload.studentText,
      wordCount: payload.wordCount,
      rubricAssessment: payload.rubricAssessment ?? undefined,
      annotations: payload.annotations ?? [],
      overallFeedback: payload.overallFeedback ?? undefined,
      studentVisibleNotes: payload.studentVisibleNotes ?? undefined,
      gradingStatus: payload.gradingStatus,
      submittedAt: payload.submittedAt,
      gradedBy: payload.gradedBy ?? undefined,
      gradedAt: payload.gradedAt ?? undefined,
      finalizedBy: payload.finalizedBy ?? undefined,
      finalizedAt: payload.finalizedAt ?? undefined,
    };
  }

  private mapReviewDraft(payload: any): ReviewDraft {
    rememberReviewDraftRevision(payload.id, payload.revision);

    return {
      id: payload.id,
      submissionId: payload.submissionId,
      studentId: payload.studentId,
      teacherId: payload.teacherId,
      releaseStatus: payload.releaseStatus,
      sectionDrafts: payload.sectionDrafts ?? {},
      annotations: payload.annotations ?? [],
      drawings: payload.drawings ?? [],
      overallFeedback: payload.overallFeedback ?? undefined,
      studentVisibleNotes: payload.studentVisibleNotes ?? undefined,
      internalNotes: payload.internalNotes ?? undefined,
      teacherSummary: normalizeTeacherSummary(payload.teacherSummary),
      checklist: payload.checklist ?? {},
      hasUnsavedChanges: payload.hasUnsavedChanges,
      lastAutoSaveAt: payload.lastAutoSaveAt ?? undefined,
      createdAt: payload.createdAt,
      updatedAt: payload.updatedAt,
    };
  }

  private mapStudentResult(payload: any): StudentResult {
    return {
      id: payload.id,
      submissionId: payload.submissionId,
      studentId: payload.studentId,
      studentName: payload.studentName,
      releaseStatus: payload.releaseStatus,
      releasedAt: payload.releasedAt ?? undefined,
      releasedBy: payload.releasedBy ?? undefined,
      scheduledReleaseDate: payload.scheduledReleaseDate ?? undefined,
      overallBand: payload.overallBand,
      sectionBands: normalizeSectionBands(payload.sectionBands),
      listeningResult: payload.listeningResult ?? undefined,
      readingResult: payload.readingResult ?? undefined,
      writingResults: payload.writingResults ?? {},
      speakingResult: payload.speakingResult ?? undefined,
      teacherSummary: normalizeStudentResultSummary(payload.teacherSummary),
      version: payload.version,
      previousVersionId: payload.previousVersionId ?? undefined,
      revisionReason: payload.revisionReason ?? undefined,
      createdAt: payload.createdAt,
      updatedAt: payload.updatedAt,
    };
  }

  private mapReleaseEvent(payload: any): ReleaseEvent {
    return {
      id: payload.id,
      resultId: payload.resultId,
      action: payload.action,
      actor: payload.actorId ?? payload.actor,
      actorName: payload.actorName ?? payload.actorId ?? 'Unknown',
      timestamp: payload.createdAt ?? payload.timestamp,
      payload: payload.payload ?? undefined,
    };
  }

  private async hydrateSessionDetail(detail: any): Promise<StudentSubmission[]> {
    const submissions = (detail.submissions ?? []).map((submission: any) => this.mapSubmission(submission));
    for (const submission of submissions) {
      await this.cache.saveSubmission(submission);
    }
    return submissions;
  }

  private async hydrateBundle(bundle: any): Promise<void> {
    await this.cache.saveSubmission(this.mapSubmission(bundle.submission));
    await Promise.all((bundle.sections ?? []).map((section: any) => this.cache.saveSectionSubmission(this.mapSection(section))));
    await Promise.all((bundle.writingTasks ?? []).map((writing: any) => this.cache.saveWritingSubmission(this.mapWritingTask(writing))));
    if (bundle.reviewDraft) {
      await this.cache.saveReviewDraft(this.mapReviewDraft(bundle.reviewDraft));
    }
  }

  async getAllSessions(): Promise<GradingSession[]> {
    const sessions = (await backendGet<any[]>('/v1/grading/sessions')).map((session) => this.mapSession(session));
    for (const session of sessions) {
      await this.cache.saveSession(session);
    }
    return sessions;
  }

  async getSessionById(id: string): Promise<GradingSession | null> {
    const detail = await backendGet<any>(`/v1/grading/sessions/${id}`);
    const session = this.mapSession(detail.session);
    await this.cache.saveSession(session);
    await this.hydrateSessionDetail(detail);
    return session;
  }

  async getSessionsBySchedule(scheduleId: string): Promise<GradingSession[]> {
    const session = await this.getSessionById(scheduleId);
    return session ? [session] : [];
  }

  async saveSession(session: GradingSession): Promise<void> {
    await this.cache.saveSession(session);
  }

  async deleteSession(id: string): Promise<void> {
    await this.cache.deleteSession(id);
  }

  async getAllSubmissions(): Promise<StudentSubmission[]> {
    const sessions = await this.getAllSessions();
    const details = await Promise.all(sessions.map((session) => this.getSubmissionsBySession(session.id)));
    return details.flat();
  }

  async getSubmissionById(id: string): Promise<StudentSubmission | null> {
    const bundle = await backendGet<any>(`/v1/grading/submissions/${id}`);
    await this.hydrateBundle(bundle);
    return this.mapSubmission(bundle.submission);
  }

  async getSubmissionsBySession(sessionId: string): Promise<StudentSubmission[]> {
    const detail = await backendGet<any>(`/v1/grading/sessions/${sessionId}`);
    return this.hydrateSessionDetail(detail);
  }

  async getSubmissionsByStudent(studentId: string): Promise<StudentSubmission[]> {
    return (await this.getAllSubmissions()).filter((submission) => submission.studentId === studentId);
  }

  async getSubmissionsByTeacher(teacherId: string): Promise<StudentSubmission[]> {
    return (await this.getAllSubmissions()).filter((submission) => submission.assignedTeacherId === teacherId);
  }

  async saveSubmission(submission: StudentSubmission): Promise<void> {
    await this.cache.saveSubmission(submission);
  }

  async deleteSubmission(id: string): Promise<void> {
    await this.cache.deleteSubmission(id);
  }

  async getAllSectionSubmissions(): Promise<SectionSubmission[]> {
    return this.cache.getAllSectionSubmissions();
  }

  async getSectionSubmissionById(id: string): Promise<SectionSubmission | null> {
    return this.cache.getSectionSubmissionById(id);
  }

  async getSectionSubmissionsBySubmissionId(submissionId: string): Promise<SectionSubmission[]> {
    const cachedSections = await this.cache.getSectionSubmissionsBySubmissionId(submissionId);
    if (cachedSections.length > 0) {
      return cachedSections;
    }

    const bundle = await backendGet<any>(`/v1/grading/submissions/${submissionId}`);
    await this.hydrateBundle(bundle);
    return (bundle.sections ?? []).map((section: any) => this.mapSection(section));
  }

  async saveSectionSubmission(section: SectionSubmission): Promise<void> {
    await this.cache.saveSectionSubmission(section);
  }

  async deleteSectionSubmission(id: string): Promise<void> {
    await this.cache.deleteSectionSubmission(id);
  }

  async getAllWritingSubmissions(): Promise<WritingTaskSubmission[]> {
    return this.cache.getAllWritingSubmissions();
  }

  async getWritingSubmissionById(id: string): Promise<WritingTaskSubmission | null> {
    return this.cache.getWritingSubmissionById(id);
  }

  async getWritingSubmissionsBySectionSubmissionId(
    sectionSubmissionId: string,
  ): Promise<WritingTaskSubmission[]> {
    return this.cache.getWritingSubmissionsBySectionSubmissionId(sectionSubmissionId);
  }

  async getWritingSubmissionsBySubmissionId(submissionId: string): Promise<WritingTaskSubmission[]> {
    const cachedWritings = await this.cache.getWritingSubmissionsBySubmissionId(submissionId);
    if (cachedWritings.length > 0) {
      return cachedWritings;
    }

    const bundle = await backendGet<any>(`/v1/grading/submissions/${submissionId}`);
    await this.hydrateBundle(bundle);
    return (bundle.writingTasks ?? []).map((writing: any) => this.mapWritingTask(writing));
  }

  async saveWritingSubmission(writing: WritingTaskSubmission): Promise<void> {
    await this.cache.saveWritingSubmission(writing);
  }

  async deleteWritingSubmission(id: string): Promise<void> {
    await this.cache.deleteWritingSubmission(id);
  }

  async getAllReviewDrafts(): Promise<ReviewDraft[]> {
    return this.cache.getAllReviewDrafts();
  }

  async getReviewDraftById(id: string): Promise<ReviewDraft | null> {
    return this.cache.getReviewDraftById(id);
  }

  async getReviewDraftBySubmission(submissionId: string): Promise<ReviewDraft | null> {
    const cachedDraft = await this.cache.getReviewDraftBySubmission(submissionId);
    if (cachedDraft) {
      return cachedDraft;
    }

    try {
      const draft = await backendGet<any>(`/v1/grading/submissions/${submissionId}/review-draft`);
      const mappedDraft = this.mapReviewDraft(draft);
      await this.cache.saveReviewDraft(mappedDraft);
      return mappedDraft;
    } catch (error) {
      if (isBackendNotFound(error)) {
        return null;
      }

      throw error;
    }
  }

  async saveReviewDraft(draft: ReviewDraft): Promise<void> {
    await this.cache.saveReviewDraft(draft);
  }

  async deleteReviewDraft(id: string): Promise<void> {
    await this.cache.deleteReviewDraft(id);
  }

  async getReviewEvents(submissionId: string, limit = 100): Promise<ReviewEvent[]> {
    return this.cache.getReviewEvents(submissionId, limit);
  }

  async saveReviewEvent(event: ReviewEvent): Promise<void> {
    await this.cache.saveReviewEvent(event);
  }

  async getAllStudentResults(): Promise<StudentResult[]> {
    const results = (await backendGet<any[]>('/v1/results')).map((result) => this.mapStudentResult(result));
    for (const result of results) {
      await this.cache.saveStudentResult(result);
    }
    return results;
  }

  async getStudentResultById(id: string): Promise<StudentResult | null> {
    const result = this.mapStudentResult(await backendGet<any>(`/v1/results/${id}`));
    await this.cache.saveStudentResult(result);
    return result;
  }

  async getStudentResultsBySubmission(submissionId: string): Promise<StudentResult[]> {
    return (await this.getAllStudentResults()).filter((result) => result.submissionId === submissionId);
  }

  async getStudentResultsByStudent(studentId: string): Promise<StudentResult[]> {
    return (await this.getAllStudentResults()).filter((result) => result.studentId === studentId);
  }

  async saveStudentResult(result: StudentResult): Promise<void> {
    await this.cache.saveStudentResult(result);
  }

  async deleteStudentResult(id: string): Promise<void> {
    await this.cache.deleteStudentResult(id);
  }

  async getReleaseEvents(resultId: string, limit = 100): Promise<ReleaseEvent[]> {
    const events = (await backendGet<any[]>(`/v1/results/${resultId}/events`))
      .map((event) => this.mapReleaseEvent(event))
      .slice(0, limit);
    for (const event of events) {
      await this.cache.saveReleaseEvent(event);
    }
    return events;
  }

  async saveReleaseEvent(event: ReleaseEvent): Promise<void> {
    await this.cache.saveReleaseEvent(event);
  }

  async clearAll(): Promise<void> {
    await this.cache.clearAll();
  }
}

class HybridGradingRepository implements IGradingRepository {
  constructor(
    private readonly localRepository: LocalStorageGradingRepository,
    private readonly backendRepository: BackendGradingRepository,
  ) {}

  private get activeRepository(): IGradingRepository {
    return isBackendGradingEnabled() ? this.backendRepository : this.localRepository;
  }

  getAllSessions() { return this.activeRepository.getAllSessions(); }
  getSessionById(id: string) { return this.activeRepository.getSessionById(id); }
  getSessionsBySchedule(scheduleId: string) { return this.activeRepository.getSessionsBySchedule(scheduleId); }
  saveSession(session: GradingSession) { return this.localRepository.saveSession(session); }
  deleteSession(id: string) { return this.localRepository.deleteSession(id); }
  getAllSubmissions() { return this.activeRepository.getAllSubmissions(); }
  getSubmissionById(id: string) { return this.activeRepository.getSubmissionById(id); }
  getSubmissionsBySession(sessionId: string) { return this.activeRepository.getSubmissionsBySession(sessionId); }
  getSubmissionsByStudent(studentId: string) { return this.activeRepository.getSubmissionsByStudent(studentId); }
  getSubmissionsByTeacher(teacherId: string) { return this.activeRepository.getSubmissionsByTeacher(teacherId); }
  saveSubmission(submission: StudentSubmission) { return this.localRepository.saveSubmission(submission); }
  deleteSubmission(id: string) { return this.localRepository.deleteSubmission(id); }
  getAllSectionSubmissions() { return this.activeRepository.getAllSectionSubmissions(); }
  getSectionSubmissionById(id: string) { return this.activeRepository.getSectionSubmissionById(id); }
  getSectionSubmissionsBySubmissionId(submissionId: string) { return this.activeRepository.getSectionSubmissionsBySubmissionId(submissionId); }
  saveSectionSubmission(section: SectionSubmission) { return this.localRepository.saveSectionSubmission(section); }
  deleteSectionSubmission(id: string) { return this.localRepository.deleteSectionSubmission(id); }
  getAllWritingSubmissions() { return this.activeRepository.getAllWritingSubmissions(); }
  getWritingSubmissionById(id: string) { return this.activeRepository.getWritingSubmissionById(id); }
  getWritingSubmissionsBySectionSubmissionId(sectionSubmissionId: string) { return this.activeRepository.getWritingSubmissionsBySectionSubmissionId(sectionSubmissionId); }
  getWritingSubmissionsBySubmissionId(submissionId: string) { return this.activeRepository.getWritingSubmissionsBySubmissionId(submissionId); }
  saveWritingSubmission(writing: WritingTaskSubmission) { return this.localRepository.saveWritingSubmission(writing); }
  deleteWritingSubmission(id: string) { return this.localRepository.deleteWritingSubmission(id); }
  getAllReviewDrafts() { return this.activeRepository.getAllReviewDrafts(); }
  getReviewDraftById(id: string) { return this.activeRepository.getReviewDraftById(id); }
  getReviewDraftBySubmission(submissionId: string) { return this.activeRepository.getReviewDraftBySubmission(submissionId); }
  saveReviewDraft(draft: ReviewDraft) { return this.localRepository.saveReviewDraft(draft); }
  deleteReviewDraft(id: string) { return this.localRepository.deleteReviewDraft(id); }
  getReviewEvents(submissionId: string, limit?: number) { return this.activeRepository.getReviewEvents(submissionId, limit); }
  saveReviewEvent(event: ReviewEvent) { return this.localRepository.saveReviewEvent(event); }
  getAllStudentResults() { return this.activeRepository.getAllStudentResults(); }
  getStudentResultById(id: string) { return this.activeRepository.getStudentResultById(id); }
  getStudentResultsBySubmission(submissionId: string) { return this.activeRepository.getStudentResultsBySubmission(submissionId); }
  getStudentResultsByStudent(studentId: string) { return this.activeRepository.getStudentResultsByStudent(studentId); }
  saveStudentResult(result: StudentResult) { return this.localRepository.saveStudentResult(result); }
  deleteStudentResult(id: string) { return this.localRepository.deleteStudentResult(id); }
  getReleaseEvents(resultId: string, limit?: number) { return this.activeRepository.getReleaseEvents(resultId, limit); }
  saveReleaseEvent(event: ReleaseEvent) { return this.localRepository.saveReleaseEvent(event); }
  clearAll() { return this.localRepository.clearAll(); }
}

const localStorageGradingRepository = new LocalStorageGradingRepository();

export const gradingRepository = new HybridGradingRepository(
  localStorageGradingRepository,
  new BackendGradingRepository(localStorageGradingRepository),
);
