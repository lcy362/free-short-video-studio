'use client';

import { useTranslations } from 'next-intl';
import { trackRetentionEvent } from '../lib/analytics';

interface Props {
  readonly url: string;
  readonly onReset: () => void;
}

export default function VideoPreview({ url, onReset }: Props) {
  const t = useTranslations('studio');

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `agnes-studio-${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="space-y-4">
      <div className="card-surface rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2 h-2 bg-success rounded-full" />
          <h3 className="text-base font-semibold text-ink">{t('completedTitle')}</h3>
        </div>

        <video
          src={url}
          controls
          autoPlay
          loop
          className="w-full rounded-xl bg-paper"
          preload="auto"
        />

        <p className="mt-3 text-xs text-muted leading-relaxed">
          {t('library.createAnotherHint')}
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={handleDownload}
            className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {t('download')}
          </button>
          <button
            onClick={() => {
              trackRetentionEvent('create_another_click', { place: 'preview', tab: 'creative' });
              onReset();
            }}
            className="px-4 py-2.5 text-sm font-medium bg-accent/15 hover:bg-accent/25 border border-accent/30 rounded-lg text-accent transition"
          >
            {t('createAnother')}
          </button>
        </div>
      </div>

      <div className="bg-accent/5 border border-accent/15 rounded-xl p-4">
        <p className="text-xs text-accent/80 leading-relaxed">
          {t('completedNote')}
        </p>
      </div>
    </div>
  );
}
