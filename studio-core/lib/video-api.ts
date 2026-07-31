// Agnes Video API 封装（前端直连）
// 用于逐场景文生视频，复用 demo 的提交+轮询逻辑，并增加与原项目一致的重试策略。
//
// 重试策略（对齐 agnes-video-generator/core/api/agnes_video.py）：
//   - 提交：max_retries=5，线性退避 delay = 30 * (attempt + 1)（30/60/90/120/150s）
//     可重试：429 / 5xx / 网络错误 / 超时
//     不可重试：401（Key 无效）/ 400 / 4xx
//   - 轮询：连续失败 10 次才放弃，单次失败继续重试（间隔 POLL_INTERVAL）
//
// ⚠️ CORS 说明：
//   Agnes 视频产出域名（platform-outputs.agnes-ai.space）不返回 CORS 头，
//   前端 fetch 下载会被浏览器拦截。因此 downloadVideoBlob 改用
//   <video> + captureStream + MediaRecorder 录制为 blob（不受 CORS 限制）。

import type { StudioRatio } from '../types';
import {
  STUDIO_RATIO_DIMS,
  POLL_INTERVAL,
  MAX_POLL_TIME,
  MAX_CONSECUTIVE_FAILURES,
  MAX_SUBMIT_RETRIES,
  RETRY_BASE_DELAY,
} from '../types';
import { sleep } from './rate-limiter';

const VIDEO_SUBMIT_URL = 'https://apihub.agnes-ai.com/v1/videos';
const VIDEO_STATUS_URL = 'https://apihub.agnes-ai.com/agnesapi';

/** 5 秒视频的帧数与帧率 */
const DURATION_PRESETS: Record<number, [number, number]> = {
  5: [121, 24],
  10: [241, 24],
};

/** Video API 自定义错误 */
export class VideoApiError extends Error {
  code: string;
  /** HTTP 状态码（网络错误时为 0） */
  status: number;
  constructor(code: string, message: string, status = 0) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = 'VideoApiError';
  }
}

/** 判断错误是否可重试（对齐原项目） */
function isRetryableError(e: unknown): boolean {
  if (e instanceof VideoApiError) {
    if (e.code === 'invalid_api_key') return false;
    if (e.code === 'rate_limited') return true;
    if (e.code === 'network' || e.code === 'timeout') return true;
    if (e.status >= 500) return true;
    if (e.status === 429) return true;
    return false;
  }
  return true;
}

/** 单次提交视频生成任务（不含重试） */
async function submitOnce(
  apiKey: string,
  prompt: string,
  ratio: StudioRatio,
  duration: number = 5,
): Promise<{ videoId: string }> {
  const [numFrames, frameRate] = DURATION_PRESETS[duration] || [121, 24];
  const [width, height] = STUDIO_RATIO_DIMS[ratio];
  const pixels = width * height;
  const maxFrames = pixels > 1280 * 720 ? 169 : pixels > 854 * 480 ? 409 : 961;
  const finalFrames = Math.min(numFrames, maxFrames);

  let resp: Response;
  try {
    resp = await fetch(VIDEO_SUBMIT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'agnes-video-v2.0',
        prompt: prompt.trim(),
        width,
        height,
        num_frames: finalFrames,
        frame_rate: frameRate,
      }),
    });
  } catch {
    throw new VideoApiError('network', 'Network error, please check your connection');
  }

  if (resp.status === 401) {
    throw new VideoApiError('invalid_api_key', 'Invalid API Key', 401);
  }
  if (resp.status === 429) {
    throw new VideoApiError('rate_limited', 'API rate limited, please retry later', 429);
  }
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    const errMsg = data?.error?.message || data?.error || `HTTP ${resp.status}`;
    throw new VideoApiError('upstream_error', String(errMsg).slice(0, 300), resp.status);
  }

  const data = await resp.json();
  const videoId = data?.video_id || data?.task_id || data?.id;
  if (!videoId) {
    throw new VideoApiError('no_video_id', 'No video_id returned', resp.status);
  }
  return { videoId: String(videoId) };
}

/**
 * 提交视频生成任务（含重试）。
 * 线性退避：delay = RETRY_BASE_DELAY * (attempt + 1)，最多 MAX_SUBMIT_RETRIES 次。
 */
