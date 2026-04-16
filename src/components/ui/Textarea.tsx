import React, { useId } from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
  resize?: 'none' | 'both' | 'horizontal' | 'vertical';
}

export function Textarea({
  label,
  error,
  helperText,
  fullWidth = false,
  resize = 'vertical',
  className = '',
  id,
  ...props
}: TextareaProps) {
  const generatedId = useId();
  const textareaId = id || generatedId;

  const baseStyles =
    'px-3.5 py-2.5 text-sm leading-relaxed border rounded-lg transition-all duration-150 outline-none disabled:opacity-40 disabled:cursor-not-allowed bg-white placeholder:text-gray-400';

  const stateStyles = error
    ? 'border-red-300 text-gray-900 focus:border-red-500 focus:ring-4 focus:ring-red-500/10'
    : 'border-gray-200 text-gray-900 hover:border-gray-300 focus:border-gray-900 focus:ring-4 focus:ring-gray-900/10';

  const resizeStyles = {
    none: 'resize-none',
    both: 'resize',
    horizontal: 'resize-x',
    vertical: 'resize-y',
  };

  const widthStyle = fullWidth ? 'w-full' : '';

  return (
    <div className={`flex flex-col gap-1.5 ${fullWidth ? 'w-full' : ''}`}>
      {label && (
        <label htmlFor={textareaId} className="text-sm font-medium text-gray-900">
          {label}
          {props.required && <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>}
        </label>
      )}

      <textarea
        id={textareaId}
        className={`${baseStyles} ${stateStyles} ${resizeStyles[resize]} ${widthStyle} ${className}`}
        {...props}
      />

      {error && (
        <p className="text-xs text-red-600 font-medium" role="alert">
          {error}
        </p>
      )}

      {helperText && !error && <p className="text-xs text-gray-500">{helperText}</p>}
    </div>
  );
}
