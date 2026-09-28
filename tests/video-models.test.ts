import { describe, it, expect, beforeEach } from 'vitest';
import {
  STUDIO_VIDEO_MODELS,
  DEFAULT_STUDIO_VIDEO_MODEL,
  getStudioModelCap,
  isV25StudioModel,
  loadStudioModel,
  saveStudioModel,
} from '../studio-core/lib/video-models';

describe('video-models', () => {
  it('exports two models with correct protocol flags', () => {
    expect(STUDIO_VIDEO_MODELS).toHaveLength(2);
    expect(STUDIO_VIDEO_MODELS[0].id).toBe('agnes-video-v2.0');
    expect(STUDIO_VIDEO_MODELS[0].isV25).toBe(false);
    expect(STUDIO_VIDEO_MODELS[1].id).toBe('agnes-video-2.5-flash');
    expect(STUDIO_VIDEO_MODELS[1].isV25).toBe(true);
    for (const m of STUDIO_VIDEO_MODELS) {
      expect(m.durations).toEqual([5, 8, 10, 12]);
    }
  });

  it('defaults to v2.0', () => {
    expect(DEFAULT_STUDIO_VIDEO_MODEL).toBe('agnes-video-v2.0');
  });

  it('getStudioModelCap resolves by id and falls back to first model', () => {
    expect(getStudioModelCap('agnes-video-2.5-flash').isV25).toBe(true);
    const fallback = getStudioModelCap('unknown' as never);
    expect(fallback.id).toBe(STUDIO_VIDEO_MODELS[0].id);
  });

  it('isV25StudioModel reflects the model flag', () => {
    expect(isV25StudioModel('agnes-video-v2.0')).toBe(false);
    expect(isV25StudioModel('agnes-video-2.5-flash')).toBe(true);
  });

  describe('localStorage persistence', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('loadStudioModel falls back to default when nothing saved', () => {
      expect(loadStudioModel()).toBe('agnes-video-v2.0');
    });

    it('loadStudioModel falls back on invalid value', () => {
      localStorage.setItem('agnes_studio_model', 'bogus');
      expect(loadStudioModel()).toBe('agnes-video-v2.0');
    });

    it('save + load round-trip', () => {
      saveStudioModel('agnes-video-2.5-flash');
      expect(loadStudioModel()).toBe('agnes-video-2.5-flash');
    });
  });
});
