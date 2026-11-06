'use client';

export default function GenerateButton({
  onClick,
  loading,
  disabled,
  label,
  loadingLabel,
}: {
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
  label: string;
  loadingLabel: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="btn-primary w-full px-6 py-3.5 text-base disabled:opacity-40"
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          {loadingLabel}
        </span>
      ) : (
        label
      )}
    </button>
  );
}
