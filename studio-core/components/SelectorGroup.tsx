'use client';

import { useTranslations } from 'next-intl';

interface Option<T extends string = string> {
  value: T;
  labelKey?: string;
  label?: string;
}

export default function SelectorGroup<T extends string = string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: Readonly<{
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (v: T) => void;
  disabled: boolean;
}>) {
  const t = useTranslations('demo');

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-ink-2">{label}</span>
      <div className="flex gap-2 flex-wrap">
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            onClick={() => onChange(opt.value)}
            disabled={disabled}
            className={`flex-1 min-w-fit px-3 py-2 text-sm rounded-lg border transition-all duration-200 ${
              value === opt.value
                ? 'bg-accent border-accent text-accent-ink shadow-sm'
                : 'bg-paper border-rule text-ink-2 hover:text-ink hover:border-rule/80'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            aria-pressed={value === opt.value}
          >
            {opt.label ?? t(opt.labelKey ?? '')}
          </button>
        ))}
      </div>
    </div>
  );
}
