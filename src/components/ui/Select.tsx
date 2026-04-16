import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
  fullWidth?: boolean;
}

export function Select({
  label,
  error,
  helperText,
  options,
  placeholder,
  fullWidth = false,
  className = '',
  id,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id || generatedId;

  const baseStyles =
    'h-10 pl-3.5 pr-10 text-sm border rounded-lg transition-all duration-150 outline-none disabled:opacity-40 disabled:cursor-not-allowed appearance-none bg-white';

  const stateStyles = error
    ? 'border-red-300 text-gray-900 focus:border-red-500 focus:ring-4 focus:ring-red-500/10'
    : 'border-gray-200 text-gray-900 hover:border-gray-300 focus:border-gray-900 focus:ring-4 focus:ring-gray-900/10';

  const widthStyle = fullWidth ? 'w-full' : '';

  return (
    <div className={`flex flex-col gap-1.5 ${fullWidth ? 'w-full' : ''}`}>
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-gray-900">
          {label}
          {props.required && <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>}
        </label>
      )}

      <div className="relative">
        <select
          id={selectId}
          className={`${baseStyles} ${stateStyles} ${widthStyle} ${className}`}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>

        <ChevronDown
          size={16}
          strokeWidth={1.75}
          className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500"
          aria-hidden="true"
        />
      </div>

      {error && (
        <p className="text-xs text-red-600 font-medium" role="alert">
          {error}
        </p>
      )}

      {helperText && !error && <p className="text-xs text-gray-500">{helperText}</p>}
    </div>
  );
}
