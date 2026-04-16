import React, { useEffect, useId } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  id?: string | undefined;
  variant?: ToastVariant | undefined;
  title?: string | undefined;
  message: string;
  onClose: () => void;
  duration?: number | undefined;
  showCloseButton?: boolean | undefined;
}

const variantIcons = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const chipStyles = {
  success: 'bg-green-100 text-green-700 ring-1 ring-green-200',
  error: 'bg-red-100 text-red-700 ring-1 ring-red-200',
  warning: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
  info: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',
};

export function Toast({
  id,
  variant = 'info',
  title,
  message,
  onClose,
  duration = 5000,
  showCloseButton = true,
}: ToastProps) {
  const toastId = useId();
  const uniqueId = id || toastId;

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [duration, onClose]);

  const Icon = variantIcons[variant];

  return (
    <motion.div
      id={uniqueId}
      role="alert"
      aria-live="polite"
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ type: 'spring', damping: 26, stiffness: 320 }}
      className="flex items-start gap-3 p-4 rounded-2xl border border-gray-100 bg-white max-w-md"
      style={{ boxShadow: '0 12px 24px -8px rgba(10,10,12,0.12), 0 0 0 1px rgba(10,10,12,0.04)' }}
    >
      <div
        className={`flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center ${chipStyles[variant]}`}
        aria-hidden="true"
      >
        <Icon size={16} strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        {title && <p className="font-semibold text-sm text-gray-900 leading-tight mb-0.5">{title}</p>}
        <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
      </div>
      {showCloseButton && (
        <button
          onClick={onClose}
          className="flex-shrink-0 h-7 w-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          aria-label="Close notification"
        >
          <X size={14} />
        </button>
      )}
    </motion.div>
  );
}

interface ToastContainerProps {
  children: React.ReactNode;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
}

const positionStyles = {
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'top-center': 'top-4 left-1/2 -translate-x-1/2',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
};

export function ToastContainer({ children, position = 'top-right' }: ToastContainerProps) {
  return (
    <div className={`fixed z-50 flex flex-col gap-2 pointer-events-none ${positionStyles[position]}`}>
      {React.Children.map(children, (child) => (
        <div className="pointer-events-auto">{child}</div>
      ))}
    </div>
  );
}
