'use client';

import { useTranslations } from 'next-intl';
import type { StudioPhase, Scene } from '../types';

interface Props {
  scenes: Scene[];
  phase: StudioPhase;
  hasFailedScenes: boolean;
  allCompleted: boolean;
  onGenerateVideos: () => void;
  onRetryFailed: () => void;
  onConcatenate: () => void;
  onReset: () => void;
  onCancel: () => void;
}

const ERROR_CODES = [
  'pollTimeout',
  'videoFailed',
  'maxConsecutiveFailures',
  'submitFailed',
  'downloadFailed',
  'aborted',
  'invalidApiKey',
  'rateLimited',
  'network',
] as const;

export default function SceneList({
  scenes,
  phase,
  hasFailedScenes,
  allCompleted,
  onGenerateVideos,
  onRetryFailed,
  onConcatenate,
  onReset,
  onCancel,
}: Props) {
  const t = useTranslations('studio');

  const isGenerating = phase === 'videos_generating';
  const allReady = phase === 'all_videos_ready';
  const doneCount = scenes.filter((s) => s.status === 'completed').length;

  return (
    <div className="space-y-4">
      {/* 场景列表 */}
      <div className="bg-gray-800/40 backdrop-blur-xl border border-gray-700/60 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white">{t('sceneListTitle')}</h3>
          <span className="text-xs text-gray-500">
            {doneCount}/{scenes.length} {t('scenesUnit')}
          </span>
        </div>

        {/* 整体进度条 */}
        {isGenerating && (
          <div className="mb-4 h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-500"
              style={{ width: `${scenes.length ? (doneCount / scenes.length) * 100 : 0}%` }}
            />
          </div>
        )}

        <div className="space-y-3">
          {scenes.map((scene) => (
            <SceneCard key={scene.index} scene={scene} />
          ))}
        </div>
      </div>

      {/* 操作按钮 */}
      {phase === 'script_ready' && (
        <div className="flex gap-3">
          <button
            onClick={onGenerateVideos}
            className="flex-1 py-3 text-sm font-medium bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 rounded-lg transition-all text-white shadow-lg shadow-blue-600/20"
          >
            {t('startGenerateVideos')}
          </button>
          <button
            onClick={onReset}
            className="px-4 py-3 text-sm text-gray-400 hover:text-gray-200 bg-gray-800/50 border border-gray-700/50 rounded-lg transition"
          >
            {t('reset')}
          </button>
        </div>
      )}

      {/* 生成中：取消按钮 */}
      {isGenerating && (
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 text-sm font-medium bg-gray-800/60 hover:bg-gray-700/60 border border-gray-700/60 rounded-lg transition text-gray-300"
          >
            {t('cancel')}
          </button>
        </div>
      )}

      {/* 全部就绪：拼接；若有失败则可重试 */}
      {allReady && (
        <div className="flex gap-3">
          {hasFailedScenes && (
            <button
              onClick={onRetryFailed}
              className="flex-1 py-3 text-sm font-medium bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 rounded-lg transition-all text-white shadow-lg shadow-blue-600/20"
            >
              {t('retryFailed')}
            </button>
          )}
          <button
            onClick={onConcatenate}
            disabled={!allCompleted && !hasFailedScenes ? false : !allCompleted && hasFailedScenes}
            className={`flex-1 py-3 text-sm font-medium rounded-lg transition-all text-white shadow-lg ${
              allCompleted
                ? 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 shadow-amber-600/20'
                : 'bg-gray-700/60 hover:bg-gray-700'
            }`}
            title={!allCompleted && hasFailedScenes ? t('concatWithFailedHint') : undefined}
          >
            {t('startConcat')}
          </button>
          <button
            onClick={onReset}
            className="px-4 py-3 text-sm text-gray-400 hover:text-gray-200 bg-gray-800/50 border border-gray-700/50 rounded-lg transition"
          >
            {t('reset')}
          </button>
        </div>
      )}

      {isGenerating && (
        <div className="text-center py-2">
          <p className="text-xs text-gray-500">{t('generatingHint')}</p>
        </div>
      )}
    </div>
  );
}

/** 单个场景卡片 */
function SceneCard({ scene }: { scene: Scene }) {
  const t = useTranslations('studio');

  const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
    pending: { label: t('statusPending'), color: 'text-gray-500', icon: '○' },
    queued: { label: t('statusQueued'), color: 'text-amber-400', icon: '◷' },
    submitting: { label: t('statusSubmitting'), color: 'text-blue-400', icon: '◐' },
    generating: { label: t('statusGenerating'), color: 'text-blue-400', icon: '◐' },
    completed: { label: t('statusCompleted'), color: 'text-green-400', icon: '●' },
    error: { label: t('statusError'), color: 'text-red-400', icon: '✕' },
  };

  const status = statusConfig[scene.status] || statusConfig.pending;

  /** 把 scene.error（可能是 code 或 retrying:n:s）翻译为可读文本 */
  const renderError = (): string | null => {
    if (!scene.error) return null;
    if (scene.error.startsWith('retrying:')) {
      const parts = scene.error.split(':');
      const n = parts[1];
      const s = parts[2];
      return t('retryingHint', { n, s });
    }
    if ((ERROR_CODES as readonly string[]).includes(scene.error)) {
      return t(`errors.${scene.error}`);
    }
    return scene.error;
  };

  const errText = renderError();

  return (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-6 h-6 flex items-center justify-center text-xs font-mono text-gray-500 bg-gray-700/50 rounded">
          {scene.index}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h4 className="text-sm font-medium text-gray-200 truncate">{scene.title}</h4>
            <span className={`shrink-0 text-xs ${status.color}`}>
              {status.icon} {status.label}
              {scene.status === 'generating' && scene.progress !== undefined && ` ${scene.progress}%`}
            </span>
          </div>
          <p className="text-xs text-gray-400 line-clamp-2 mb-1">{scene.visualPrompt}</p>
          {scene.narration && (
            <p className="text-xs text-gray-500 italic line-clamp-1">&ldquo;{scene.narration}&rdquo;</p>
          )}

          {/* 轮询进度细节 */}
          {scene.status === 'generating' && (
            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500">
              {scene.elapsedSeconds !== undefined && (
                <span>⏱ {Math.floor(scene.elapsedSeconds / 60)}m{scene.elapsedSeconds % 60}s</span>
              )}
              {scene.pollCount !== undefined && scene.pollCount > 0 && (
                <span>↻ {scene.pollCount}</span>
              )}
              {(scene.consecutiveFailures ?? 0) > 0 && (
                <span className="text-amber-500/80">⚠ {scene.consecutiveFailures}</span>
              )}
            </div>
          )}

          {errText && (
            <p className="text-xs text-red-400/70 mt-1 break-all font-mono">{errText}</p>
          )}
          {scene.videoUrl && scene.status === 'completed' && (
            <video
              src={scene.videoUrl}
              controls
              className="mt-2 w-full rounded-lg max-h-40"
              preload="metadata"
            />
          )}
        </div>
      </div>
    </div>
  );
}
