import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  children?: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
}

/**
 * Button — Refined, high-end
 *
 * Uses ink-black primary, subtle shadows, and gently rounded corners.
 * All variants share a cohesive motion language.
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  className = '',
  ...props
}: ButtonProps) {
  const baseStyles =
    'inline-flex items-center justify-center font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-900/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none rounded-lg tracking-tight select-none active:translate-y-[0.5px]';

  const variants = {
    primary:
      'bg-gray-900 text-white hover:bg-gray-800 active:bg-black shadow-sm hover:shadow-md',
    secondary:
      'bg-white text-gray-900 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 shadow-xs',
    danger:
      'bg-red-700 text-white hover:bg-red-800 active:bg-red-900 shadow-sm hover:shadow-md',
    warning:
      'bg-amber-700 text-white hover:bg-amber-800 active:bg-amber-900 shadow-sm hover:shadow-md',
    ghost:
      'bg-transparent text-gray-700 hover:bg-gray-100 hover:text-gray-900',
    outline:
      'bg-transparent text-gray-900 border border-gray-900 hover:bg-gray-900 hover:text-white',
  };

  const sizes = {
    sm: 'h-8 px-3 text-xs gap-1.5',
    md: 'h-10 px-4 text-sm gap-2',
    lg: 'h-12 px-6 text-base gap-2.5',
  };

  const widthStyle = fullWidth ? 'w-full' : '';

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${widthStyle} ${className}`}
      {...props}
    >
      {isLoading && <Loader2 className="animate-spin" size={size === 'sm' ? 14 : 16} />}
      {!isLoading && leftIcon}
      {children}
      {!isLoading && rightIcon}
    </button>
  );
}
