import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoOrchestrator } from '../studio-core/lib/orchestrator';
import {
  submitVideoWithRetry,
  checkVideoStatus,
  downloadVideoBlob,
  VideoApiError,
} from '../studio-core/lib/video-api';
import { studioLogger } from '../studio-core/lib/logger';
import type { Scene } from '../studio-core/types';

vi.mock('../studio-core/lib/rate-limiter', () => ({
  sleep: vi.fn(async () => true),
  submitLimiter: {
    acquire: vi.fn(async () => 0),
    reset: vi.fn(),
  },
}));

vi.mock('../studio-core/lib/video-api', () => ({
  submitVideoWithRetry: vi.fn(),
  checkVideoStatus: vi.fn(),
  downloadVideoBlob: vi.fn(),
  VideoApiError: class VideoApiError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status = 0) {
      super(message);
      this.code = code;
      this.status = status;
      this.name = 'VideoApiError';
    }
  },
}));

const mockSubmit = vi.mocked(submitVideoWithRetry);
const mockCheck = vi.mocked(checkVideoStatus);
const mockDownload = vi.mocked(downloadVideoBlob);

function scene(overrides: Partial<Scene> = {}): Scene {
  return {
    index: 1,
    title: 't',
    visualPrompt: 'vp',
    narration: 'n',
    status: 'pending',
    ...overrides,
  };
}

function runAll(scenes: Scene[]) {
  const patches: Array<{ index: number; patch: Record<string, unknown> }> = [];
  const orch = new VideoOrchestrator(
    'key',
    '16:9',
    {
      onSceneUpdate: (index, patch) => patches.push({ index, patch }),
      onPhaseChange: () => {},
      onPersist: () => {},
    },
    undefined,
    5,
    'agnes-video-v2.0',
    'https://apihub.agnes-ai.com',
  );
  return { promise: orch.runAll(scenes), patches };
}

function lastPatch(patches: ReturnType<typeof runAll>['patches'], index: number) {
  const forScene = patches.filter((p) => p.index === index);
  return forScene[forScene.length - 1]?.patch ?? {};
}

describe('VideoOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    studioLogger.clear();
  });

  it('runs the full happy path: submit → poll → download → completed', async () => {
    mockSubmit.mockResolvedValue({ videoId: 'v1' });
    mockCheck.mockResolvedValue({
      status: 'completed',
      progress: 100,
      videoUrl: 'https://cdn/v.mp4',
    });
    mockDownload.mockResolvedValue(new Blob(['data']));

    const { promise, patches } = runAll([scene()]);
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(result.failedIndices).toEqual([]);
    expect(mockSubmit).toHaveBeenCalledOnce();
    // 最终 patch：下载完成态（videoId 在更早的提交成功 patch 中）
    expect(lastPatch(patches, 0)).toMatchObject({ status: 'completed' });
    expect(patches.some((p) => p.index === 0 && p.patch.videoId === 'v1')).toBe(true);
    expect(mockDownload).toHaveBeenCalledWith('https://cdn/v.mp4', undefined, expect.any(Function));
  });

  it('skips completed scenes that still have a valid blob', async () => {
    const { promise } = runAll([scene({ status: 'completed', videoUrl: 'blob:cached' })]);
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('re-downloads completed scenes whose blob is gone (resume)', async () => {
    mockDownload.mockResolvedValue(new Blob(['data']));
    const { promise } = runAll([
      scene({ status: 'completed', remoteVideoUrl: 'https://cdn/v.mp4' }),
    ]);
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(mockDownload).toHaveBeenCalledWith(
      'https://cdn/v.mp4',
      undefined,
      expect.any(Function),
    );
  });

  it('marks completed scenes without cache/URL as downloadFailed', async () => {
    const { promise, patches } = runAll([scene({ status: 'completed' })]);
    const result = await promise;
    // 实现行为：无待执行任务时 runAll 提前返回 ok=true，场景级仍标记 downloadFailed
    expect(result.ok).toBe(true);
    expect(lastPatch(patches, 0)).toMatchObject({ status: 'error', error: 'downloadFailed' });
  });

  it('resumes scenes that already have a videoId (poll only, no submit)', async () => {
    mockCheck.mockResolvedValue({
      status: 'completed',
      progress: 100,
      videoUrl: 'https://cdn/v.mp4',
    });
    mockDownload.mockResolvedValue(new Blob(['data']));
    const { promise } = runAll([scene({ videoId: 'v9', status: 'generating' })]);
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(mockCheck).toHaveBeenCalledWith(
      'key',
      'v9',
      'agnes-video-v2.0',
      'https://apihub.agnes-ai.com',
    );
  });

  it('maps invalid API key on submit to the invalidApiKey scene error', async () => {
    mockSubmit.mockRejectedValue(new VideoApiError('invalid_api_key', 'bad key', 401));
    const { promise, patches } = runAll([scene()]);
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.failedIndices).toEqual([0]);
    expect(lastPatch(patches, 0)).toMatchObject({ status: 'error', error: 'invalidApiKey' });
  });

  it('maps rate limiting on submit to the rateLimited scene error', async () => {
    mockSubmit.mockRejectedValue(new VideoApiError('rate_limited', 'slow down', 429));
    const { promise, patches } = runAll([scene()]);
    const result = await promise;
    expect(lastPatch(patches, 0)).toMatchObject({ status: 'error', error: 'rateLimited' });
    expect(result.ok).toBe(false);
  });

  it('marks the scene failed when the remote reports failed', async () => {
    mockSubmit.mockResolvedValue({ videoId: 'v1' });
    mockCheck.mockResolvedValue({ status: 'failed', progress: 0, videoUrl: null });
    const { promise, patches } = runAll([scene()]);
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(lastPatch(patches, 0)).toMatchObject({ status: 'error', error: 'submitFailed' });
  });

  it('gives up after consecutive polling failures', async () => {
    mockSubmit.mockResolvedValue({ videoId: 'v1' });
    mockCheck.mockRejectedValue(new VideoApiError('network', 'down'));
    const { promise, patches } = runAll([scene()]);
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(mockCheck).toHaveBeenCalledTimes(10);
    expect(lastPatch(patches, 0).status).toBe('error');
  });

  it('maps download failure after a completed poll to downloadFailed', async () => {
    mockSubmit.mockResolvedValue({ videoId: 'v1' });
    mockCheck.mockResolvedValue({
      status: 'completed',
      progress: 100,
      videoUrl: 'https://cdn/v.mp4',
    });
    mockDownload.mockRejectedValue(new VideoApiError('download_error', 'nope'));
    const { promise, patches } = runAll([scene()]);
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(lastPatch(patches, 0)).toMatchObject({ status: 'error', error: 'downloadFailed' });
  });

  it('returns per-scene failure indices for mixed results', async () => {
    mockSubmit.mockResolvedValue({ videoId: 'v1' });
    mockCheck
      .mockResolvedValueOnce({
        status: 'completed',
        progress: 100,
        videoUrl: 'https://cdn/1.mp4',
      })
      .mockRejectedValue(new VideoApiError('network', 'down'));
    mockDownload.mockResolvedValue(new Blob(['d']));

    const { promise } = runAll([scene({ index: 1 }), scene({ index: 2 })]);
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.failedIndices).toEqual([1]);
  });
});
