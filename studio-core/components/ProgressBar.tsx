'use client';

import { useTranslations } from 'next-intl';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ProgressBar({
  progress,
  estimatedMinutes,
  pollCount,
  elapsedSeconds,
  lastPollStatus,
}: Readonly<{
  progress: number;
  estimatedMinutes: number;
  pollCount: number;
  elapsedSeconds: number;
  lastPollStatus: string;
}>) {
  const t = useTranslations('demo');
  const pct = Math.min(Math.max(progress, 0), 100);

  return (
    <div className="space-y-4">
      {/* 主进度条 */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-ink-2 flex items-center gap-2">
            <svg className="animate-spin h-3.5 w-3.5 text-accent" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            {t('video.generating')}
          </span>
          <span className="text-muted font-mono tabular-nums">{pct}%</span>
        </div>

        <div className="h-2 bg-paper rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000 ease-out bg-accent"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* 轮询详情 */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-paper-2 rounded-lg p-3 border border-rule">
          <div className="text-muted mb-0.5">{t('video.elapsed')}</div>
          <div className="text-ink font-mono">{formatTime(elapsedSeconds)}</div>
        </div>
        <div className="bg-paper-2 rounded-lg p-3 border border-rule">
          <div className="text-muted mb-0.5">{t('video.pollCount')}</div>
          <div className="text-ink font-mono">{pollCount}</div>
        </div>
        <div className="col-span-2 bg-paper-2 rounded-lg p-3 border border-rule">
          <div className="text-muted mb-0.5">{t('video.lastPoll')}</div>
          <div className="text-accent font-mono text-xs break-all">{lastPollStatus || '--'}</div>
        </div>
      </div>
    </div>
  );
}
