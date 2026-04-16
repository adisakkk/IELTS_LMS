import React, { useId } from 'react';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

/**
 * Input — Refined form control
 * Subtle border, ink-colored focus ring, warm placeholder.
 */
export function Input({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  fullWidth = false,
  className = '',
  id,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id || generatedId;

  const baseStyles =
    'h-10 px-3 text-sm bg-white border rounded-lg transition-all outline-none placeholder:text-gray-400 disabled:opacity-40 disabled:cursor-not-allowed';

  const stateStyles = error
    ? 'border-red-500 text-gray-900 focus:border-red-600 focus:ring-2 focus:ring-red-500/10'
    : 'border-gray-200 text-gray-900 hover:border-gray-300 focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10';

  const widthStyle = fullWidth ? 'w-full' : '';
  const iconPaddingLeft = leftIcon ? 'pl-10' : '';
  const iconPaddingRight = rightIcon ? 'pr-10' : '';

  return (
    <div className={`flex flex-col gap-1.5 ${fullWidth ? 'w-full' : ''}`}>
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-gray-900">
          {label}
          {props.required && <span className="text-red-600 ml-0.5">*</span>}
        </label>
      )}

      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            {leftIcon}
          </div>
        )}

        <input
          id={inputId}
          className={`${baseStyles} ${stateStyles} ${widthStyle} ${iconPaddingLeft} ${iconPaddingRight} ${className}`}
          {...props}
        />

        {rightIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            {rightIcon}
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600 font-medium" role="alert">
          {error}
        </p>
      )}

      {helperText && !error && (
        <p className="text-xs text-gray-500">
          {helperText}
        </p>
      )}
    </div>
  );
}
