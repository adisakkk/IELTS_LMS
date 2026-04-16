import { AlertTriangle } from 'lucide-react';

interface ErrorSurfaceProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function ErrorSurface({
  title,
  description,
  actionLabel,
  onAction,
}: ErrorSurfaceProps) {
  return (
    <div className="flex items-center justify-center w-full h-screen bg-gray-50 px-6">
      <div className="max-w-md w-full text-center">
        <div
          className="mx-auto mb-5 h-12 w-12 rounded-xl bg-amber-100 text-amber-700 ring-1 ring-amber-200 flex items-center justify-center"
          aria-hidden="true"
        >
          <AlertTriangle size={20} strokeWidth={1.75} />
        </div>
        <h2 className="font-display text-3xl text-gray-900 leading-tight text-balance">{title}</h2>
        <p className="mt-3 text-sm text-gray-600 leading-relaxed text-pretty">{description}</p>
        {actionLabel && onAction ? (
          <button
            onClick={onAction}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-gray-900/20"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
