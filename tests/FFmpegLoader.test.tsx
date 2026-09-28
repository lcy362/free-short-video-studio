import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import FFmpegLoader from '@/studio-core/components/FFmpegLoader';

describe('FFmpegLoader', () => {
  it('ffmpeg_loading 阶段显示加载文案、旋转图标与进度', () => {
    const { container } = render(
      <FFmpegLoader phase="ffmpeg_loading" progress={0.4} loaded={false} />,
    );

    expect(screen.getByText('ffmpegLoading')).toBeInTheDocument();
    expect(screen.getByText('ffmpegLoadingHint')).toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    const bar = container.querySelector('.h-full.bg-accent') as HTMLElement;
    expect(bar.style.width).toBe('40%');
  });

  it('loaded=true 后不再显示旋转图标，仍为加载文案', () => {
    const { container } = render(
      <FFmpegLoader phase="ffmpeg_loading" progress={1} loaded={true} />,
    );
    expect(container.querySelector('.animate-spin')).toBeNull();
    expect(screen.getByText('ffmpegLoading')).toBeInTheDocument();
  });

  it('concatenating 阶段显示拼接文案与进度', () => {
    render(<FFmpegLoader phase="concatenating" progress={0.75} loaded={true} />);

    expect(screen.getByText('concatenating')).toBeInTheDocument();
    expect(screen.getByText('concatenatingHint')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('进度超过 1 时进度条钳制到 100%（文案显示原始值 150%）', () => {
    const { container } = render(
      <FFmpegLoader phase="concatenating" progress={1.5} loaded={true} />,
    );
    // 组件只钳制进度条宽度，百分比文案显示 Math.round(progress*100)
    expect(screen.getByText('150%')).toBeInTheDocument();
    const bar = container.querySelector('.h-full.bg-accent') as HTMLElement;
    expect(bar.style.width).toBe('100%');
  });
});
