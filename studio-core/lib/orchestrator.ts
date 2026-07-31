// Studio 视频生成编排器
// 实现「受限速的并行提交 + 并行轮询」编排，逻辑对齐原项目 agnes-video-generator：
//   - 提交：受 submitLimiter 约束（视频提交接口现限速 1 次/分钟），多场景提交串行排队；
//     但每个场景提交成功后立即启动独立轮询，轮询彼此并行。
//   - 重试：提交失败按线性退避重试（submitVideoWithRetry）；轮询单次失败计数，连续
//     MAX_CONSECUTIVE_FAILURES 次才放弃。
//   - 续传：已有 videoId 的场景跳过提交直接轮询；已 completed 但 blob 失效的依据
//     remoteVideoUrl 重新下载。
//   - 日志：在提交/轮询/重试/完成/失败等关键节点写入 studioLogger，供页面日志面板展示。

import type { Scene, StudioPhase, StudioRatio } from '../types';
import {
  POLL_INTERVAL,
  MAX_POLL_TIME,
  MAX_CONSECUTIVE_FAILURES,
  MAX_SUBMIT_RETRIES,
  RETRY_BASE_DELAY,
} from '../types';
import { submitLimiter, sleep } from './rate-limiter';
import {
  submitVideoWithRetry,
  checkVideoStatus,
  downloadVideoBlob,
  VideoApiError,
} from './video-api';
import { studioLogger } from './logger';

/** 编排器向 UI 层的回调 */
export interface OrchestratorCallbacks {
  /** 更新某个场景（patch 合并） */
  onSceneUpdate: (index: number, patch: Partial<Scene>) => void;
  /** 整体阶段变化 */
  onPhaseChange: (phase: StudioPhase) => void;
  /** 持久化当前状态（传入编排器内部权威 scenes 副本） */
  onPersist: (scenes: Scene[]) => void;
}

/** 场景级错误 code（组件层用 t(`errors.${code}`) 翻译） */
export type SceneErrorCode =
  | 'pollTimeout'
  | 'videoFailed'
  | 'maxConsecutiveFailures'
  | 'submitFailed'
  | 'downloadFailed'
  | 'aborted'
  | 'invalidApiKey'
  | 'rateLimited'
  | 'network';

/** 构造日志 scope */
function sceneScope(index: number): string {
  return `scene:${index + 1}`;
}

export class VideoOrchestrator {
  private apiKey: string;
  private ratio: StudioRatio;
  private cb: OrchestratorCallbacks;
  private signal?: AbortSignal;
  /** 内部 scenes 副本（权威来源，避免 React 异步状态时序问题） */
  private scenes: Scene[] = [];

  constructor(
    apiKey: string,
    ratio: StudioRatio,
    callbacks: OrchestratorCallbacks,
    signal?: AbortSignal,
  ) {
    this.apiKey = apiKey;
    this.ratio = ratio;
    this.cb = callbacks;
    this.signal = signal;
  }

  /** 合并更新某场景，并同步到 UI + 持久化 */
  private update(index: number, patch: Partial<Scene>): void {
    if (index < 0 || index >= this.scenes.length) return;
    this.scenes[index] = { ...this.scenes[index], ...patch };
    this.cb.onSceneUpdate(index, patch);
    this.cb.onPersist(this.scenes);
  }

