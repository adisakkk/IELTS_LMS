import React, { useState } from 'react';
import { Wifi, Bell, LogOut, Clock, CheckCircle, Loader2, Contrast, WifiOff, AlertTriangle } from 'lucide-react';

interface StudentHeaderProps {
  onExit: () => void;
  timeRemaining?: number | undefined;
  elapsedTime?: number | undefined;
  totalSectionTime?: number | undefined;
  autoSaveStatus?: 'saved' | 'saving' | 'syncing' | 'offline' | null | undefined;
  onOpenAccessibility?: (() => void) | undefined;
  isExamActive?: boolean | undefined;
}

export function StudentHeader({
  onExit,
  timeRemaining,
  elapsedTime = 0,
  totalSectionTime = 0,
  autoSaveStatus,
  onOpenAccessibility,
  isExamActive = false,
}: StudentHeaderProps) {
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleExit = () => {
    if (isExamActive) {
      setShowExitConfirm(true);
    } else {
      onExit();
    }
  };

  const confirmExit = () => {
    setShowExitConfirm(false);
    onExit();
  };

  const isWarning = timeRemaining !== undefined && timeRemaining < 300;

  return (
    <header
      className="h-14 md:h-16 border-b border-gray-200 bg-white flex items-center justify-between px-3 md:px-4 lg:px-6 flex-shrink-0 z-10"
      role="banner"
    >
      {/* Brand + candidate */}
      <div className="flex items-center gap-3 md:gap-4 lg:gap-5 min-w-0">
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="h-7 w-7 rounded-lg bg-gray-900 flex items-center justify-center" aria-hidden="true">
            <span className="font-display text-white text-[15px] leading-none">A</span>
          </div>
          <span className="font-display text-lg md:text-xl text-gray-900 leading-none hidden sm:inline">Axia</span>
        </div>
        <div className="hidden md:block h-6 w-px bg-gray-200" aria-hidden="true" />
        <div className="hidden sm:flex flex-col min-w-0">
          <span className="text-[10px] font-medium text-gray-500 tracking-wide">Test taker ID</span>
          <span className="text-sm font-medium text-gray-900 font-mono truncate">IELTS-PRO-2024-001</span>
        </div>
      </div>

      {/* Timer cluster */}
      {timeRemaining !== undefined && (
        <div className="flex items-center gap-2 md:gap-3 lg:gap-4 overflow-x-auto no-scrollbar flex-shrink-0">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-[10px] font-medium text-gray-500 tracking-wide">Elapsed</span>
            <span className="font-mono text-xs text-gray-700 tabular-nums">{formatTime(elapsedTime)}</span>
          </div>

          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors flex-shrink-0 ${
              isWarning
                ? 'bg-red-100 border-red-200 text-red-900 animate-pulse-subtle'
                : 'bg-gray-50 border-gray-200 text-gray-900'
            }`}
            role="timer"
            aria-live={isWarning ? 'assertive' : 'polite'}
          >
            <Clock
              size={14}
              strokeWidth={1.75}
              className={isWarning ? 'text-red-700' : 'text-gray-600'}
              aria-hidden="true"
            />
            <span className="font-mono font-medium text-base md:text-lg tabular-nums leading-none">
              {formatTime(timeRemaining)}
            </span>
          </div>

          <div className="hidden md:flex flex-col items-start">
            <span className="text-[10px] font-medium text-gray-500 tracking-wide">Total</span>
            <span className="font-mono text-xs text-gray-700 tabular-nums">{formatTime(totalSectionTime)}</span>
          </div>
        </div>
      )}

      {/* Status & actions */}
      <div className="flex items-center gap-1.5 md:gap-2 lg:gap-3 text-gray-700 flex-shrink-0">
        {autoSaveStatus && (
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium">
            {autoSaveStatus === 'saving' || autoSaveStatus === 'syncing' ? (
              <>
                <Loader2 size={12} className="animate-spin text-gray-500" strokeWidth={1.75} />
                <span className="text-gray-600">{autoSaveStatus === 'syncing' ? 'Syncing' : 'Saving'}</span>
              </>
            ) : autoSaveStatus === 'offline' ? (
              <>
                <WifiOff size={12} className="text-amber-700" strokeWidth={1.75} />
                <span className="text-amber-800">Offline</span>
              </>
            ) : (
              <>
                <CheckCircle size={12} className="text-green-700" strokeWidth={1.75} />
                <span className="text-green-800">Saved</span>
              </>
            )}
          </div>
        )}
        {onOpenAccessibility && (
          <button
            onClick={onOpenAccessibility}
            className="h-9 w-9 flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors flex-shrink-0"
            aria-label="Open accessibility settings"
          >
            <Contrast size={16} strokeWidth={1.75} />
          </button>
        )}
        {!isExamActive && (
          <>
            <button
              className="relative h-9 w-9 flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors hidden sm:flex flex-shrink-0"
              aria-label="Connection status: Online"
            >
              <Wifi size={16} strokeWidth={1.75} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-green-600 rounded-full ring-2 ring-white" aria-hidden="true" />
            </button>
            <button
              className="h-9 w-9 flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors hidden sm:flex flex-shrink-0"
              aria-label="Notifications"
            >
              <Bell size={16} strokeWidth={1.75} />
            </button>
          </>
        )}
        <div className="hidden sm:block h-6 w-px bg-gray-200 mx-1" aria-hidden="true" />
        <button
          onClick={handleExit}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-900 text-sm font-medium transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-4 focus-visible:ring-gray-900/15"
          aria-label={isExamActive ? 'Exit exam' : 'Exit preview'}
        >
          <LogOut size={14} strokeWidth={1.75} aria-hidden="true" />
          <span className="hidden sm:inline">Exit</span>
        </button>
      </div>

      {/* Exit confirmation overlay */}
      {showExitConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/55 backdrop-blur-[3px] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exit-confirm-title"
        >
          <div
            className="max-w-md w-full bg-white rounded-2xl border border-gray-100 p-6 md:p-7"
            style={{ boxShadow: '0 24px 48px -12px rgba(10,10,12,0.22)' }}
          >
            <div
              className="h-10 w-10 rounded-xl bg-amber-100 text-amber-700 ring-1 ring-amber-200 flex items-center justify-center mb-4"
              aria-hidden="true"
            >
              <AlertTriangle size={18} strokeWidth={1.75} />
            </div>
            <h2 id="exit-confirm-title" className="font-display text-2xl text-gray-900 leading-tight mb-2">
              Exit this exam?
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed mb-6">
              Your progress has been saved, but once you leave you will not be able to return to this session.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Continue exam
              </button>
              <button
                onClick={confirmExit}
                className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-sm font-medium transition-colors"
              >
                Exit exam
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
