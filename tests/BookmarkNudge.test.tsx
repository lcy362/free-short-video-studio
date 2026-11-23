import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

vi.mock('@/studio-core/lib/analytics', () => ({
  trackRetentionEvent: vi.fn(),
}));

import { trackRetentionEvent } from '@/studio-core/lib/analytics';
import BookmarkNudge from '@/studio-core/components/BookmarkNudge';

const mocked = vi.mocked(trackRetentionEvent);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('BookmarkNudge（曝光按会话 × 位置去重）', () => {
  it('同一 place 反复挂载只报一次 shown，不同 place 各报一次', () => {
    const first = render(<BookmarkNudge place="library" />);
    expect(mocked).toHaveBeenCalledWith('bookmark_nudge_shown', { place: 'library' });

    first.unmount();
    render(<BookmarkNudge place="library" />);
    expect(mocked).toHaveBeenCalledTimes(1);

    render(<BookmarkNudge place="waiting" />);
    expect(mocked).toHaveBeenCalledTimes(2);
    expect(mocked).toHaveBeenLastCalledWith('bookmark_nudge_shown', { place: 'waiting' });
  });

  it('关闭后上报 dismiss 并全局隐藏；新会话重新计曝光', async () => {
    const user = userEvent.setup();
    const first = render(<BookmarkNudge place="prompt" />);
    await user.click(screen.getByText('library.bookmarkDismiss'));

    expect(mocked).toHaveBeenLastCalledWith('bookmark_nudge_dismiss', { place: 'prompt' });
    expect(localStorage.getItem('agnes-bookmark-nudge-dismissed')).toBe('1');
    expect(document.querySelector('[data-bookmark-nudge="prompt"]')).toBeNull();

    first.unmount();
    render(<BookmarkNudge place="prompt" />);
    expect(document.querySelector('[data-bookmark-nudge="prompt"]')).toBeNull();
    expect(mocked).toHaveBeenCalledTimes(2);

    localStorage.clear();
    sessionStorage.clear();
    render(<BookmarkNudge place="prompt" />);
    expect(mocked).toHaveBeenCalledTimes(3);
    expect(mocked).toHaveBeenLastCalledWith('bookmark_nudge_shown', { place: 'prompt' });
  });
});
