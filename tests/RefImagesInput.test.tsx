import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import RefImagesInput from '@/studio-core/components/RefImagesInput';

const img = (n: number) => ({ dataUrl: `data:image/png;base64,R${n}`, name: `r${n}.png` });

describe('RefImagesInput · 多图输入', () => {
  it('展示已选张数、序号徽标与剩余可加位', () => {
    render(
      <RefImagesInput
        label="video.refImage"
        items={[img(1), img(2)]}
        max={5}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        disabled={false}
        hint="hint"
      />,
    );

    expect(screen.getByText('2/5')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('hint')).toBeInTheDocument();
    // 未达上限 → 仍可添加
    expect(document.querySelector('input[type="file"]')).not.toBeNull();
  });

  it('达到上限后隐藏添加入口', () => {
    render(
      <RefImagesInput
        label="video.refImage"
        items={[img(1), img(2)]}
        max={2}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        disabled={false}
      />,
    );

    expect(screen.getByText('2/2')).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('首尾帧模式展示槽位标签', () => {
    render(
      <RefImagesInput
        label="video.refImage"
        items={[img(1), img(2)]}
        max={2}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        disabled={false}
        slotLabels={['video.firstFrame', 'video.lastFrame']}
      />,
    );

    expect(screen.getByText('video.firstFrame')).toBeInTheDocument();
    expect(screen.getByText('video.lastFrame')).toBeInTheDocument();
  });

  it('点击移除按序号回调 onRemove', () => {
    const onRemove = vi.fn();
    render(
      <RefImagesInput
        label="video.refImage"
        items={[img(1), img(2)]}
        max={5}
        onAdd={vi.fn()}
        onRemove={onRemove}
        disabled={false}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /video.clearImage/ })[1]);
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it('disabled 时不显示移除按钮', () => {
    render(
      <RefImagesInput
        label="video.refImage"
        items={[img(1)]}
        max={5}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        disabled
      />,
    );

    expect(screen.queryByRole('button', { name: /video.clearImage/ })).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});
