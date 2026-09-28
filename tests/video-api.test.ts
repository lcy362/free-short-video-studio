import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  submitVideoWithRetry,
  checkVideoStatus,
  downloadVideoBlob,
  VideoApiError,
} from '../studio-core/lib/video-api';
import { RETRY_BASE_DELAY, MAX_SUBMIT_RETRIES } from '../studio-core/types';

const BASE = 'https://apihub.agnes-ai.com';
const SUBMIT_URL = `${BASE}/v1/videos`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function baseParams(overrides: Record<string, unknown> = {}) {
  return {
    apiKey: 'key-1',
    prompt: 'a cat',
    ratio: '16:9' as const,
    duration: 5,
    model: 'agnes-video-v2.0' as const,
    base: BASE,
    ...overrides,
  };
}

describe('video-api submit (dual protocol)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('v2.0 protocol sends width/height/num_frames/frame_rate', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ video_id: 'vid1' }));
    const { videoId } = await submitVideoWithRetry(baseParams());
    expect(videoId).toBe('vid1');
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(SUBMIT_URL);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      model: 'agnes-video-v2.0',
      prompt: 'a cat',
      width: 1152,
      height: 768,
      num_frames: 121,
      frame_rate: 24,
    });
    expect(body.mode).toBeUndefined();
  });

  it('2.5 protocol sends mode/seconds/size/aspect_ratio', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ task_id: 'tid2' }));
    const { videoId } = await submitVideoWithRetry(
      baseParams({ model: 'agnes-video-2.5-flash' }),
    );
    expect(videoId).toBe('tid2');
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({
      model: 'agnes-video-2.5-flash',
      mode: 'text',
      seconds: '5',
      size: '720P',
      aspect_ratio: '16:9',
    });
    expect(body.width).toBeUndefined();
    expect(body.num_frames).toBeUndefined();
  });

  it('maps 401 to invalid_api_key and does not retry', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 401));
    await expect(submitVideoWithRetry(baseParams())).rejects.toMatchObject({
      code: 'invalid_api_key',
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('maps 429 to rate_limited (retryable, exhausts retries)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 429));
    const p = submitVideoWithRetry(baseParams());
    const expectation = expect(p).rejects.toMatchObject({ code: 'rate_limited' });
    for (let i = 0; i < MAX_SUBMIT_RETRIES; i++) {
      await vi.advanceTimersByTimeAsync(RETRY_BASE_DELAY * (i + 1) + 1);
    }
    await expectation;
  });

  it('wraps upstream errors with the server message (exhausts retries)', async () => {
    // 每次新建 Response：resp.json() 只能消费一次，复用实例会锁定 body
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse({ error: { message: 'boom' } }, 500),
    );
    const p = submitVideoWithRetry(baseParams());
    const expectation = expect(p).rejects.toMatchObject({
      code: 'upstream_error',
      message: expect.stringContaining('boom'),
    });
    for (let i = 0; i < MAX_SUBMIT_RETRIES; i++) {
      await vi.advanceTimersByTimeAsync(RETRY_BASE_DELAY * (i + 1) + 1);
    }
    await expectation;
  });

  it('throws no_video_id when the response has no id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }));
    await expect(submitVideoWithRetry(baseParams())).rejects.toMatchObject({
      code: 'no_video_id',
    });
  });

  it('retries retryable failures with linear backoff then succeeds', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValue(jsonResponse({ video_id: 'ok' }));
    const onAttempt = vi.fn();
    const p = submitVideoWithRetry(baseParams({ onAttempt }));
    await vi.advanceTimersByTimeAsync(RETRY_BASE_DELAY);
    await expect(p).resolves.toMatchObject({ videoId: 'ok' });
    expect(spy).toHaveBeenCalledTimes(2);
    // 首次重试 attempt=0 → 回调收到 1
    expect(onAttempt).toHaveBeenCalledWith(1, RETRY_BASE_DELAY);
  });

  it('gives up after MAX_SUBMIT_RETRIES attempts', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({}, 503));
    const p = submitVideoWithRetry(baseParams());
    const expectation = expect(p).rejects.toBeInstanceOf(VideoApiError);
    for (let i = 0; i < MAX_SUBMIT_RETRIES; i++) {
      await vi.advanceTimersByTimeAsync(RETRY_BASE_DELAY * (i + 1) + 1);
    }
    await expectation;
    expect(spy).toHaveBeenCalledTimes(MAX_SUBMIT_RETRIES);
  });
});

describe('video-api checkVideoStatus', () => {
  afterEach(() => vi.restoreAllMocks());

  it('v2.0 polls without model_name', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ status: 'pending', progress: 10 }));
    const r = await checkVideoStatus('key', 'v1', 'agnes-video-v2.0', BASE);
    expect(r).toEqual({ status: 'pending', progress: 10, videoUrl: null });
    expect(spy.mock.calls[0][0]).toBe(`${BASE}/agnesapi?video_id=v1`);
  });

  it('2.5 polls with model_name', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ status: 'completed', progress: 100, video_url: 'https://x/v.mp4' }),
    );
    const r = await checkVideoStatus('key', 'v2', 'agnes-video-2.5-flash', BASE);
    expect(r.status).toBe('completed');
    expect(r.videoUrl).toBe('https://x/v.mp4');
    expect(spy.mock.calls[0][0]).toBe(
      `${BASE}/agnesapi?video_id=v2&model_name=agnes-video-2.5-flash`,
    );
  });

  it('maps HTTP errors to poll_error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 500));
    await expect(checkVideoStatus('key', 'v1', 'agnes-video-v2.0', BASE)).rejects.toMatchObject({
      code: 'poll_error',
    });
  });
});

describe('video-api downloadVideoBlob', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses the CORS proxy when available', async () => {
    const blob = new Blob(['video']);
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(blob, { status: 200 }),
    );
    const out = await downloadVideoBlob('https://cdn/x.mp4');
    expect(out.size).toBeGreaterThan(0);
    expect(spy.mock.calls[0][0]).toContain('/api/video-download?url=');
  });

  it('falls back to direct fetch when the proxy is unavailable', async () => {
    const blob = new Blob(['video']);
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response(blob, { status: 200 }));
    const out = await downloadVideoBlob('https://cdn/x.mp4');
    expect(out.size).toBeGreaterThan(0);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('throws download_error when every strategy fails', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockRejectedValueOnce(new TypeError('cors blocked'));
    await expect(downloadVideoBlob('https://cdn/x.mp4')).rejects.toMatchObject({
      code: 'download_error',
    });
  });
});
