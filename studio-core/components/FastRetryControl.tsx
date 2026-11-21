'use client';

import { useTranslations } from 'next-intl';
import {
  FAST_RETRY_MAX_INTERVAL_MINUTES,
  FAST_RETRY_MAX_MINUTES,
  FAST_RETRY_MAX_PER_MINUTE,
  FAST_RETRY_MIN_INTERVAL_MINUTES,
  FAST_RETRY_MIN_MINUTES,
  FAST_RETRY_MIN_PER_MINUTE,
  LONG_TASK_MAX_MINUTES,
  LONG_TASK_MIN_MINUTES,
  LONG_TASK_STEP_MINUTES,
  clampFastRetryInterval,
  clampFastRetryParams,
  clampLongTaskMinutes,
  formatRemaining,
  type FastRetrySettings,
} from '../lib/fast-retry';

export type FastRetryPhase = 'idle' | 'available' | 'active';

/**
 * 队列重试面板（对齐源项目 v8.3 / v8.4 进度页）
 * ─────────────────────────────────────────────────────────────
 * 两个开关分工，和源站一致：
 * - 快速重试：决定「多久打一次」。x 次/分钟 × y 分钟为一轮，两轮之间隔 X 分钟；
 *   一轮到期后自动接力，直到成功、手动停止或长任务预算耗尽。
 * - 长任务模式：决定「总共等多久」。开启后忙轨不再按次数封顶，改为累计等待预算
 *   （默认 60 分钟，5–480，5 分钟一档）；渲染 / 分镜 / 配音 / 拼接时间不计入。
 *
 * 面板同时展示：快速重试剩余时间、接力等待倒计时、长任务已等待 / 剩余预算。
 */
export default function FastRetryControl({
  settings,
  onSettingsChange,
  phase,
  attempts,
  remainingMs,
  chainPending,
  chainRemainingMs,
  round,
  busyWaitedMs,
  longTaskRemainingMs,
  onStart,
  onStop,
  disabled,
}: Readonly<{
  settings: FastRetrySettings;
  onSettingsChange: (next: FastRetrySettings) => void;
  phase: FastRetryPhase;
  attempts: number;
  remainingMs: number;
  chainPending: boolean;
  chainRemainingMs: number;
  round: number;
  busyWaitedMs: number;
  longTaskRemainingMs: number;
  onStart: () => void;
  onStop: () => void;
  disabled: boolean;
}>) {
  const t = useTranslations('demo');

  const updateParams = (
    field: 'perMinute' | 'minutes' | 'intervalMinutes' | 'longTaskMinutes',
    value: string,
  ) => {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return;
    if (field === 'intervalMinutes') {
      onSettingsChange({ ...settings, intervalMinutes: clampFastRetryInterval(raw) });
      return;
    }
    if (field === 'longTaskMinutes') {
      onSettingsChange({ ...settings, longTaskMinutes: clampLongTaskMinutes(raw) });
      return;
    }
    const next = clampFastRetryParams(
      field === 'perMinute' ? raw : settings.perMinute,
      field === 'minutes' ? raw : settings.minutes,
    );
    onSettingsChange({ ...settings, ...next });
  };

  const numberInput =
    'w-20 px-2 py-1.5 text-sm rounded-lg bg-paper border border-rule text-ink focus:border-accent outline-none disabled:opacity-50';

  return (
    <div className="rounded-xl border border-rule bg-paper-2 p-3.5 space-y-4">
      {/* ── 快速重试 ── */}
      <div className="space-y-3">
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
              className={numberInput}
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
              className={numberInput}
            />
          </label>
          <label className="block">
            <span className="block text-xs text-muted mb-1">{t('video.fastRetryInterval')}</span>
            <input
              type="number"
              min={FAST_RETRY_MIN_INTERVAL_MINUTES}
              max={FAST_RETRY_MAX_INTERVAL_MINUTES}
              step={1}
              value={settings.intervalMinutes}
              disabled={disabled}
              onChange={(e) => updateParams('intervalMinutes', e.target.value)}
              className={numberInput}
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
          <div className="flex flex-wrap items-center gap-2">
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

        {chainPending && (
          <p className="text-xs font-mono text-muted">
            {t('errors.fastRetryChainWait', {
              x: formatRemaining(chainRemainingMs),
              round: round + 1,
            })}
          </p>
        )}
      </div>

      {/* ── 长任务模式 ── */}
      <div className="border-t border-rule pt-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent/70" aria-hidden="true" />
              {t('video.longTaskTitle')}
            </p>
            <p className="mt-1 text-xs text-muted leading-relaxed">{t('video.longTaskHint')}</p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={settings.longTask}
            aria-label={t('video.longTaskTitle')}
            disabled={disabled}
            onClick={() => onSettingsChange({ ...settings, longTask: !settings.longTask })}
            className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors ${
              settings.longTask ? 'border-accent bg-accent/25' : 'border-rule bg-paper'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <span
              className={`absolute top-[3px] h-3 w-3 rounded-full transition-all ${
                settings.longTask ? 'bg-accent' : 'bg-muted'
              }`}
              style={{ insetInlineStart: settings.longTask ? '18px' : '3px' }}
            />
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-xs text-muted mb-1">{t('video.longTaskMinutes')}</span>
            <input
              type="number"
              min={LONG_TASK_MIN_MINUTES}
              max={LONG_TASK_MAX_MINUTES}
              step={LONG_TASK_STEP_MINUTES}
              value={settings.longTaskMinutes}
              disabled={disabled || !settings.longTask}
              onChange={(e) => updateParams('longTaskMinutes', e.target.value)}
              className={numberInput}
            />
          </label>

          {settings.longTask && busyWaitedMs > 0 && (
            <span className="text-xs font-mono text-muted pb-2">
              {t('errors.longTaskActive', {
                waited: formatRemaining(busyWaitedMs),
                left: formatRemaining(longTaskRemainingMs),
              })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
