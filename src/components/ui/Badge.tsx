import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'paused';
  className?: string;
}

/**
 * Badge — Refined pill
 * Softer tone-on-tone palette, lowercase-friendly letterforms, pill shape.
 */
export function Badge({ children, variant = 'neutral', className = '' }: BadgeProps) {
  const variants = {
    success: 'bg-green-100 text-green-800 ring-green-200',
    warning: 'bg-amber-100 text-amber-800 ring-amber-200',
    danger: 'bg-red-100 text-red-800 ring-red-200',
    paused: 'bg-blue-100 text-blue-700 ring-blue-200',
    info: 'bg-blue-100 text-blue-700 ring-blue-200',
    neutral: 'bg-gray-100 text-gray-700 ring-gray-200',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
