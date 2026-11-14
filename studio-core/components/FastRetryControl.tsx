'use client';

import { useTranslations } from 'next-intl';
import {
  FAST_RETRY_MAX_MINUTES,
  FAST_RETRY_MAX_PER_MINUTE,
  FAST_RETRY_MIN_MINUTES,
  FAST_RETRY_MIN_PER_MINUTE,
  clampFastRetryParams,
  formatRemaining,
  type FastRetrySettings,
} from '../lib/fast-retry';

export type FastRetryPhase = 'idle' | 'available' | 'active';

/**
 * 快速重试面板（对齐源项目设置页开关 + 任务页开关）
 * ─────────────────────────────────────────────────────────────
 * - 开关（auto）+ x / y：持久化到 localStorage，之后凡是连续 2 次忙信号都自动连打；
 * - 运行中显示「已发 N 次 · 剩余 m:ss」，可随时停止（本轮不再自动拉起）；
 * - 关闭状态下到了条件（available）显示一次性的「开启快速重试」按钮。
 */
export default function FastRetryControl({
  settings,
  onSettingsChange,
  phase,
  attempts,
  remainingMs,
  onStart,
  onStop,
  disabled,
}: Readonly<{
  settings: FastRetrySettings;
  onSettingsChange: (next: FastRetrySettings) => void;
  phase: FastRetryPhase;
  attempts: number;
  remainingMs: number;
  onStart: () => void;
  onStop: () => void;
  disabled: boolean;
}>) {
  const t = useTranslations('demo');

  const updateParams = (field: 'perMinute' | 'minutes', value: string) => {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return;
    const next = clampFastRetryParams(
      field === 'perMinute' ? raw : settings.perMinute,
      field === 'minutes' ? raw : settings.minutes,
    );
    onSettingsChange({ ...settings, ...next });
  };

  return (
    <div className="rounded-xl border border-rule bg-paper-2 p-3.5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />
            {t('video.fastRetryTitle')}
          </p>
          <p className="mt-1 text-xs text-muted leading-relaxed">{t('video.fastRetryHint')}</p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={settings.auto}
          aria-label={t('video.fastRetryTitle')}
          disabled={disabled}
          onClick={() => onSettingsChange({ ...settings, auto: !settings.auto })}
          className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors ${
            settings.auto ? 'border-accent bg-accent/25' : 'border-rule bg-paper'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <span
            className={`absolute top-[3px] h-3 w-3 rounded-full transition-all ${
              settings.auto ? 'bg-accent' : 'bg-muted'
            }`}
            style={{ insetInlineStart: settings.auto ? '18px' : '3px' }}
          />
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="block text-xs text-muted mb-1">{t('video.fastRetryPerMinute')}</span>
          <input
            type="number"
            min={FAST_RETRY_MIN_PER_MINUTE}
            max={FAST_RETRY_MAX_PER_MINUTE}
            step={1}
            value={settings.perMinute}
            disabled={disabled || phase === 'active'}
            onChange={(e) => updateParams('perMinute', e.target.value)}
            className="w-20 px-2 py-1.5 text-sm rounded-lg bg-paper border border-rule text-ink focus:border-accent outline-none disabled:opacity-50"
          />
        </label>
        <label className="block">
          <span className="block text-xs text-muted mb-1">{t('video.fastRetryMinutes')}</span>
          <input
            type="number"
            min={FAST_RETRY_MIN_MINUTES}
            max={FAST_RETRY_MAX_MINUTES}
            step={1}
            value={settings.minutes}
            disabled={disabled || phase === 'active'}
            onChange={(e) => updateParams('minutes', e.target.value)}
            className="w-20 px-2 py-1.5 text-sm rounded-lg bg-paper border border-rule text-ink focus:border-accent outline-none disabled:opacity-50"
          />
        </label>

        {phase === 'available' && (
          <button
            type="button"
            onClick={onStart}
            disabled={disabled}
            className="px-3 py-1.5 text-sm rounded-lg bg-accent text-accent-ink hover:opacity-90 transition disabled:opacity-40"
          >
            {t('video.fastRetryStart')}
          </button>
        )}
      </div>

      {phase === 'active' && (
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <span className="text-xs font-mono text-accent">
            {t('errors.fastRetryActive', {
              x: formatRemaining(remainingMs),
              n: attempts,
            })}
          </span>
          <button
            type="button"
            onClick={onStop}
            disabled={disabled}
            className="px-2.5 py-1 text-xs rounded-lg border border-rule text-ink-2 hover:text-ink hover:border-rule/80 transition disabled:opacity-40"
          >
            {t('video.fastRetryStop')}
          </button>
        </div>
      )}
    </div>
  );
}
