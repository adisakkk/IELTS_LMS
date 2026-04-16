import React from 'react';
import { Button } from '../ui/Button';
import type { StudentQuestionDescriptor } from '@services/examAdapterService';
import type { StudentAnswer } from './providers/StudentRuntimeProvider';

interface StudentFooterProps {
  questions: StudentQuestionDescriptor[];
  currentQuestionId: string | null;
  onNavigate: (id: string) => void;
  answers: Record<string, StudentAnswer | undefined>;
  flags?: Record<string, boolean>;
  onToggleFlag?: (id: string) => void;
  onSubmit: () => void;
}

export function StudentFooter({
  questions,
  currentQuestionId,
  onNavigate,
  answers,
  flags = {},
  onSubmit,
}: StudentFooterProps) {
  const groupedQuestions = questions.reduce<Record<string, StudentQuestionDescriptor[]>>(
    (groups, question) => {
      const existingGroup = groups[question.groupId];
      if (existingGroup) {
        existingGroup.push(question);
      } else {
        groups[question.groupId] = [question];
      }
      return groups;
    },
    {},
  );

  const passageGroups = Object.entries(groupedQuestions).map(([groupId, groupQuestions], index) => ({
    groupId,
    groupQuestions,
    index,
  }));

  const totalQuestions = questions.reduce(
    (count, question) => count + (question.isMulti ? question.correctCount : 1),
    0,
  );
  const answeredCount = questions.reduce((count, question) => {
    const answer = answers[question.id];

    if (question.isMulti) {
      return count + (Array.isArray(answer) ? answer.length : 0);
    }

    return count + (answer !== undefined && answer !== '' ? 1 : 0);
  }, 0);

  const progressPercent = totalQuestions === 0 ? 0 : (answeredCount / totalQuestions) * 100;

  return (
    <footer
      className="border-t border-gray-200 bg-white flex flex-col flex-shrink-0 z-10 max-h-32 md:max-h-28 lg:max-h-24"
      role="contentinfo"
      aria-label="Question navigation and progress"
    >
      {/* Progress strip */}
      <div className="h-1 w-full bg-gray-100" aria-hidden="true">
        <div
          className="h-full bg-gray-900 transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="flex items-center justify-between px-3 md:px-4 lg:px-5 py-2">
        <div className="flex items-center gap-3">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-sm font-medium text-gray-900 tabular-nums">{answeredCount}</span>
            <span className="text-xs text-gray-400">/</span>
            <span className="font-mono text-sm text-gray-500 tabular-nums">{totalQuestions}</span>
            <span className="text-xs text-gray-500 ml-1">answered</span>
          </div>
        </div>

        {answeredCount === totalQuestions ? (
          <Button variant="primary" size="sm" className="flex-shrink-0" onClick={onSubmit}>
            Finish exam
          </Button>
        ) : (
          <span className="text-xs text-gray-500 font-mono tabular-nums">
            {totalQuestions - answeredCount} remaining
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 md:gap-3 px-3 md:px-4 lg:px-5 pb-2 overflow-x-auto no-scrollbar">
        {passageGroups.map(({ groupId, groupQuestions, index }) => {
          const isActiveGroup = groupQuestions.some(
            (question) => question.id === currentQuestionId,
          );

          return (
            <div
              key={groupId}
              className="flex items-center gap-2 whitespace-nowrap flex-shrink-0"
            >
              {isActiveGroup ? (
                <div className="flex items-center gap-1">
                  {groupQuestions.map((question) => {
                    const globalIndex =
                      questions.findIndex((candidate) => candidate.id === question.id) + 1;
                    const isCurrent = question.id === currentQuestionId;
                    const answer = answers[question.id];
                    const isAnswered = question.isMulti
                      ? Array.isArray(answer) && answer.length > 0
                      : answer !== undefined && answer !== '';
                    const isFlagged = flags[question.id];

                    return (
                      <button
                        key={question.id}
                        onClick={() => onNavigate(question.id)}
                        className={`relative text-[11px] flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-lg font-medium border transition-colors ${
                          isCurrent
                            ? 'bg-gray-900 border-gray-900 text-white'
                            : isFlagged
                              ? 'bg-amber-100 border-amber-200 text-amber-900 hover:bg-amber-200'
                              : isAnswered
                                ? 'bg-gray-100 border-gray-200 text-gray-900 hover:bg-gray-200'
                                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                        aria-label={`Question ${globalIndex}${isAnswered ? ', answered' : ''}${isFlagged ? ', flagged' : ''}`}
                        aria-current={isCurrent ? 'true' : undefined}
                      >
                        <span className="font-mono tabular-nums">
                          {question.isMulti
                            ? `${globalIndex}-${globalIndex + question.correctCount - 1}`
                            : globalIndex}
                        </span>
                        {isFlagged && !isCurrent ? (
                          <span
                            className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-500 rounded-full ring-2 ring-white"
                            aria-hidden="true"
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <button
                  onClick={() => {
                    const first = groupQuestions[0];
                    if (first) onNavigate(first.id);
                  }}
                  className="flex items-center gap-2 px-2.5 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
                  aria-label={`Jump to passage ${index + 1}`}
                >
                  <span className="text-[10px] font-medium text-gray-500">§{index + 1}</span>
                  <div className="w-12 h-1 bg-gray-100 rounded-full overflow-hidden" aria-hidden="true">
                    <div
                      className="h-full bg-gray-900 transition-all duration-300"
                      style={{
                        width: `${
                          (groupQuestions.filter((question) => {
                            const answer = answers[question.id];
                            return question.isMulti
                              ? Array.isArray(answer) && answer.length > 0
                              : answer !== undefined && answer !== '';
                          }).length /
                            groupQuestions.length) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-gray-500 tabular-nums">
                    {
                      groupQuestions.filter((question) => {
                        const answer = answers[question.id];
                        return question.isMulti
                          ? Array.isArray(answer) && answer.length > 0
                          : answer !== undefined && answer !== '';
                      }).length
                    }
                    /{groupQuestions.length}
                  </span>
                </button>
              )}
              {index < passageGroups.length - 1 ? (
                <div className="w-px h-4 bg-gray-200" aria-hidden="true" />
              ) : null}
            </div>
          );
        })}
      </div>
    </footer>
  );
}