  /**
   * 运行全部场景：受限速并行提交 + 并行轮询 + 下载。
   * @param initialScenes 初始场景列表
   * @returns 是否全部成功 + 失败场景序号
   */
  async runAll(initialScenes: Scene[]): Promise<{
    ok: boolean;
    failedIndices: number[];
  }> {
    this.scenes = initialScenes.map((s) => ({ ...s }));
    const failedIndices: number[] = [];
    const tasks: Promise<void>[] = [];

    studioLogger.info('system', `Start generating video: ${this.scenes.length} scenes, ratio ${this.ratio}`);

    for (let i = 0; i < this.scenes.length; i++) {
      const scene = this.scenes[i];
      const sc = sceneScope(i);

      // Completed: skip if blob valid; otherwise re-download via remoteVideoUrl (resume)
      if (scene.status === 'completed') {
        if (scene.videoUrl) {
          studioLogger.info(sc, `Already completed (cache hit), skipping`);
          continue;
        }
        if (scene.remoteVideoUrl) {
          studioLogger.info(sc, `Resume: re-downloading completed video`);
          tasks.push(this.redownload(i, scene.remoteVideoUrl));
          continue;
        }
        studioLogger.error(sc, 'Completed but no cache and no remote URL, marking as failed');
        this.update(i, { status: 'error', error: 'downloadFailed' });
        continue;
      }

      // Resume: has videoId (incl. retry from error state) → poll directly, skip submit
      if (scene.videoId) {
        studioLogger.info(sc, `Resume: polling directly videoId=${scene.videoId}`);
        this.update(i, { status: 'generating', error: undefined });
        tasks.push(this.runScene(i, scene.videoId, scene.startedAt ?? Date.now()));
        continue;
      }

      // No videoId: needs submit, queue for the rate limiter
      studioLogger.info(sc, 'Queued for submission (rate limit: 1 per minute)');
      this.update(i, { status: 'queued', error: undefined });
      tasks.push(this.submitAndPoll(i));
    }

    if (tasks.length === 0) {
      studioLogger.success('system', 'All scenes already completed, no regeneration needed');
      return { ok: true, failedIndices: [] };
    }

    await Promise.allSettled(tasks);

    for (let i = 0; i < this.scenes.length; i++) {
      if (this.scenes[i].status === 'error') failedIndices.push(i);
    }

    if (failedIndices.length === 0) {
      studioLogger.success('system', `All ${this.scenes.length} scenes generated successfully`);
    } else {
      studioLogger.error(
        'system',
        `${failedIndices.length}/${this.scenes.length} scenes failed: ${failedIndices.map((i) => i + 1).join(', ')}`,
      );
    }
    return { ok: failedIndices.length === 0, failedIndices };
  }

  /** 提交单场景（受限速器），成功后启动轮询 */
  private async submitAndPoll(index: number): Promise<void> {
    const scene = this.scenes[index];
    const sc = sceneScope(index);
    try {
      // Wait for the submission slot
      const waitMs = await submitLimiter.acquire(this.signal);
      if (waitMs > 0) {
        studioLogger.info(sc, `Waiting ${Math.round(waitMs / 1000)}s for submission slot`);
      }
      if (this.signal?.aborted) throw new VideoApiError('aborted', 'Cancelled');

      this.update(index, {
        status: 'submitting',
        submitAttempts: 1,
        startedAt: Date.now(),
        error: undefined,
      });
      studioLogger.info(sc, 'Submitting...');

      const { videoId } = await submitVideoWithRetry(
        this.apiKey,
        scene.visualPrompt,
        this.ratio,
        5,
        (attempt, delayMs) => {
          // 提交重试中
          this.update(index, {
            submitAttempts: attempt + 1,
            error: `retrying:${attempt}:${Math.round(delayMs / 1000)}`,
          });
        },
        this.signal,
      );

      studioLogger.success(sc, `Submission successful, videoId=${videoId}`);

      this.update(index, {
        videoId,
        status: 'generating',
        error: undefined,
        consecutiveFailures: 0,
        pollCount: 0,
        startedAt: Date.now(),
      });

      await this.pollLoop(index, videoId, Date.now());
    } catch (e) {
      const code = this.toErrorCode(e);
      const raw = e instanceof Error ? e.message : String(e);
      studioLogger.error(sc, `Submission failed: ${code}`, raw);
      this.update(index, { status: 'error', error: code });
      throw e;
    }
  }

  /** Resume entry: go straight into polling */
  private async runScene(index: number, videoId: string, startedAt: number): Promise<void> {
    const sc = sceneScope(index);
    try {
      await this.pollLoop(index, videoId, startedAt);
    } catch (e) {
      const code = this.toErrorCode(e);
      const raw = e instanceof Error ? e.message : String(e);
      studioLogger.error(sc, `Polling failed: ${code}`, raw);
      this.update(index, { status: 'error', error: code });
      throw e;
    }
  }

  /** Resume: re-download a completed scene whose blob is gone */
  private async redownload(index: number, remoteUrl: string): Promise<void> {
    const sc = sceneScope(index);
    try {
      studioLogger.info(sc, 'Downloading completed video...');
      const blob = await downloadVideoBlob(remoteUrl, this.signal, (p) => {
        if (p < 1) studioLogger.info(sc, `Downloading... ${Math.round(p * 100)}%`);
      });
      const blobUrl = URL.createObjectURL(blob);
      studioLogger.success(sc, `Download complete (${(blob.size / 1024 / 1024).toFixed(1)} MB, ${blob.type})`);
      this.update(index, { videoUrl: blobUrl, status: 'completed', error: undefined });
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      studioLogger.error(sc, 'Re-download failed', raw);
      this.update(index, { status: 'error', error: 'downloadFailed' });
      throw e;
    }
  }

