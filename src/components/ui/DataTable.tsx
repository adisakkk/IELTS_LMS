import React, { useId } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (value: unknown, row: T, index: number) => React.ReactNode;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T, index: number) => void;
  onRowAction?: (row: T, index: number) => React.ReactNode;
  emptyMessage?: string;
  className?: string;
  isLoading?: boolean;
  ariaLabel?: string;
}

export function DataTable<T>({
  columns,
  data,
  onRowClick,
  onRowAction,
  emptyMessage = 'No data available',
  isLoading = false,
  ariaLabel = 'Data table',
  className = '',
}: DataTableProps<T>) {
  const tableId = useId();

  if (isLoading) {
    return (
      <div
        id={tableId}
        className="flex items-center justify-center p-10 bg-white border border-gray-100 rounded-2xl"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span className="inline-block h-4 w-4 rounded-full border-2 border-gray-300 border-t-gray-900 animate-spin" aria-hidden="true" />
          Loading…
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div
        id={tableId}
        className="flex items-center justify-center p-10 bg-white border border-gray-100 rounded-2xl"
        role="status"
        aria-live="polite"
      >
        <div className="text-gray-500 text-sm">{emptyMessage}</div>
      </div>
    );
  }

  const handleKeyDown = (e: React.KeyboardEvent, row: T, index: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRowClick?.(row, index);
    }
  };

  const alignClass = (align: Column<T>['align'] | undefined) =>
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  return (
    <div className={`overflow-x-auto bg-white border border-gray-100 rounded-2xl ${className}`}>
      <table id={tableId} className="w-full" aria-label={ariaLabel}>
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/60">
            {columns.map((column) => (
              <th
                key={column.key}
                className={`px-4 py-3 text-[11px] font-medium tracking-wide text-gray-500 ${alignClass(column.align)}`}
                style={{ width: column.width }}
                scope="col"
              >
                {column.header}
              </th>
            ))}
            {onRowAction && (
              <th
                className="px-4 py-3 text-[11px] font-medium tracking-wide text-gray-500 w-16 text-right"
                scope="col"
              >
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr
              key={index}
              className={`border-b border-gray-50 last:border-0 transition-colors ${
                onRowClick ? 'hover:bg-gray-50 cursor-pointer focus:bg-gray-50 focus:outline-none' : ''
              }`}
              onClick={onRowClick ? () => onRowClick(row, index) : undefined}
              onKeyDown={onRowClick ? (e) => handleKeyDown(e, row, index) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? 'button' : undefined}
              aria-label={onRowClick ? `Row ${index + 1}` : undefined}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-4 py-3.5 text-sm text-gray-900 ${alignClass(column.align)}`}
                >
                  {column.render
                    ? column.render((row as Record<string, unknown>)[column.key], row, index)
                    : ((row as Record<string, unknown>)[column.key] as React.ReactNode)}
                </td>
              ))}
              {onRowAction && (
                <td className="px-4 py-3.5 text-sm text-gray-900 text-right">
                  {onRowAction(row, index)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
