import React from 'react';
import { FileText, File, Calendar, CheckCircle2, Clock } from 'lucide-react';

interface StatusBadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'paused' | 'draft' | 'published' | 'scheduled';
  size?: 'sm' | 'md';
  className?: string;
  showIcon?: boolean;
  context?: string;
}

/**
 * StatusBadge — Refined status pill with dot indicator.
 * Softer tone-on-tone palette with an elegant leading dot for quick scanning.
 */
export function StatusBadge({
  children,
  variant = 'neutral',
  size = 'md',
  className = '',
  showIcon = true,
  context
}: StatusBadgeProps) {
  const variants = {
    success: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      ring: 'ring-green-200',
      dot: 'bg-green-600',
      icon: CheckCircle2,
    },
    warning: {
      bg: 'bg-amber-100',
      text: 'text-amber-800',
      ring: 'ring-amber-200',
      dot: 'bg-amber-600',
      icon: Clock,
    },
    danger: {
      bg: 'bg-red-100',
      text: 'text-red-800',
      ring: 'ring-red-200',
      dot: 'bg-red-600',
      icon: Clock,
    },
    info: {
      bg: 'bg-blue-100',
      text: 'text-blue-700',
      ring: 'ring-blue-200',
      dot: 'bg-blue-600',
      icon: Clock,
    },
    neutral: {
      bg: 'bg-gray-100',
      text: 'text-gray-700',
      ring: 'ring-gray-200',
      dot: 'bg-gray-500',
      icon: Clock,
    },
    paused: {
      bg: 'bg-blue-100',
      text: 'text-blue-700',
      ring: 'ring-blue-200',
      dot: 'bg-blue-600',
      icon: Clock,
    },
    draft: {
      bg: 'bg-gray-100',
      text: 'text-gray-700',
      ring: 'ring-gray-200',
      dot: 'bg-gray-500',
      icon: FileText,
    },
    published: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      ring: 'ring-green-200',
      dot: 'bg-green-600',
      icon: File,
    },
    scheduled: {
      bg: 'bg-blue-100',
      text: 'text-blue-700',
      ring: 'ring-blue-200',
      dot: 'bg-blue-600',
      icon: Calendar,
    },
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-[11px] gap-1.5',
    md: 'px-2.5 py-1 text-xs gap-1.5',
  };

  const style = variants[variant];

  return (
    <span
      className={`inline-flex items-center ring-1 ring-inset rounded-full font-medium ${style.bg} ${style.text} ${style.ring} ${sizes[size]} ${className}`}
      role="status"
      aria-label={`${children}${context ? ` - ${context}` : ''}`}
    >
      {showIcon && (
        <span
          className={`inline-block ${size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2'} rounded-full ${style.dot}`}
          aria-hidden="true"
        />
      )}
      <span className="truncate">{children}</span>
      {context && (
        <span className="hidden sm:inline opacity-70">
          · {context}
        </span>
      )}
    </span>
  );
}
