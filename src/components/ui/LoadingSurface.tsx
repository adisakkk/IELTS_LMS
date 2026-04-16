interface LoadingSurfaceProps {
  label: string;
  sublabel?: string;
}

export function LoadingSurface({ label, sublabel }: LoadingSurfaceProps) {
  return (
    <div
      className="flex items-center justify-center w-full h-screen bg-gray-50"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="text-center max-w-sm px-6">
        <div className="mx-auto mb-6 relative h-12 w-12">
          <span className="absolute inset-0 rounded-full border-2 border-gray-200" aria-hidden="true" />
          <span
            className="absolute inset-0 rounded-full border-2 border-transparent border-t-gray-900 animate-spin"
            aria-hidden="true"
          />
        </div>
        <p className="font-display text-2xl text-gray-900 leading-tight">{label}</p>
        {sublabel && <p className="mt-2 text-sm text-gray-500 leading-relaxed">{sublabel}</p>}
      </div>
    </div>
  );
}
