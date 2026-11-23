import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/studio-core/lib/analytics', () => ({
  trackGenerationAbandon: vi.fn(),
}));

import { trackGenerationAbandon } from '@/studio-core/lib/analytics';
import { useGenerationAbandon } from '@/studio-core/lib/use-generation-abandon';

const mocked = vi.mocked(trackGenerationAbandon);

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/zh/demo');
});

describe('useGenerationAbandon（页面卸载埋点）', () => {
  it('运行中卸载只上报一次，参数含 tab / has_video_id / reason', () => {
    const { unmount } = renderHook(() => useGenerationAbandon({
      active: true,
      tab: 'simple',
      model: 'agnes-video-2.5-flash',
      startedAt: Date.now() - 5000,
      hasVideoId: true,
    }));

    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pagehide'));

    expect(mocked).toHaveBeenCalledTimes(1);
    expect(mocked).toHaveBeenCalledWith(expect.objectContaining({
      tab: 'simple',
      model: 'agnes-video-2.5-flash',
      elapsed_s: expect.any(Number),
      has_video_id: true,
      reason: 'pagehide',
    }));
    unmount();
  });

  it('一轮结束后重新进入运行态，可再次上报', () => {
    const { rerender, unmount } = renderHook(
      ({ active }: { active: boolean }) => useGenerationAbandon({ active, tab: 'creative' }),
      { initialProps: { active: true } },
    );

    window.dispatchEvent(new Event('pagehide'));
    expect(mocked).toHaveBeenCalledTimes(1);

    rerender({ active: false });
    rerender({ active: true });
    window.dispatchEvent(new Event('pagehide'));
    expect(mocked).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('空闲 / 已完成 / 已失败时不误报，卸载后移除监听', () => {
    const { unmount } = renderHook(() => useGenerationAbandon({ active: false, tab: 'image' }));

    window.dispatchEvent(new Event('pagehide'));
    expect(mocked).not.toHaveBeenCalled();

    unmount();
    window.dispatchEvent(new Event('pagehide'));
    expect(mocked).not.toHaveBeenCalled();
  });
});
