'use client';

import { useTranslations } from 'next-intl';
import {
  SCENE_COUNT_OPTIONS,
  STUDIO_RATIO_OPTIONS,
  STUDIO_DURATION_OPTIONS,
  STYLE_OPTIONS,
} from '../types';
import type { StudioRatio, StudioDuration, StudioStyle } from '../types';
import {
  STUDIO_VIDEO_MODELS,
  getStudioModelCap,
  type StudioVideoModelId,
} from '../lib/video-models';

interface Props {
  idea: string;
  setIdea: (v: string) => void;
  sceneCount: number;
  setSceneCount: (v: number) => void;
  ratio: StudioRatio;
  setRatio: (v: StudioRatio) => void;
  duration: StudioDuration;
  setDuration: (v: StudioDuration) => void;
  style: StudioStyle;
  setStyle: (v: StudioStyle) => void;
  enableWatermark: boolean;
  setEnableWatermark: (v: boolean) => void;
  model: StudioVideoModelId;
  setModel: (v: StudioVideoModelId) => void;
  loading: boolean;
  onGenerate: () => void;
}

export default function IdeaInput({
  idea,
  setIdea,
  sceneCount,
  setSceneCount,
  ratio,
  setRatio,
  duration,
  setDuration,
  style,
  setStyle,
  enableWatermark,
  setEnableWatermark,
  model,
  setModel,
  loading,
  onGenerate,
}: Props) {
  const t = useTranslations('studio');
  const selectedModel = getStudioModelCap(model);

  return (
    <div className="card-surface rounded-2xl p-6 sm:p-8 space-y-5">
      {/* 创意输入 */}
      <div>
        <label className="block text-sm font-medium text-ink-2 mb-2">
          {t('ideaLabel')}
        </label>
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          disabled={loading}
          placeholder={t('ideaPlaceholder')}
          rows={4}
          className="w-full bg-paper border border-rule rounded-lg px-4 py-3 text-sm text-ink placeholder-muted focus:outline-none focus:border-accent/70 focus:ring-1 focus:ring-accent/30 transition resize-none"
        />
        <p className="mt-1.5 text-xs text-muted">{t('ideaHint')}</p>
      </div>

      {/* 视频模型（v6.2 迁移：v2.0 / 2.5-flash 双协议） */}
      <div>
        <label className="block text-sm font-medium text-ink-2 mb-2">
          {t('modelLabel')}
        </label>
        <div className="flex gap-2">
          {STUDIO_VIDEO_MODELS.map((m) => (
            <button
              key={m.id}
              onClick={() => setModel(m.id)}
              disabled={loading}
              className={`flex-1 py-2 text-sm rounded-lg border transition ${
                model === m.id
                  ? 'bg-accent border-accent text-accent-ink shadow-sm'
                  : 'bg-paper border-rule text-muted hover:text-ink-2 hover:bg-paper-3'
              }`}
              aria-pressed={model === m.id}
            >
              {t(m.labelKey)}
              <span
                className={`ms-1.5 text-xs ${
                  model === m.id ? 'text-accent-ink/80' : 'text-muted/70'
                }`}
              >
                {t(m.badgeKey)}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted leading-relaxed">
          {t(selectedModel.descKey)}
        </p>
      </div>

      {/* 场景数 + 画面比例 + 场景时长 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-ink-2 mb-2">
            {t('sceneCountLabel')}
          </label>
          <div className="flex gap-2">
            {SCENE_COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => setSceneCount(n)}
                disabled={loading}
                className={`flex-1 py-2 text-sm rounded-lg border transition ${
                  sceneCount === n
                    ? 'bg-accent border-accent text-accent-ink shadow-sm'
                    : 'bg-paper border-rule text-muted hover:text-ink-2 hover:bg-paper-3'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-2 mb-2">
            {t('ratioLabel')}
          </label>
          <div className="flex gap-2">
            {STUDIO_RATIO_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRatio(opt.value)}
                disabled={loading}
                className={`flex-1 py-2 text-sm rounded-lg border transition ${
                  ratio === opt.value
                    ? 'bg-accent border-accent text-accent-ink shadow-sm'
                    : 'bg-paper border-rule text-muted hover:text-ink-2 hover:bg-paper-3'
                }`}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 场景时长 */}
      <div>
        <label className="block text-sm font-medium text-ink-2 mb-2">
          {t('durationLabel')}
        </label>
        <div className="flex gap-2">
          {STUDIO_DURATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDuration(opt.value)}
              disabled={loading}
              className={`flex-1 py-2 text-sm rounded-lg border transition ${
                duration === opt.value
                  ? 'bg-accent border-accent text-accent-ink shadow-sm'
                  : 'bg-paper border-rule text-muted hover:text-ink-2 hover:bg-paper-3'
              }`}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted">{t('durationHint')}</p>
      </div>

      {/* 风格选择 */}
      <div>
        <label className="block text-sm font-medium text-ink-2 mb-2">
          {t('styleLabel')}
        </label>
        <div className="flex flex-wrap gap-2">
          {STYLE_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setStyle(s)}
              disabled={loading}
              className={`px-3 py-1.5 text-sm rounded-lg border transition ${
                style === s
                  ? 'bg-accent border-accent text-accent-ink shadow-sm'
                  : 'bg-paper border-rule text-muted hover:text-ink-2 hover:bg-paper-3'
              }`}
            >
              {t(`style_${s}`)}
            </button>
          ))}
        </div>
      </div>

      {/* 水印开关 */}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={enableWatermark}
          onChange={(e) => setEnableWatermark(e.target.checked)}
          disabled={loading}
          className="w-4 h-4 rounded border-rule bg-paper text-accent focus:ring-accent/30"
        />
        <span className="text-sm text-ink-2">{t('watermarkOption')}</span>
      </label>

      {/* 生成按钮 */}
      <button
        onClick={onGenerate}
        disabled={!idea.trim() || loading}
        className="btn-primary w-full py-3 text-sm"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {t('scriptGenerating')}
          </span>
        ) : (
          t('generateScript')
        )}
      </button>

      <p className="text-xs text-muted text-center">
        {t('timeHint')}
      </p>
    </div>
  );
}
