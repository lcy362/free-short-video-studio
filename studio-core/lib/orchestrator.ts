// Studio 视频生成编排器
// 实现「受限速的并行提交 + 并行轮询」编排，逻辑对齐原项目 agnes-video-generator：
//   - 提交：受 submitLimiter 约束（视频提交接口现限速 1 次/分钟），多场景提交串行排队；
//     但每个场景提交成功后立即启动独立轮询，轮询彼此并行。
//   - 重试：提交失败按线性退避重试（submitVideoWithRetry）；轮询单次失败计数，连续
//     MAX_CONSECUTIVE_FAILURES 次才放弃。
//   - 续传：已有 videoId 的场景跳过提交直接轮询；已 completed 但 blob 失效的依据
//     remoteVideoUrl 重新下载。
//   - 日志：在提交/轮询/重试/完成/失败等关键节点写入 studioLogger，供页面日志面板展示。

import type { Scene, StudioDuration, StudioPhase, StudioRatio } from '../types';
import { POLL_INTERVAL, MAX_POLL_TIME, MAX_CONSECUTIVE_FAILURES } from '../types';
import type { StudioVideoModelId } from './video-models';
import { DEFAULT_STUDIO_VIDEO_MODEL } from './video-models';
import { DEFAULT_AGNES_DOMAIN, getAgnesBase } from './api-domains';
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
  private readonly apiKey: string;
  private readonly ratio: StudioRatio;
  private readonly duration: StudioDuration;
  private readonly model: StudioVideoModelId;
  private readonly base: string;
  private readonly cb: OrchestratorCallbacks;
  private readonly signal?: AbortSignal;
  /** 内部 scenes 副本（权威来源，避免 React 异步状态时序问题） */
  private scenes: Scene[] = [];

  constructor(
    apiKey: string,
    ratio: StudioRatio,
    callbacks: OrchestratorCallbacks,
    signal?: AbortSignal,
    duration: StudioDuration = 5,
    model: StudioVideoModelId = DEFAULT_STUDIO_VIDEO_MODEL,
    base: string = getAgnesBase(DEFAULT_AGNES_DOMAIN),
  ) {
    this.apiKey = apiKey;
    this.ratio = ratio;
    this.duration = duration;
    this.model = model;
    this.base = base;
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
    studioLogger.info('system', `Start generating video: ${this.scenes.length} scenes, ratio ${this.ratio}`);

    const tasks = this.buildTasks();

    if (tasks.length === 0) {
      studioLogger.success('system', 'All scenes already completed, no regeneration needed');
      return { ok: true, failedIndices: [] };
    }

    await Promise.allSettled(tasks);

    const failedIndices = this.collectFailedIndices();
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

  /** 为每个场景决定本次要做的事，收集需要等待的任务 */
  private buildTasks(): Promise<void>[] {
    const tasks: Promise<void>[] = [];
    for (let i = 0; i < this.scenes.length; i++) {
      const task = this.planScene(i);
      if (task) tasks.push(task);
    }
    return tasks;
  }

  /**
   * 单场景的任务规划：已完成跳过 / 已完成但 blob 失效则重下 / 有 videoId 直接轮询 / 否则排队提交。
   * 返回 null 表示该场景无需任何异步任务。
   */
  private planScene(index: number): Promise<void> | null {
    const scene = this.scenes[index];
    const sc = sceneScope(index);

    if (scene.status === 'completed') {
      if (scene.videoUrl) {
        studioLogger.info(sc, 'Already completed (cache hit), skipping');
        return null;
      }
      if (scene.remoteVideoUrl) {
        studioLogger.info(sc, 'Resume: re-downloading completed video');
        return this.redownload(index, scene.remoteVideoUrl);
      }
      studioLogger.error(sc, 'Completed but no cache and no remote URL, marking as failed');
      this.update(index, { status: 'error', error: 'downloadFailed' });
      return null;
    }

    // Resume: has videoId (incl. retry from error state) → poll directly, skip submit
    if (scene.videoId) {
      studioLogger.info(sc, `Resume: polling directly videoId=${scene.videoId}`);
      this.update(index, { status: 'generating', error: undefined });
      return this.runScene(index, scene.videoId, scene.startedAt ?? Date.now());
    }

    // No videoId: needs submit, queue for the rate limiter
    studioLogger.info(sc, 'Queued for submission (rate limit: 1 per minute)');
    this.update(index, { status: 'queued', error: undefined });
    return this.submitAndPoll(index);
  }

  /** 收集失败场景序号 */
  private collectFailedIndices(): number[] {
    const failedIndices: number[] = [];
    for (let i = 0; i < this.scenes.length; i++) {
      if (this.scenes[i].status === 'error') failedIndices.push(i);
    }
    return failedIndices;
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

      const { videoId } = await submitVideoWithRetry({
        apiKey: this.apiKey,
        prompt: scene.visualPrompt,
        ratio: this.ratio,
        duration: this.duration,
        model: this.model,
        base: this.base,
        onAttempt: (attempt, delayMs) => {
          // 提交重试中
          this.update(index, {
            submitAttempts: attempt + 1,
            error: `retrying:${attempt}:${Math.round(delayMs / 1000)}`,
          });
        },
        signal: this.signal,
      });

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
      const tick = async (): Promise<void> => {
        const blocked = this.checkPollGuards(index, startedAt);
        if (blocked) {
          reject(blocked);
          return;
        }

        try {
          const result = await checkVideoStatus(this.apiKey, videoId, this.model, this.base);
          this.recordPollResult(index, startedAt, result);

          if (result.status === 'failed') {
            studioLogger.error(sc, 'Remote returned failed');
            this.update(index, { error: 'videoFailed' });
            reject(new VideoApiError('videoFailed', 'Video generation failed'));
            return;
          }

          if (result.status === 'completed' && result.videoUrl) {
            const failure = await this.completeScene(index, result.videoUrl);
            if (failure) reject(failure);
            else resolve();
            return;
          }
        } catch (e) {
          const newFails = this.recordPollFailure(index, startedAt);
          const raw = e instanceof Error ? e.message : String(e);
          studioLogger.warn(sc, `Polling failed (${newFails}/${MAX_CONSECUTIVE_FAILURES})`, raw);
        }

        const ok = await sleep(POLL_INTERVAL, this.signal);
        if (!ok) {
          studioLogger.warn(sc, 'Cancelled');
          reject(new VideoApiError('aborted', 'Cancelled'));
          return;
        }
        void tick();
      };
      void tick();
    });
  }

  /** 轮询的前置终止条件：已取消 / 超出轮询预算 / 连续失败达上限。返回需要 reject 的错误，null 表示继续 */
  private checkPollGuards(index: number, startedAt: number): VideoApiError | null {
    const sc = sceneScope(index);

    if (this.signal?.aborted) {
      studioLogger.warn(sc, 'Cancelled');
      return new VideoApiError('aborted', 'Cancelled');
    }

    if (Date.now() - startedAt > MAX_POLL_TIME) {
      studioLogger.error(sc, `Polling timed out (>${Math.round(MAX_POLL_TIME / 60000)} min)`);
      this.update(index, { error: 'pollTimeout' });
      return new VideoApiError('pollTimeout', 'Polling timed out');
    }

    const fails = this.scenes[index].consecutiveFailures ?? 0;
    if (fails >= MAX_CONSECUTIVE_FAILURES) {
      studioLogger.error(sc, `${MAX_CONSECUTIVE_FAILURES} consecutive polling failures, giving up`);
      this.update(index, { error: 'maxConsecutiveFailures' });
      return new VideoApiError('maxConsecutiveFailures', 'Too many consecutive failures');
    }

    return null;
  }

  /** 记录一次成功的状态查询（进度 / 轮询次数 / 用时），并写日志 */
  private recordPollResult(
    index: number,
    startedAt: number,
    result: { status: string; progress: number },
  ): void {
    const sc = sceneScope(index);
    const pollN = (this.scenes[index].pollCount ?? 0) + 1;
    this.update(index, {
      progress: result.progress,
      pollCount: pollN,
      consecutiveFailures: 0,
      elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
    });
    studioLogger.info(sc, `Poll #${pollN}: status=${result.status} progress=${result.progress}%`);
  }

  /** 记录一次失败的查询，返回累计连续失败次数 */
  private recordPollFailure(index: number, startedAt: number): number {
    const scene = this.scenes[index];
    const newFails = (scene.consecutiveFailures ?? 0) + 1;
    this.update(index, {
      consecutiveFailures: newFails,
      pollCount: (scene.pollCount ?? 0) + 1,
      elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
    });
    return newFails;
  }

  /**
   * 下载已完成视频并落成 blob URL。
   * 成功返回 null；失败返回原始错误（已记日志并把场景标记为 downloadFailed）。
   */
  private async completeScene(index: number, remoteUrl: string): Promise<unknown | null> {
    const sc = sceneScope(index);
    this.update(index, { remoteVideoUrl: remoteUrl, progress: 100 });
    studioLogger.info(sc, 'Video ready, starting download...');

    try {
      const blob = await downloadVideoBlob(remoteUrl, this.signal, (p) => {
        if (p < 1) studioLogger.info(sc, `Downloading... ${Math.round(p * 100)}%`);
      });
      const blobUrl = URL.createObjectURL(blob);
      studioLogger.success(sc, `Download complete (${(blob.size / 1024 / 1024).toFixed(1)} MB, ${blob.type})`);
      this.update(index, { videoUrl: blobUrl, status: 'completed', error: undefined });
      return null;
    } catch (e) {
      studioLogger.error(sc, 'Download failed', e instanceof Error ? e.message : String(e));
      this.update(index, { error: 'downloadFailed' });
      return e;
    }
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
export { MAX_SUBMIT_RETRIES, RETRY_BASE_DELAY, MAX_CONSECUTIVE_FAILURES } from '../types';
