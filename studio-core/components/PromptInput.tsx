'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

export default function PromptInput({
  value,
  onChange,
  disabled,
  placeholderKey = 'image.promptPlaceholder',
  suggestions,
}: Readonly<{
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholderKey?: string;
  suggestions?: readonly string[];
}>) {
  const t = useTranslations('demo');

  // Pick a random suggestion on mount
  const randomSuggestion = useMemo(() => {
    if (!suggestions || suggestions.length === 0) return null;
    return suggestions[Math.floor(Math.random() * suggestions.length)];
  }, [suggestions]);

  return (
    <div className="space-y-2">
      <label htmlFor="demo-prompt" className="block text-sm font-medium text-ink-2">
        {t('promptLabel')}
      </label>
      <textarea
        id="demo-prompt"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={t(placeholderKey)}
        rows={3}
        maxLength={2000}
        className="w-full bg-paper border border-rule rounded-xl px-4 py-3 text-sm text-ink placeholder-muted focus:outline-none focus:border-accent/70 focus:ring-1 focus:ring-accent/30 transition resize-none disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label={t('promptLabel')}
      />
      <div className="flex justify-between items-start text-xs text-muted">
        <div>
          {randomSuggestion && !value && !disabled && (
            <button
              onClick={() => onChange(randomSuggestion)}
              className="text-accent/80 hover:text-accent transition-colors text-start"
              title={randomSuggestion}
            >
              <span className="text-muted me-1">✦</span>
              <span className="line-clamp-1">{randomSuggestion}</span>
            </button>
          )}
        </div>
        <span className="shrink-0 ms-2">{value.length}/2000</span>
      </div>
    </div>
  );
}
