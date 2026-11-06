import { afterEach, describe, expect, it, vi } from 'vitest';
import { trackEvent, trackDemoError } from '@/studio-core/lib/analytics';
import { fetchWithFailback } from '@/studio-core/lib/api-client';
import {
  DEFAULT_VIDEO_MODEL,
  SIZE_OPTIONS,
  VIDEO_MODELS,
  formatRatioLabel,
  getModelCap,
  isV25VideoModel,
  type VideoModelId,
} from '@/studio-core/lib/demo-types';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (window as unknown as { gtag?: unknown }).gtag;
  delete (window as unknown as { dataLayer?: unknown }).dataLayer;
});

describe('analytics.trackEvent', () => {
  it('gtag 存在时走 gtag(event, name, params)', () => {
    const gtag = vi.fn();
    (window as unknown as { gtag: unknown }).gtag = gtag;
    trackEvent('demo_video_error', { code: 'network' });
    expect(gtag).toHaveBeenCalledWith('event', 'demo_video_error', { code: 'network' });
  });

  it('gtag 不存在时降级到 dataLayer.push，且复用已有数组', () => {
    const dataLayer: unknown[] = [{ existing: true }];
    (window as unknown as { dataLayer: unknown[] }).dataLayer = dataLayer;
    trackEvent('copy_prompt');
    expect(dataLayer).toHaveLength(2);
    expect(dataLayer[1]).toEqual({ event: 'copy_prompt' });
  });

  it('dataLayer 也不存在时自动创建', () => {
    trackEvent('tab_switch', { tab: 'image' });
    const layer = (window as unknown as { dataLayer: unknown[] }).dataLayer;
    expect(layer).toEqual([{ event: 'tab_switch', tab: 'image' }]);
  });

  it('上报抛错时静默吞掉，不影响主流程', () => {
    (window as unknown as { gtag: unknown }).gtag = () => {
      throw new Error('blocked');
    };
    expect(() => trackEvent('blocked')).not.toThrow();
  });

  it('服务端（window 不存在）直接返回', () => {
    vi.stubGlobal('window', undefined);
    expect(() => trackEvent('noop')).not.toThrow();
  });

  it('trackDemoError 使用固定事件名并透传字段', () => {
    const gtag = vi.fn();
    (window as unknown as { gtag: unknown }).gtag = gtag;
    trackDemoError({ code: 'pollTimeout', model: 'agnes-video-2.5-flash', elapsed_s: 42 });
    expect(gtag).toHaveBeenCalledWith('event', 'demo_video_error', {
      code: 'pollTimeout',
      model: 'agnes-video-2.5-flash',
      elapsed_s: 42,
    });
  });
});

describe('api-client.fetchWithFailback', () => {
  const init: RequestInit = { method: 'POST' };

  it('zh 首选 .cn，非 zh 首选 .com', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }));
    await fetchWithFailback('/v1/videos', init, 'zh');
    expect(String(spy.mock.calls[0][0])).toContain('https://apihub.agnes-ai.cn/v1/videos');

    spy.mockClear();
    await fetchWithFailback('/v1/videos', init, 'en');
    expect(String(spy.mock.calls[0][0])).toContain('https://apihub.agnes-ai.com/v1/videos');
  });

  it('首选域名网络错误时只重试一次备用域名', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const resp = await fetchWithFailback('/v1/images/generations', init, 'zh');
    expect(resp.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(String(spy.mock.calls[1][0])).toContain('https://apihub.agnes-ai.com/v1/images/generations');
  });

  it('两个域名都失败时抛出首选域名的错误', async () => {
    const primaryError = new TypeError('primary down');
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(primaryError)
      .mockRejectedValueOnce(new TypeError('fallback down'));
    await expect(fetchWithFailback('/v1/videos', init, 'en')).rejects.toBe(primaryError);
  });

  it('HTTP 错误响应是有效响应，不触发域名切换', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'bad' }, 500));
    const resp = await fetchWithFailback('/v1/videos', init, 'zh');
    expect(resp.status).toBe(500);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('demo-types', () => {
  it('常量：只有 2.5-flash 一个模型，三种图片尺寸，六种比例', () => {
    expect(DEFAULT_VIDEO_MODEL).toBe('agnes-video-2.5-flash');
    expect(VIDEO_MODELS).toHaveLength(1);
    expect(SIZE_OPTIONS.map((o) => o.value)).toEqual(['1024x1024', '1152x768', '768x1360']);
    expect(VIDEO_MODELS[0].ratios).toHaveLength(6);
    expect(VIDEO_MODELS[0].durations).toEqual(['4', '5', '6', '8', '10', '12']);
  });

  it('formatRatioLabel：2.5 系列比例保真但只标注 720P，exactPixels 时只给比例', () => {
    const cap = VIDEO_MODELS[0];
    const t = (k: string) => `T:${k}`;
    expect(formatRatioLabel(cap, { labelKey: 'landscape' }, t)).toBe('T:landscape · 720P');
    expect(formatRatioLabel({ ...cap, exactPixels: true }, { labelKey: 'landscape' }, t)).toBe('T:landscape');
  });

  it('getModelCap 命中已知模型，未知模型回退到第一个', () => {
    expect(getModelCap('agnes-video-2.5-flash').id).toBe('agnes-video-2.5-flash');
    expect(getModelCap('unknown-model' as VideoModelId).id).toBe('agnes-video-2.5-flash');
    expect(isV25VideoModel('agnes-video-2.5-flash')).toBe(true);
  });
});
