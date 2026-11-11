'use client';

import { useTranslations } from 'next-intl';
import type { StudioPhase } from '../types';

interface Props {
  readonly phase: StudioPhase;
  readonly progress: number;
  readonly loaded: boolean;
}

export default function FFmpegLoader({ phase, progress, loaded }: Props) {
  const t = useTranslations('studio');

  const isLoading = phase === 'ffmpeg_loading';
  const isConcatenating = phase === 'concatenating';

  return (
    <div className="card-surface rounded-2xl p-8 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 mb-4">
        {isLoading && !loaded ? (
          <svg className="animate-spin w-10 h-10 text-accent" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="w-10 h-10 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </div>

      <h3 className="text-base font-medium text-ink mb-2">
        {isLoading ? t('ffmpegLoading') : t('concatenating')}
      </h3>

      <p className="text-sm text-muted mb-4 max-w-sm mx-auto">
        {isLoading ? t('ffmpegLoadingHint') : t('concatenatingHint')}
      </p>

      {(isLoading || isConcatenating) && (
        <div className="max-w-xs mx-auto">
          <div className="h-1.5 bg-paper rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-300"
              style={{ width: `${Math.min(Math.round(progress * 100), 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            {Math.round(progress * 100)}%
          </p>
        </div>
      )}
    </div>
  );
}
