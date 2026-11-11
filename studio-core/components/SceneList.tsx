'use client';

import { useTranslations } from 'next-intl';
import type { StudioPhase, Scene } from '../types';

interface Props {
  readonly scenes: Scene[];
  readonly phase: StudioPhase;
  readonly hasFailedScenes: boolean;
  readonly allCompleted: boolean;
  readonly onGenerateVideos: () => void;
  readonly onRetryFailed: () => void;
  readonly onConcatenate: () => void;
  readonly onReset: () => void;
  readonly onCancel: () => void;
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
      <div className="card-surface rounded-2xl p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-ink">{t('sceneListTitle')}</h3>
          <span className="text-xs text-muted">
            {doneCount}/{scenes.length} {t('scenesUnit')}
          </span>
        </div>

        {/* 整体进度条 */}
        {isGenerating && (
          <div className="mb-4 h-1.5 bg-paper rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500"
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
            className="btn-primary flex-1 py-3 text-sm"
          >
            {t('startGenerateVideos')}
          </button>
          <button
            onClick={onReset}
            className="px-4 py-3 text-sm text-muted hover:text-ink-2 bg-paper-3 border border-rule rounded-lg transition"
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
            className="flex-1 py-3 text-sm font-medium bg-paper-3 hover:bg-paper-2 border border-rule rounded-lg transition text-ink-2"
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
              className="btn-primary flex-1 py-3 text-sm"
            >
              {t('retryFailed')}
            </button>
          )}
          <button
            onClick={onConcatenate}
            disabled={!allCompleted && !hasFailedScenes ? false : !allCompleted && hasFailedScenes}
            className={`flex-1 py-3 text-sm font-medium rounded-lg transition-all ${
              allCompleted
                ? 'btn-primary'
                : 'bg-paper-3 text-muted border border-rule'
            }`}
            title={!allCompleted && hasFailedScenes ? t('concatWithFailedHint') : undefined}
          >
            {t('startConcat')}
          </button>
          <button
            onClick={onReset}
            className="px-4 py-3 text-sm text-muted hover:text-ink-2 bg-paper-3 border border-rule rounded-lg transition"
          >
            {t('reset')}
          </button>
        </div>
      )}

      {isGenerating && (
        <div className="text-center py-2">
          <p className="text-xs text-muted">{t('generatingHint')}</p>
        </div>
      )}
    </div>
  );
}

/** 单个场景卡片 */
function SceneCard({ scene }: Readonly<{ scene: Scene }>) {
  const t = useTranslations('studio');

  const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
    pending: { label: t('statusPending'), color: 'text-muted', icon: '○' },
    queued: { label: t('statusQueued'), color: 'text-accent', icon: '◷' },
    submitting: { label: t('statusSubmitting'), color: 'text-accent', icon: '◐' },
    generating: { label: t('statusGenerating'), color: 'text-accent', icon: '◐' },
    completed: { label: t('statusCompleted'), color: 'text-success', icon: '●' },
    error: { label: t('statusError'), color: 'text-danger', icon: '✕' },
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
    <div className="bg-paper border border-rule rounded-xl p-4">
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-6 h-6 flex items-center justify-center text-xs font-mono text-muted bg-paper-3 border border-rule rounded">
          {scene.index}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h4 className="text-sm font-medium text-ink-2 truncate">{scene.title}</h4>
            <span className={`shrink-0 text-xs ${status.color}`}>
              {status.icon} {status.label}
              {scene.status === 'generating' && scene.progress !== undefined && ` ${scene.progress}%`}
            </span>
          </div>
          <p className="text-xs text-muted line-clamp-2 mb-1">{scene.visualPrompt}</p>
          {scene.narration && (
            <p className="text-xs text-ink-2/70 italic line-clamp-1">&ldquo;{scene.narration}&rdquo;</p>
          )}

          {/* 轮询进度细节 */}
          {scene.status === 'generating' && (
            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted">
              {scene.elapsedSeconds !== undefined && (
                <span>⏱ {Math.floor(scene.elapsedSeconds / 60)}m{scene.elapsedSeconds % 60}s</span>
              )}
              {scene.pollCount !== undefined && scene.pollCount > 0 && (
                <span>↻ {scene.pollCount}</span>
              )}
              {(scene.consecutiveFailures ?? 0) > 0 && (
                <span className="text-accent/80">⚠ {scene.consecutiveFailures}</span>
              )}
            </div>
          )}

          {errText && (
            <p className="text-xs text-danger/70 mt-1 break-all font-mono">{errText}</p>
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
