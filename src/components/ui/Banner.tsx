import React, { useId } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

export type BannerVariant = 'success' | 'error' | 'warning' | 'info';

interface BannerProps {
  id?: string;
  variant?: BannerVariant;
  title?: string;
  message: string;
  onDismiss?: () => void;
  showIcon?: boolean;
  className?: string;
}

const variantIcons = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const variantStyles = {
  success: 'bg-green-100/70 border-green-200 text-green-900',
  error: 'bg-red-100/70 border-red-200 text-red-900',
  warning: 'bg-amber-100/70 border-amber-200 text-amber-900',
  info: 'bg-blue-100/70 border-blue-200 text-blue-900',
};

const iconTints = {
  success: 'text-green-700',
  error: 'text-red-700',
  warning: 'text-amber-700',
  info: 'text-blue-700',
};

export function Banner({
  id,
  variant = 'info',
  title,
  message,
  onDismiss,
  showIcon = true,
  className = '',
}: BannerProps) {
  const bannerId = useId();
  const uniqueId = id || bannerId;
  const Icon = variantIcons[variant];

  return (
    <div
      id={uniqueId}
      role="alert"
      aria-live="polite"
      className={`flex items-start gap-3 px-4 py-3 border rounded-xl ${variantStyles[variant]} ${className}`}
    >
      {showIcon && (
        <Icon
          size={18}
          strokeWidth={2}
          className={`flex-shrink-0 mt-0.5 ${iconTints[variant]}`}
          aria-hidden="true"
        />
      )}
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold text-sm leading-tight mb-0.5">{title}</p>}
        <p className="text-sm leading-relaxed opacity-90">{message}</p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="flex-shrink-0 h-7 w-7 flex items-center justify-center rounded-lg hover:bg-white/60 transition-colors"
          aria-label="Dismiss notification"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
