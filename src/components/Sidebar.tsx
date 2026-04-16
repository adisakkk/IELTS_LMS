import React from 'react';
import {
  BookOpen,
  Headphones,
  PenTool,
  MessageCircle,
} from 'lucide-react';
import { ExamState, ModuleType } from '../types';

type ExamStateUpdate = ExamState | ((previous: ExamState) => ExamState);

/**
 * Sidebar — Refined builder nav
 * Cream surface, ink-on-white active state, ambient module tinting.
 */
export function Sidebar({
  state,
  setState,
}: {
  state: ExamState;
  setState: (next: ExamStateUpdate) => void | Promise<void>;
}) {
  const modules = [
    {
      id: 'listening' as ModuleType,
      icon: Headphones,
      label: state.config.sections.listening.label,
      accent: 'bg-blue-100 text-blue-700',
      shortcut: '1'
    },
    {
      id: 'reading' as ModuleType,
      icon: BookOpen,
      label: state.config.sections.reading.label,
      accent: 'bg-green-100 text-green-700',
      shortcut: '2'
    },
    {
      id: 'writing' as ModuleType,
      icon: PenTool,
      label: state.config.sections.writing.label,
      accent: 'bg-amber-100 text-amber-700',
      shortcut: '3'
    },
    {
      id: 'speaking' as ModuleType,
      icon: MessageCircle,
      label: state.config.sections.speaking.label,
      accent: 'bg-red-100 text-red-700',
      shortcut: '4'
    },
  ].filter(m => state.config.sections[m.id].enabled)
    .sort((a, b) => state.config.sections[a.id].order - state.config.sections[b.id].order);

  return (
    <div className="w-60 bg-white border-r border-gray-100 flex flex-col h-full flex-shrink-0">
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-2.5 px-1 mb-6">
          <div className="w-9 h-9 bg-gray-900 text-white rounded-xl flex items-center justify-center font-display italic text-xl leading-none shadow-sm">
            A
          </div>
          <div className="leading-tight">
            <h1 className="font-display text-lg text-gray-900 tracking-tight">Axia Studio</h1>
            <p className="text-[10px] text-gray-500 font-medium tracking-[0.18em] uppercase">
              Content Authoring
            </p>
          </div>
        </div>

        <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500 font-medium px-2 mb-1.5">
          Modules
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4 no-scrollbar">
        <div className="space-y-1">
          {modules.map(mod => {
            const isActive = state.activeModule === mod.id;
            const Icon = mod.icon;

            return (
              <button
                key={mod.id}
                onClick={() => setState({ ...state, activeModule: mod.id })}
                className={`group relative w-full flex items-center gap-3 pl-3 pr-2 py-2.5 text-sm font-medium transition-all rounded-lg ${
                  isActive
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <span
                  className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                    isActive
                      ? 'bg-white/10 text-white'
                      : mod.accent
                  }`}
                >
                  <Icon size={15} />
                </span>
                <span className="flex-1 text-left truncate">{mod.label}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-opacity ${
                    isActive
                      ? 'border-white/20 text-white/70'
                      : 'border-gray-200 text-gray-400 opacity-0 group-hover:opacity-100'
                  }`}
                >
                  ⌘{mod.shortcut}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
          <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500 font-medium mb-1">
            Tip
          </div>
          <p className="text-xs text-gray-700 leading-relaxed">
            Use <kbd className="font-mono text-[10px] px-1 py-0.5 bg-white border border-gray-200 rounded">⌘K</kbd> anywhere to open the command palette.
          </p>
        </div>
      </div>
    </div>
  );
}
