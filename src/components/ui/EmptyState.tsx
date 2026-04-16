import React from 'react';
import { Search, AlertCircle, CheckCircle, Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  variant?: 'default' | 'search' | 'error' | 'success';
  className?: string;
}

/**
 * EmptyState — Refined, editorial
 * Uses serif display type for the title and a subtle ring around the icon.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  variant = 'default',
  className = '',
}: EmptyStateProps) {
  const variantConfig = {
    default: { Icon: Inbox, tint: 'bg-gray-100 text-gray-500' },
    search: { Icon: Search, tint: 'bg-gray-100 text-gray-500' },
    error: { Icon: AlertCircle, tint: 'bg-red-100 text-red-600' },
    success: { Icon: CheckCircle, tint: 'bg-green-100 text-green-700' },
  } as const;

  const { Icon, tint } = variantConfig[variant];

  return (
    <div
      className={`flex flex-col items-center justify-center p-10 text-center ${className}`}
    >
      <div
        className={`mb-5 w-14 h-14 rounded-2xl flex items-center justify-center ring-1 ring-inset ring-gray-200 ${tint}`}
      >
        {icon ?? <Icon size={24} />}
      </div>
      <h3 className="font-display text-2xl text-gray-900 tracking-tight mb-2 text-balance">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-gray-600 mb-5 max-w-md leading-relaxed text-pretty">
          {description}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
