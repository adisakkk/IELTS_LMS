import React from 'react';
import { AlertTriangle, Info, XCircle, CheckCircle, X } from 'lucide-react';

interface AlertProps {
  title?: string;
  children: React.ReactNode;
  variant?: 'info' | 'warning' | 'error' | 'success';
  onClose?: () => void;
  className?: string;
}

/**
 * Alert — soft, tonal inline notice.
 * Replaces harsh left-border-4 with a refined tinted surface,
 * subtle icon chip, and soft rounded corners.
 */
export function Alert({
  title,
  children,
  variant = 'info',
  onClose,
  className = '',
}: AlertProps) {
  const variants = {
    info: {
      surface: 'bg-blue-100/60 border-blue-200/70',
      text: 'text-blue-900',
      chip: 'bg-white text-blue-700 ring-1 ring-blue-200',
      icon: Info,
    },
    warning: {
      surface: 'bg-amber-100/70 border-amber-200',
      text: 'text-amber-900',
      chip: 'bg-white text-amber-700 ring-1 ring-amber-200',
      icon: AlertTriangle,
    },
    error: {
      surface: 'bg-red-100/70 border-red-200',
      text: 'text-red-900',
      chip: 'bg-white text-red-700 ring-1 ring-red-200',
      icon: XCircle,
    },
    success: {
      surface: 'bg-green-100/70 border-green-200',
      text: 'text-green-900',
      chip: 'bg-white text-green-700 ring-1 ring-green-200',
      icon: CheckCircle,
    },
  };

  const style = variants[variant];
  const Icon = style.icon;

  return (
    <div
      role="status"
      className={`flex gap-3 p-4 rounded-xl border ${style.surface} ${style.text} ${className}`}
    >
      <div
        className={`flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center ${style.chip}`}
        aria-hidden="true"
      >
        <Icon size={16} strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        {title && <p className="font-semibold text-sm leading-tight mb-0.5">{title}</p>}
        <div className="text-sm leading-relaxed opacity-90">{children}</div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="flex-shrink-0 h-7 w-7 flex items-center justify-center rounded-lg hover:bg-white/60 transition-colors"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
