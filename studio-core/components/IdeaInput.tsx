'use client';

import { useTranslations } from 'next-intl';
import {
  SCENE_COUNT_OPTIONS,
  STUDIO_RATIO_OPTIONS,
  STYLE_OPTIONS,
} from '../types';
import type { StudioRatio, StudioStyle } from '../types';

interface Props {
  idea: string;
  setIdea: (v: string) => void;
  sceneCount: number;
  setSceneCount: (v: number) => void;
  ratio: StudioRatio;
  setRatio: (v: StudioRatio) => void;
  style: StudioStyle;
  setStyle: (v: StudioStyle) => void;
  enableWatermark: boolean;
  setEnableWatermark: (v: boolean) => void;
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
  style,
  setStyle,
  enableWatermark,
  setEnableWatermark,
  loading,
  onGenerate,
}: Props) {
  const t = useTranslations('studio');

  return (
    <div className="bg-gray-800/40 backdrop-blur-xl border border-gray-700/60 rounded-2xl p-6 sm:p-8 space-y-5">
      {/* 创意输入 */}
      <div>
        <label className="block text-sm font-medium text-gray-200 mb-2">
          {t('ideaLabel')}
        </label>
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          disabled={loading}
          placeholder={t('ideaPlaceholder')}
          rows={4}
          className="w-full bg-gray-800/80 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500/70 focus:ring-1 focus:ring-blue-500/30 transition resize-none"
        />
        <p className="mt-1.5 text-xs text-gray-500">{t('ideaHint')}</p>
      </div>

      {/* 场景数 + 画面比例 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-2">
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
                    ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                    : 'bg-gray-800/50 border-gray-700/50 text-gray-400 hover:text-gray-200'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-200 mb-2">
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
                    ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                    : 'bg-gray-800/50 border-gray-700/50 text-gray-400 hover:text-gray-200'
                }`}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 风格选择 */}
      <div>
        <label className="block text-sm font-medium text-gray-200 mb-2">
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
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'bg-gray-800/50 border-gray-700/50 text-gray-400 hover:text-gray-200'
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
          className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500/30"
        />
        <span className="text-sm text-gray-300">{t('watermarkOption')}</span>
      </label>

      {/* 生成按钮 */}
      <button
        onClick={onGenerate}
        disabled={!idea.trim() || loading}
        className="w-full py-3 text-sm font-medium bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-all text-white shadow-lg shadow-blue-600/20"
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

      <p className="text-xs text-gray-500 text-center">
        {t('timeHint')}
      </p>
    </div>
  );
}
