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
    const first = render(<BookmarkNudge place="result" />);
    expect(mocked).toHaveBeenCalledWith('bookmark_nudge_shown', { place: 'result' });

    first.unmount();
    render(<BookmarkNudge place="result" />);
    expect(mocked).toHaveBeenCalledTimes(1);

    render(<BookmarkNudge place="prompt" />);
    expect(mocked).toHaveBeenCalledTimes(2);
    expect(mocked).toHaveBeenLastCalledWith('bookmark_nudge_shown', { place: 'prompt' });
  });

  it('关闭结果引导不影响提示词引导，两边各自记住', async () => {
    const user = userEvent.setup();
    const first = render(<BookmarkNudge place="result" />);
    await user.click(screen.getByText('library.bookmarkDismiss'));

    expect(mocked).toHaveBeenLastCalledWith('bookmark_nudge_dismiss', { place: 'result' });
    expect(localStorage.getItem('agnes-bookmark-result-dismissed')).toBe('1');
    expect(document.querySelector('[data-bookmark-nudge="result"]')).toBeNull();

    first.unmount();
    render(<BookmarkNudge place="prompt" />);
    expect(document.querySelector('[data-bookmark-nudge="prompt"]')).toBeInTheDocument();

    await user.click(screen.getByText('library.bookmarkDismiss'));
    expect(localStorage.getItem('agnes-bookmark-prompt-dismissed')).toBe('1');
    expect(document.querySelector('[data-bookmark-nudge="prompt"]')).toBeNull();
  });
});
