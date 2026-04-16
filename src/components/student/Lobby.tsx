import React from 'react';
import { Play, Clock, Headphones, BookOpen, PenTool, MessageCircle, Shield, Wifi } from 'lucide-react';
import { Button } from '../ui/Button';
import { ExamState } from '../../types';

interface LobbyProps {
  state: ExamState;
  onStart: () => void;
  onExit: () => void;
}

const MODULE_META: Record<string, { icon: typeof Headphones; tint: string }> = {
  listening: { icon: Headphones, tint: 'bg-blue-100 text-blue-700' },
  reading: { icon: BookOpen, tint: 'bg-green-100 text-green-700' },
  writing: { icon: PenTool, tint: 'bg-amber-100 text-amber-700' },
  speaking: { icon: MessageCircle, tint: 'bg-red-100 text-red-700' },
};

/**
 * Lobby — Refined pre-exam screen
 * Editorial framing, calm palette, one clear primary action.
 */
export function Lobby({ state, onStart, onExit }: LobbyProps) {
  void onExit;

  const enabledModules = Object.values(state.config.sections)
    .filter((s) => s.enabled)
    .sort((a, b) => a.order - b.order);

  const totalDuration = enabledModules.reduce((acc, s) => acc + s.duration, 0);
  const hours = Math.floor(totalDuration / 60);
  const mins = totalDuration % 60;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full bg-gray-50 p-4 sm:p-6 lg:p-10 relative overflow-hidden">
      {/* Ambient background ornaments */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 w-[520px] h-[520px] rounded-full bg-amber-100/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-40 w-[520px] h-[520px] rounded-full bg-blue-100/60 blur-3xl"
      />

      <div className="relative max-w-2xl w-full">
        {/* Brand mark */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl bg-gray-900 text-white flex items-center justify-center font-display italic text-xl leading-none shadow-sm">
            A
          </div>
          <span className="font-display text-xl text-gray-900 tracking-tight">Axia</span>
        </div>

        {/* Main card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden animate-fade-in-up">
          {/* Hero band */}
          <div className="px-6 sm:px-10 pt-10 pb-8 text-center border-b border-gray-100">
            <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-50 text-green-800 text-xs font-medium ring-1 ring-inset ring-green-200 mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse" />
              Ready to begin
            </p>
            <h1 className="font-display text-4xl sm:text-5xl text-gray-900 tracking-tight leading-[1.05] text-balance mb-3">
              {state.title || 'Your IELTS Examination'}
            </h1>
            <p className="text-gray-600 max-w-md mx-auto text-pretty leading-relaxed">
              Take a breath. When you're ready, start the examination. You'll be guided through each
              section with timers and calm instructions.
            </p>
          </div>

          {/* Summary row */}
          <div className="grid grid-cols-2 divide-x divide-gray-100 border-b border-gray-100">
            <div className="px-6 py-5 text-center">
              <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500 font-medium mb-1.5">
                Total duration
              </div>
              <div className="flex items-center justify-center gap-2">
                <Clock size={16} className="text-gray-400" />
                <span className="font-display text-2xl text-gray-900 tracking-tight">
                  {hours > 0 ? `${hours}h ` : ''}
                  {mins}m
                </span>
              </div>
            </div>
            <div className="px-6 py-5 text-center">
              <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500 font-medium mb-1.5">
                Sections
              </div>
              <div className="flex items-center justify-center gap-2">
                <span className="font-display text-2xl text-gray-900 tracking-tight">
                  {enabledModules.length}
                </span>
                <span className="text-sm text-gray-500">modules</span>
              </div>
            </div>
          </div>

          {/* Section schedule */}
          <div className="px-6 sm:px-10 py-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500 font-medium">
                Schedule
              </div>
              <div className="text-[11px] text-gray-400">In order</div>
            </div>
            <ul className="space-y-2">
              {enabledModules.map((module, idx) => {
                const meta = MODULE_META[module.id] ?? { icon: Clock, tint: 'bg-gray-100 text-gray-600' };
                const Icon = meta.icon;
                return (
                  <li
                    key={module.label}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-100"
                  >
                    <span className="w-6 text-xs text-gray-400 font-mono text-center">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span
                      className={`w-8 h-8 rounded-lg flex items-center justify-center ${meta.tint}`}
                    >
                      <Icon size={15} />
                    </span>
                    <span className="flex-1 text-sm font-medium text-gray-900 capitalize">
                      {module.label}
                    </span>
                    <span className="text-sm text-gray-600 tabular-nums">
                      {module.duration} min
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Instructions */}
          {state.config.general.instructions && (
            <div className="px-6 sm:px-10 pb-6">
              <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500 font-medium mb-2">
                Candidate instructions
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-sm text-gray-700 leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">
                {state.config.general.instructions}
              </div>
            </div>
          )}

          {/* Call to action + system indicators */}
          <div className="px-6 sm:px-10 pb-8 pt-2 space-y-4">
            <Button
              variant="primary"
              size="lg"
              fullWidth
              leftIcon={<Play size={16} />}
              onClick={onStart}
              className="h-14 text-base"
            >
              Begin Examination
            </Button>

            <div className="flex items-center justify-center gap-6 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <Shield size={12} className="text-gray-400" />
                Secure proctoring
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Wifi size={12} className="text-gray-400" />
                Network stable
              </span>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-500 mt-6">
          Need help? Contact your proctor before starting.
        </p>
      </div>
    </div>
  );
}
