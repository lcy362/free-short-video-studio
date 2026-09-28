import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import VideoPreview from '@/studio-core/components/VideoPreview';

describe('VideoPreview', () => {
  it('渲染视频、下载与再做一个按钮', () => {
    const onReset = vi.fn();
    render(<VideoPreview url="blob:https://x/abc" onReset={onReset} />);

    const video = screen.getByRole('button', { name: 'download' }).closest('div')!
      .parentElement!.querySelector('video') as HTMLVideoElement;
    expect(video).toHaveAttribute('src', 'blob:https://x/abc');
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveAttribute('loop');

    expect(screen.getByText('createAnother')).toBeInTheDocument();
    expect(screen.getByText('completedNote')).toBeInTheDocument();
  });

  it('点击下载触发隐藏 <a download> 点击', async () => {
    const user = userEvent.setup();
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toMatch(/^agnes-studio-\d+\.mp4$/);
        expect(this.href).toBe('blob:https://x/abc');
      });

    render(<VideoPreview url="blob:https://x/abc" onReset={() => {}} />);
    await user.click(screen.getByText('download'));

    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });

  it('点击「再做一个」回调 onReset', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(<VideoPreview url="blob:https://x/abc" onReset={onReset} />);

    await user.click(screen.getByText('createAnother'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
