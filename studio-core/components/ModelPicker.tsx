'use client';

import { useTranslations } from 'next-intl';
import {
  VIDEO_MODELS,
  formatRatioLabel,
  getModelCap,
  type VideoModelId,
} from '../lib/demo-types';

export default function ModelPicker({
  value,
  onChange,
  disabled,
}: {
  value: VideoModelId;
  onChange: (v: VideoModelId) => void;
  disabled: boolean;
}) {
  const t = useTranslations('demo');
  const selected = getModelCap(value);

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-ink-2">{t('video.model')}</span>
      <div className="flex gap-2">
        {VIDEO_MODELS.map((m) => (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            disabled={disabled}
            className={`flex-1 px-3 py-2.5 text-sm rounded-lg border transition-all duration-200 ${
              value === m.id
                ? 'bg-accent border-accent text-accent-ink shadow-sm'
                : 'bg-paper border-rule text-ink-2 hover:text-ink hover:border-rule/80'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            aria-pressed={value === m.id}
          >
            {t(m.labelKey)}
          </button>
        ))}
      </div>

      {/* 当前模型能力说明卡（参考源项目：选模型阶段差异说明） */}
      <div className="rounded-xl bg-paper-2 border border-rule p-3.5 space-y-1.5 text-xs">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-ink">{t(selected.labelKey)}</p>
          <span className="text-xs font-medium text-success bg-success/10 border border-success/20 rounded-full px-2 py-0.5">
            {t('video.freeLimited')}
          </span>
        </div>
        <p className="text-muted leading-relaxed">{t(selected.descKey)}</p>
        {/* W9：把 demo ↔ 自托管的能力表差异显式化，回答「本地为什么没有这个档位」 */}
        <p className="text-muted/80">
          {t('video.selfHostMinVersion', { version: selected.minVersion })}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
          <span className="text-muted">
            {t('video.modelModesLabel')}:{' '}
            <span className="text-ink-2">{selected.modes.map((m) => t(m.labelKey)).join(' / ')}</span>
          </span>
          <span className="text-muted">
            {t('video.modelDurationsLabel')}:{' '}
            <span className="text-ink-2">{selected.durations.map((d) => `${d}s`).join(' / ')}</span>
          </span>
          <span className="text-muted">
            {t('video.modelRatiosLabel')}:{' '}
            <span className="text-ink-2">
              {selected.ratios.map((r) => formatRatioLabel(selected, r, (key) => t(key))).join(' / ')}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
