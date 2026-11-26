import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

import LibraryPanel from '@/studio-core/components/LibraryPanel';
import { createLibraryItem, loadLibraryItems } from '@/studio-core/lib/library-store';

describe('LibraryPanel（独立作品库）', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('没有记录时不占首屏', () => {
    const { container } = render(<LibraryPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('图片 / 单镜 / 多镜记录合并展示，并给出对应回访入口', () => {
    createLibraryItem({
      kind: 'image', status: 'completed', title: 'a cat',
      mediaUrl: 'https://example.com/cat.png',
    });
    createLibraryItem({
      kind: 'simple', status: 'error', title: 'waves',
      videoId: 'vid_42', errorCode: 'pollTimeoutQueued',
    });
    createLibraryItem({
      kind: 'creative', status: 'running', title: 'a journey',
      projectRef: 'proj_7', progress: '1/3',
    });

    render(<LibraryPanel />);

    expect(screen.getByRole('region', { name: 'library.title' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('library.kindImage')).toBeInTheDocument();
    expect(screen.getByText('library.kindSimple')).toBeInTheDocument();
    expect(screen.getByText('library.kindCreative')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'library.open' })).toHaveAttribute(
      'href', 'https://example.com/cat.png',
    );
    expect(screen.getByRole('link', { name: 'library.checkResult' })).toHaveAttribute(
      'href', '?tab=simple&video_id=vid_42',
    );
    expect(screen.getByRole('button', { name: 'library.resume' })).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(document.querySelector('[data-bookmark-nudge]')).toBeNull();
  });

  it('多镜「继续」通知外层切换 tab，并发出恢复指令', async () => {
    const user = userEvent.setup();
    const onResumeProject = vi.fn();
    createLibraryItem({ kind: 'creative', status: 'running', title: 'story', projectRef: 'proj_9' });
    render(<LibraryPanel onResumeProject={onResumeProject} />);

    await user.click(screen.getByRole('button', { name: 'library.resume' }));
    expect(onResumeProject).toHaveBeenCalledTimes(1);
  });

  it('收藏可切换，删除与二次确认清空都生效', async () => {
    const user = userEvent.setup();
    createLibraryItem({ kind: 'image', status: 'completed', title: 'a' });
    createLibraryItem({ kind: 'simple', status: 'completed', title: 'b' });
    render(<LibraryPanel />);

    const favButtons = screen.getAllByRole('button', { name: /library.favorite/ });
    await user.click(favButtons[0]);
    await waitFor(() => {
      const pressed = screen.getAllByRole('button', { name: /library.favorite/ })
        .filter((b) => b.getAttribute('aria-pressed') === 'true');
      expect(pressed).toHaveLength(1);
    });

    const deleteButtons = screen.getAllByRole('button', { name: 'library.delete' });
    await user.click(deleteButtons[0]);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));

    await user.click(screen.getByRole('button', { name: 'library.clear' }));
    expect(loadLibraryItems()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'library.clear?' }));
    expect(loadLibraryItems()).toHaveLength(0);
    await waitFor(() => expect(screen.queryByRole('region', { name: 'library.title' })).not.toBeInTheDocument());
  });
});