export async function submitVideoWithRetry(
  apiKey: string,
  prompt: string,
  ratio: StudioRatio,
  duration: number = 5,
  onAttempt?: (attempt: number, delayMs: number) => void,
  signal?: AbortSignal,
): Promise<{ videoId: string }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_SUBMIT_RETRIES; attempt++) {
    if (signal?.aborted) throw new VideoApiError('aborted', 'Cancelled');
    try {
      return await submitOnce(apiKey, prompt, ratio, duration);
    } catch (e) {
      lastErr = e;
      if (!isRetryableError(e) || attempt === MAX_SUBMIT_RETRIES - 1) {
        throw e;
      }
      const delay = RETRY_BASE_DELAY * (attempt + 1);
      onAttempt?.(attempt + 1, delay);
      const ok = await sleep(delay, signal);
      if (!ok) throw new VideoApiError('aborted', 'Cancelled');
    }
  }
  throw lastErr;
}

/** 保留无重试版本以兼容旧调用 */
export const submitVideo = submitOnce;

/** 查询视频状态 */
export async function checkVideoStatus(
  apiKey: string,
  videoId: string,
): Promise<{
  status: string;
  progress: number;
  videoUrl: string | null;
}> {
  let resp: Response;
  try {
    resp = await fetch(`${VIDEO_STATUS_URL}?video_id=${encodeURIComponent(videoId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch {
    throw new VideoApiError('network', 'Network error, please check your connection');
  }

  if (!resp.ok) {
    throw new VideoApiError('poll_error', `HTTP ${resp.status}`, resp.status);
  }

  const data = await resp.json();
  const apiStatus = (data?.status || 'pending').toLowerCase();
  const apiProgress = data?.progress ?? 0;

  let videoUrl: string | null = null;
  if (apiStatus === 'completed') {
    videoUrl =
      data?.video_url
      || data?.url
      || data?.data?.video_url
      || data?.data?.url
      || data?.result?.video_url
      || data?.result?.url
      || null;
  }

  return { status: apiStatus, progress: apiProgress, videoUrl };
}

/**
 * 通过 Cloudflare Pages Function 代理下载远端视频为 Blob。
 *
 * 为什么需要代理？Agnes 视频产出域名（platform-outputs.agnes-ai.space）
 * 不返回 CORS 头，前端直接 fetch 会被浏览器拦截。
 * Cloudflare Pages Function（functions/api/video-download）在边缘服务端 fetch
 * 并附带 CORS 头返回，绕过浏览器跨域限制。
 *
 * 本地 `next dev` 没有 Pages Function，此代理会 404，
 * 此时降级为直接 fetch（仅本地或支持 CORS 的 URL 可用）。
 *
 * @param videoUrl 远端视频 URL
 * @param signal AbortSignal
 * @param onProgress 进度回调（0-1）
 */
export async function downloadVideoBlob(
  videoUrl: string,
  signal?: AbortSignal,
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  // 方案1：通过 Cloudflare Pages Function 代理下载（生产环境可用）
  const proxyUrl = `/api/video-download?url=${encodeURIComponent(videoUrl)}`;
  try {
    const resp = await fetch(proxyUrl, { signal });
    if (resp.ok) {
      const blob = await resp.blob();
      if (blob.size > 0) return blob;
    }
  } catch {
    // 代理不可用（本地 dev 无 Pages Function），降级
  }

  // 方案2：直接 fetch（仅支持 CORS 的 URL 可用）
  try {
    const resp = await fetch(videoUrl, { signal });
    if (resp.ok) {
      const blob = await resp.blob();
      if (blob.size > 0) return blob;
    }
  } catch {
    // CORS 拦截，继续降级
  }

  // 方案3：所有方案都失败
    throw new VideoApiError(
      'download_error',
      'Video download failed (CORS). In production ensure the Cloudflare Pages Function is deployed; for local dev set NEXT_PUBLIC_VIDEO_PROXY in .env.local or download manually.',
    );
}

/** 轮询配置导出（供组件使用） */
export {
  POLL_INTERVAL,
  MAX_POLL_TIME,
  MAX_CONSECUTIVE_FAILURES,
  MAX_SUBMIT_RETRIES,
  RETRY_BASE_DELAY,
};
