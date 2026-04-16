import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft, ArrowUp, ArrowDown, Clock, Command as CommandIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface CommandPaletteCommand {
  category?: 'Navigation' | 'Actions' | 'Tools' | 'Recent';
  id: string;
  keywords?: string[];
  perform: () => void;
  subtitle?: string;
  title: string;
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
}

interface CommandPaletteProps {
  commands: CommandPaletteCommand[];
  isOpen: boolean;
  onClose: () => void;
  recentActions?: string[];
}

const fuzzyMatch = (value: string, query: string) => {
  if (!query) return true;
  const haystack = value.toLowerCase();
  const needle = query.toLowerCase();
  let index = 0;
  for (const character of needle) {
    index = haystack.indexOf(character, index);
    if (index === -1) return false;
    index += 1;
  }
  return true;
};

const CATEGORY_ORDER: Array<NonNullable<CommandPaletteCommand['category']>> = [
  'Navigation',
  'Actions',
  'Tools',
  'Recent',
];

export function CommandPalette({
  commands,
  isOpen,
  onClose,
  recentActions = [],
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
    } else {
      document.body.style.overflow = 'unset';
    }

    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const filteredCommands = useMemo(() => {
    return commands.filter((command) => {
      const source = [command.title, command.subtitle, command.category, ...(command.keywords ?? [])]
        .filter(Boolean)
        .join(' ');
      return source.toLowerCase().includes(query.toLowerCase()) || fuzzyMatch(source, query);
    });
  }, [commands, query]);

  const grouped = useMemo(() => {
    const buckets = new Map<string, CommandPaletteCommand[]>();
    for (const cmd of filteredCommands) {
      const cat = cmd.category ?? 'Actions';
      if (!buckets.has(cat)) buckets.set(cat, []);
      buckets.get(cat)!.push(cmd);
    }
    return CATEGORY_ORDER
      .map((cat) => ({ category: cat, items: buckets.get(cat) ?? [] }))
      .filter((group) => group.items.length > 0);
  }, [filteredCommands]);

  // Keep selectedIndex in range as filter shrinks
  useEffect(() => {
    if (selectedIndex >= filteredCommands.length) {
      setSelectedIndex(Math.max(0, filteredCommands.length - 1));
    }
  }, [filteredCommands.length, selectedIndex]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((current) => Math.min(current + 1, filteredCommands.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((current) => Math.max(current - 1, 0));
      } else if (event.key === 'Enter') {
        const selected = filteredCommands[selectedIndex];
        if (selected) {
          event.preventDefault();
          selected.perform();
          onClose();
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredCommands, isOpen, onClose, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
    selectedEl?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  let runningIndex = -1;

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-gray-950/55 backdrop-blur-[3px]"
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="relative w-full max-w-xl bg-white rounded-2xl border border-gray-100 overflow-hidden"
            style={{ boxShadow: '0 32px 64px -16px rgba(10,10,12,0.28), 0 0 0 1px rgba(10,10,12,0.04)' }}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
              <Search size={18} strokeWidth={1.75} className="text-gray-400 flex-shrink-0" aria-hidden="true" />
              <input
                autoFocus
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedIndex(0);
                }}
                placeholder="Search commands, exams, sessions…"
                className="flex-1 bg-transparent text-[15px] text-gray-900 placeholder:text-gray-400 outline-none"
                aria-label="Search"
              />
              <kbd className="hidden sm:flex items-center gap-1 text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-md">
                ESC
              </kbd>
            </div>

            {/* Recent chips when no query */}
            {!query && recentActions.length > 0 && (
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock size={11} className="text-gray-500" strokeWidth={2} aria-hidden="true" />
                  <p className="text-[11px] font-medium text-gray-500 tracking-wide">Recent</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {recentActions.slice(-5).reverse().map((action, index) => (
                    <span
                      key={`${action}-${index}`}
                      className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-700 border border-gray-200"
                    >
                      {action}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Results */}
            <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
              {filteredCommands.length === 0 && (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm text-gray-500">No commands match &ldquo;{query}&rdquo;</p>
                  <p className="mt-1 text-xs text-gray-400">Try different keywords or check spelling.</p>
                </div>
              )}

              {grouped.map((group) => (
                <div key={group.category} className="py-1.5">
                  <div className="px-5 pb-1.5 text-[11px] font-medium text-gray-500 tracking-wide">
                    {group.category}
                  </div>
                  {group.items.map((command) => {
                    runningIndex += 1;
                    const idx = runningIndex;
                    const Icon = command.icon ?? CommandIcon;
                    const isActive = idx === selectedIndex;

                    return (
                      <button
                        key={command.id}
                        data-index={idx}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        onClick={() => {
                          command.perform();
                          onClose();
                        }}
                        className={`w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors ${
                          isActive ? 'bg-gray-50' : 'bg-transparent'
                        }`}
                      >
                        <div
                          className={`flex-shrink-0 h-7 w-7 rounded-lg flex items-center justify-center ${
                            isActive
                              ? 'bg-gray-900 text-white'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                          aria-hidden="true"
                        >
                          <Icon size={14} strokeWidth={1.75} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{command.title}</p>
                          {command.subtitle && (
                            <p className="text-xs text-gray-500 truncate mt-0.5">{command.subtitle}</p>
                          )}
                        </div>
                        {isActive && (
                          <CornerDownLeft
                            size={14}
                            strokeWidth={1.75}
                            className="flex-shrink-0 text-gray-400"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Footer with keyboard hints */}
            <div className="flex items-center justify-between gap-4 px-5 py-2.5 border-t border-gray-100 bg-gray-50/60 text-[11px] text-gray-500">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-white px-1 font-mono text-[10px] text-gray-600 border border-gray-200">
                    <ArrowUp size={10} />
                  </kbd>
                  <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-white px-1 font-mono text-[10px] text-gray-600 border border-gray-200">
                    <ArrowDown size={10} />
                  </kbd>
                  <span className="ml-0.5">navigate</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="inline-flex h-5 items-center justify-center rounded-md bg-white px-1.5 font-mono text-[10px] text-gray-600 border border-gray-200">
                    ↵
                  </kbd>
                  <span>select</span>
                </span>
              </div>
              <span className="font-mono tracking-tight">
                {filteredCommands.length} result{filteredCommands.length === 1 ? '' : 's'}
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
