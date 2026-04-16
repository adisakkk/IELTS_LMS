import React from 'react';
import { Save, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import type { ExamState } from '../types';

type ExamStateUpdate = ExamState | ((previous: ExamState) => ExamState);

interface HeaderProps {
  state: ExamState;
  onUpdateState: (nextState: ExamStateUpdate) => void | Promise<void>;
  onReturnToAdmin: () => void;
  onNavigateToConfig: () => void;
  onNavigateToReview: () => void;
  onSaveDraft?: (() => void) | undefined;
  saveStatusLabel?: string | undefined;
}

/**
 * Builder Header — Refined chrome
 * Inline editable title, calm save status indicator, and elegant CTA pair.
 */
export function Header({
  state,
  onUpdateState,
  onReturnToAdmin,
  onNavigateToConfig,
  onNavigateToReview,
  onSaveDraft,
  saveStatusLabel = 'All changes saved',
}: HeaderProps) {
  return (
    <header className="h-16 border-b border-gray-100 bg-white/80 backdrop-blur-md flex items-center justify-between px-5 flex-shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onNavigateToConfig}
          className="w-9 h-9 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Return to config"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-[10px] uppercase tracking-[0.18em] text-gray-500 font-medium">
            Exam draft
          </span>
          <input
            type="text"
            value={state.title}
            onChange={(event) => {
              void onUpdateState({ ...state, title: event.target.value });
            }}
            className="font-display text-xl text-gray-900 tracking-tight outline-none border-b border-transparent hover:border-gray-200 focus:border-gray-900 bg-transparent px-0 py-0.5 transition-colors min-w-0 truncate"
            aria-label="Exam title"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden sm:inline-flex items-center gap-1.5 text-xs text-gray-500 font-medium px-3 py-1.5 rounded-full bg-gray-50 border border-gray-100">
          <Check size={12} className="text-green-600" />
          <span>{saveStatusLabel}</span>
        </div>
        {onSaveDraft && (
          <button
            onClick={onSaveDraft}
            className="w-9 h-9 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Save draft"
          >
            <Save size={16} />
          </button>
        )}
        <div className="w-px h-6 bg-gray-200 mx-1" />
        <button
          onClick={onReturnToAdmin}
          className="px-3 h-9 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 border border-gray-200 hover:border-gray-300"
        >
          Admin Portal
        </button>
        <button
          onClick={onNavigateToReview}
          className="px-4 h-9 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 shadow-sm hover:shadow-md group"
        >
          Finish &amp; Review
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </header>
  );
}
