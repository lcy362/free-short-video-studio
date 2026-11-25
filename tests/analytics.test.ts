import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  trackDemoError,
  trackGenerationAbandon,
  trackGenerationStart,
  trackGenerationSuccess,
  trackImageError,
  trackSceneError,
  trackSceneResumeError,
  trackSceneStart,
  trackSceneSuccess,
} from '@/studio-core/lib/analytics';

let gtag: ReturnType<typeof vi.fn>;

beforeEach(() => {
  gtag = vi.fn();
  (window as unknown as { gtag?: unknown }).gtag = gtag;
  window.history.replaceState({}, '', '/zh/demo');
});

afterEach(() => {
  delete (window as unknown as { gtag?: unknown }).gtag;
  delete (window as unknown as { dataLayer?: unknown }).dataLayer;
});

describe('任务级视频漏斗', () => {
  it('start 默认 gen_source=new，并区分 surface / tab', () => {
    trackGenerationStart({
      tab: 'simple',
      model: 'agnes-video-2.5-flash',
      mode: 'text',
      duration_s: 5,
    });

    expect(gtag).toHaveBeenCalledWith(
      'event',
      'demo_video_start',
      expect.objectContaining({
        surface: 'demo',
        tab: 'simple',
        model: 'agnes-video-2.5-flash',
        duration_s: 5,
        gen_source: 'new',
      }),
    );
  });

  it('重试与恢复分别标记 gen_source=retry / resume', () => {
    trackGenerationStart({ tab: 'creative', source: 'retry' });
    expect(gtag).toHaveBeenLastCalledWith(
      'event',
      'demo_video_start',
      expect.objectContaining({ tab: 'creative', gen_source: 'retry' }),
    );

    trackGenerationStart({ tab: 'simple', source: 'resume' });
    expect(gtag).toHaveBeenLastCalledWith(
      'event',
      'demo_video_start',
      expect.objectContaining({ tab: 'simple', gen_source: 'resume' }),
    );
  });

  it('success 与 error 使用固定事件名，并带重试次数', () => {
    trackGenerationSuccess({ tab: 'simple', elapsed_s: 42, retry_count: 3 });
    expect(gtag).toHaveBeenLastCalledWith(
      'event',
      'demo_video_success',
      expect.objectContaining({ tab: 'simple', elapsed_s: 42, retry_count: 3 }),
    );

    trackDemoError({ tab: 'creative', code: 'sceneFailed', retry_count: 1 });
    expect(gtag).toHaveBeenLastCalledWith(
      'event',
      'demo_video_error',
      expect.objectContaining({ tab: 'creative', code: 'sceneFailed', retry_count: 1 }),
    );
  });
});

describe('多镜成片分段级漏斗', () => {
  it('每段提交 / 成功 / 失败分别上报，tab 固定 creative', () => {
    trackSceneStart({ scene: 1, scene_total: 3, model: 'agnes-video-2.5-flash' });
    expect(gtag).toHaveBeenLastCalledWith(
      'event',
      'demo_video_scene_start',
      expect.objectContaining({ tab: 'creative', scene: 1, scene_total: 3 }),
    );

    trackSceneSuccess({ scene: 2, scene_total: 3 });
    expect(gtag).toHaveBeenLastCalledWith(
      'event',
      'demo_video_scene_success',
      expect.objectContaining({ tab: 'creative', scene: 2, scene_total: 3 }),
    );

    trackSceneError({ scene: 3, scene_total: 3, code: 'pollTimeout' });
    expect(gtag).toHaveBeenLastCalledWith(
      'event',
      'demo_video_scene_error',
      expect.objectContaining({ tab: 'creative', scene: 3, code: 'pollTimeout' }),
    );
  });
});

describe('图像漏斗', () => {
  it('图像 start / success / error 用独立事件名', () => {
    trackGenerationStart({ tab: 'image', model: 'agnes-image-2.1-flash', ratio: '1024x1024' });
    expect(gtag).toHaveBeenLastCalledWith(
      'event',
      'demo_image_start',
      expect.objectContaining({ tab: 'image', ratio: '1024x1024' }),
    );

    trackGenerationSuccess({ tab: 'image', elapsed_s: 8 });
    expect(gtag).toHaveBeenLastCalledWith(
      'event',
      'demo_image_success',
      expect.objectContaining({ tab: 'image', elapsed_s: 8 }),
    );

    trackImageError({ code: 'no_image_url', model: 'agnes-image-2.1-flash' });
    expect(gtag).toHaveBeenLastCalledWith(
      'event',
      'demo_image_error',
      expect.objectContaining({ tab: 'image', code: 'no_image_url' }),
    );
  });
});

describe('任务放弃与续轮询失败（2026-11-23 口径修正）', () => {
  it('页面卸载时视频 / 图像分别上报 abandon，并带 has_video_id、reason', () => {
    trackGenerationAbandon({ tab: 'simple', model: 'm', elapsed_s: 12, has_video_id: true });
    expect(gtag).toHaveBeenLastCalledWith(
      'event',
      'demo_video_abandon',
      expect.objectContaining({
        tab: 'simple', elapsed_s: 12, has_video_id: true, reason: 'pagehide',
      }),
    );

    trackGenerationAbandon({ tab: 'image' });
    expect(gtag).toHaveBeenLastCalledWith(
      'event',
      'demo_image_abandon',
      expect.objectContaining({ tab: 'image', has_video_id: false, reason: 'pagehide' }),
    );
  });

  it('续轮询失败走独立事件，不污染 scene_error / scene_start 口径', () => {
    trackSceneResumeError({ scene: 2, scene_total: 3, code: 'pollTimeout' });
    expect(gtag).toHaveBeenLastCalledWith(
      'event',
      'demo_video_scene_resume_error',
      expect.objectContaining({ tab: 'creative', scene: 2, scene_total: 3, code: 'pollTimeout' }),
    );
  });
});

describe('降级路径', () => {
  it('gtag 未加载时写入 dataLayer，不抛错', () => {
    delete (window as unknown as { gtag?: unknown }).gtag;
    trackGenerationStart({ tab: 'simple', model: 'm' });

    const layer = (window as unknown as { dataLayer?: Array<Record<string, unknown>> }).dataLayer;
    expect(layer?.at(-1)).toMatchObject({
      event: 'demo_video_start',
      surface: 'demo',
      tab: 'simple',
      gen_source: 'new',
    });
  });

  it('在 /studio 下 surface 推断为 studio', () => {
    window.history.replaceState({}, '', '/zh/studio');
    trackGenerationSuccess({ tab: 'creative' });
    expect(gtag).toHaveBeenLastCalledWith(
      'event',
      'demo_video_success',
      expect.objectContaining({ surface: 'studio', tab: 'creative' }),
    );
  });
});
