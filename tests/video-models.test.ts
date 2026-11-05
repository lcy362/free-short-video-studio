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
  it('only keeps the 2.5-flash model after v2.0 retirement', () => {
    expect(STUDIO_VIDEO_MODELS).toHaveLength(1);
    expect(STUDIO_VIDEO_MODELS[0].id).toBe('agnes-video-2.5-flash');
    expect(STUDIO_VIDEO_MODELS[0].isV25).toBe(true);
    expect(STUDIO_VIDEO_MODELS[0].durations).toEqual([5, 8, 10, 12]);
  });

  it('defaults to 2.5-flash', () => {
    expect(DEFAULT_STUDIO_VIDEO_MODEL).toBe('agnes-video-2.5-flash');
  });

  it('getStudioModelCap resolves by id and falls back to first model', () => {
    expect(getStudioModelCap('agnes-video-2.5-flash').isV25).toBe(true);
    const fallback = getStudioModelCap('unknown' as never);
    expect(fallback.id).toBe(STUDIO_VIDEO_MODELS[0].id);
  });

  it('isV25StudioModel reflects the model flag', () => {
    expect(isV25StudioModel('agnes-video-2.5-flash')).toBe(true);
  });

  describe('localStorage persistence', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('loadStudioModel falls back to default when nothing saved', () => {
      expect(loadStudioModel()).toBe('agnes-video-2.5-flash');
    });

    it('loadStudioModel falls back on the retired v2.0 value', () => {
      localStorage.setItem('agnes_studio_model', 'agnes-video-v2.0');
      expect(loadStudioModel()).toBe('agnes-video-2.5-flash');
    });

    it('loadStudioModel falls back on invalid value', () => {
      localStorage.setItem('agnes_studio_model', 'bogus');
      expect(loadStudioModel()).toBe('agnes-video-2.5-flash');
    });

    it('save + load round-trip', () => {
      saveStudioModel('agnes-video-2.5-flash');
      expect(loadStudioModel()).toBe('agnes-video-2.5-flash');
    });
  });
});