  /**
   * 轮询单场景直到 completed/failed/超时/连续失败上限。
   * 提交后立即轮询一次，之后每 POLL_INTERVAL 一次。
   */
  private pollLoop(index: number, videoId: string, startedAt: number): Promise<void> {
    const sc = sceneScope(index);
    return new Promise<void>((resolve, reject) => {
      const tick = async () => {
        if (this.signal?.aborted) {
          studioLogger.warn(sc, 'Cancelled');
          reject(new VideoApiError('aborted', 'Cancelled'));
          return;
        }
        if (Date.now() - startedAt > MAX_POLL_TIME) {
          studioLogger.error(sc, `Polling timed out (>${Math.round(MAX_POLL_TIME / 60000)} min)`);
          this.update(index, { error: 'pollTimeout' });
          reject(new VideoApiError('pollTimeout', 'Polling timed out'));
          return;
        }
        const scene = this.scenes[index];
        const fails = scene.consecutiveFailures ?? 0;
        if (fails >= MAX_CONSECUTIVE_FAILURES) {
          studioLogger.error(sc, `${MAX_CONSECUTIVE_FAILURES} consecutive polling failures, giving up`);
          this.update(index, { error: 'maxConsecutiveFailures' });
          reject(new VideoApiError('maxConsecutiveFailures', 'Too many consecutive failures'));
          return;
        }

        try {
          const result = await checkVideoStatus(this.apiKey, videoId);
          const pollN = (scene.pollCount ?? 0) + 1;
          this.update(index, {
            progress: result.progress,
            pollCount: pollN,
            consecutiveFailures: 0,
            elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
          });

          studioLogger.info(
            sc,
            `Poll #${pollN}: status=${result.status} progress=${result.progress}%`,
          );

          if (result.status === 'completed' && result.videoUrl) {
            this.update(index, { remoteVideoUrl: result.videoUrl, progress: 100 });
            studioLogger.info(sc, 'Video ready, starting download...');
            try {
              const blob = await downloadVideoBlob(result.videoUrl, this.signal, (p) => {
                if (p < 1) studioLogger.info(sc, `Downloading... ${Math.round(p * 100)}%`);
              });
              const blobUrl = URL.createObjectURL(blob);
              studioLogger.success(sc, `Download complete (${(blob.size / 1024 / 1024).toFixed(1)} MB, ${blob.type})`);
              this.update(index, { videoUrl: blobUrl, status: 'completed', error: undefined });
              resolve();
            } catch (e) {
              const raw = e instanceof Error ? e.message : String(e);
              studioLogger.error(sc, 'Download failed', raw);
              this.update(index, { error: 'downloadFailed' });
              reject(e);
            }
            return;
          }
          if (result.status === 'failed') {
            studioLogger.error(sc, 'Remote returned failed');
            this.update(index, { error: 'videoFailed' });
            reject(new VideoApiError('videoFailed', 'Video generation failed'));
            return;
          }

          const ok = await sleep(POLL_INTERVAL, this.signal);
          if (!ok) {
            studioLogger.warn(sc, 'Cancelled');
            reject(new VideoApiError('aborted', 'Cancelled'));
            return;
          }
          tick();
        } catch (e) {
          const raw = e instanceof Error ? e.message : String(e);
          const newFails = fails + 1;
          studioLogger.warn(sc, `Polling failed (${newFails}/${MAX_CONSECUTIVE_FAILURES})`, raw);
          this.update(index, {
            consecutiveFailures: newFails,
            pollCount: (scene.pollCount ?? 0) + 1,
            elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
          });
          const ok = await sleep(POLL_INTERVAL, this.signal);
          if (!ok) {
            studioLogger.warn(sc, 'Cancelled');
            reject(new VideoApiError('aborted', 'Cancelled'));
            return;
          }
          tick();
        }
      };
      tick();
    });
  }

  /** Normalize any error into a scene error code */
  private toErrorCode(e: unknown): SceneErrorCode {
    if (e instanceof VideoApiError) {
      switch (e.code) {
        case 'aborted':
          return 'aborted';
        case 'download_error':
          return 'downloadFailed';
        case 'poll_error':
          return 'maxConsecutiveFailures';
        case 'invalid_api_key':
          return 'invalidApiKey';
        case 'rate_limited':
          return 'rateLimited';
        case 'network':
          return 'network';
        case 'upstream_error':
        case 'no_video_id':
        default:
          return 'submitFailed';
      }
    }
    return 'submitFailed';
  }
}

/** 导出重试参数供 UI 展示 */
export { MAX_SUBMIT_RETRIES, RETRY_BASE_DELAY, MAX_CONSECUTIVE_FAILURES };
