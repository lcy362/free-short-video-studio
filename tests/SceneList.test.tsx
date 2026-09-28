import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Scene, StudioPhase } from '@/studio-core/types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import SceneList from '@/studio-core/components/SceneList';

const noop = () => {};

function makeScene(over: Partial<Scene> = {}): Scene {
  return {
    index: 1,
    title: 'Opening',
    visualPrompt: 'a cat in space',
    narration: 'hello world',
    status: 'pending',
    ...over,
  } as Scene;
}

function renderList(opts: {
  scenes?: Scene[];
  phase: StudioPhase;
  hasFailedScenes?: boolean;
  allCompleted?: boolean;
}) {
  return render(
    <SceneList
      scenes={opts.scenes ?? [makeScene()]}
      phase={opts.phase}
      hasFailedScenes={opts.hasFailedScenes ?? false}
      allCompleted={opts.allCompleted ?? false}
      onGenerateVideos={noop}
      onRetryFailed={noop}
      onConcatenate={noop}
      onReset={noop}
      onCancel={noop}
    />,
  );
}

describe('SceneList', () => {
  it('script_ready 阶段：生成 + 重置按钮，无取消按钮', async () => {
    const user = userEvent.setup();
    const onGenerateVideos = vi.fn();
    const onReset = vi.fn();
    render(
      <SceneList
        scenes={[makeScene()]}
        phase="script_ready"
        hasFailedScenes={false}
        allCompleted={false}
        onGenerateVideos={onGenerateVideos}
        onRetryFailed={noop}
        onConcatenate={noop}
        onReset={onReset}
        onCancel={noop}
      />,
    );

    await user.click(screen.getByText('startGenerateVideos'));
    expect(onGenerateVideos).toHaveBeenCalledTimes(1);
    await user.click(screen.getByText('reset'));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('cancel')).toBeNull();
  });

  it('videos_generating 阶段：显示取消按钮、完成计数与提示', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <SceneList
        scenes={[
          makeScene({ index: 1, status: 'completed' }),
          makeScene({
            index: 2,
            title: 'S2',
            visualPrompt: 'vp',
            narration: '',
            status: 'generating',
          }),
        ]}
        phase="videos_generating"
        hasFailedScenes={false}
        allCompleted={false}
        onGenerateVideos={noop}
        onRetryFailed={noop}
        onConcatenate={noop}
        onReset={noop}
        onCancel={onCancel}
      />,
    );

    // 文本节点实际为 "1/2 scenesUnit"，用正则匹配前缀
    expect(screen.getByText(/^1\/2/)).toBeInTheDocument();
    expect(screen.getByText('generatingHint')).toBeInTheDocument();
    await user.click(screen.getByText('cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('startGenerateVideos')).toBeNull();
  });

  it('all_videos_ready：全部完成时拼接可用、无重试按钮', async () => {
    const user = userEvent.setup();
    const onConcatenate = vi.fn();
    render(
      <SceneList
        scenes={[makeScene({ status: 'completed' })]}
        phase="all_videos_ready"
        hasFailedScenes={false}
        allCompleted={true}
        onGenerateVideos={noop}
        onRetryFailed={noop}
        onConcatenate={onConcatenate}
        onReset={noop}
        onCancel={noop}
      />,
    );

    const btn = screen.getByText('startConcat');
    expect(btn).toBeEnabled();
    await user.click(btn);
    expect(onConcatenate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('retryFailed')).toBeNull();
  });

  it('all_videos_ready：有失败场景时显示重试按钮且拼接禁用', () => {
    renderList({
      scenes: [makeScene({ status: 'error', error: 'videoFailed' })],
      phase: 'all_videos_ready',
      hasFailedScenes: true,
      allCompleted: false,
    });

    expect(screen.getByText('retryFailed')).toBeInTheDocument();
    expect(screen.getByText('startConcat')).toBeDisabled();
    expect(screen.getByTitle('concatWithFailedHint')).toBeInTheDocument();
  });

  it('场景卡片：generating 状态显示进度百分比与轮询细节', () => {
    renderList({
      scenes: [
        makeScene({
          status: 'generating',
          progress: 50,
          elapsedSeconds: 65,
          pollCount: 3,
          consecutiveFailures: 2,
        }),
      ],
      phase: 'videos_generating',
    });

    expect(screen.getByText(/50%/)).toBeInTheDocument();
    expect(screen.getByText('⏱ 1m5s')).toBeInTheDocument();
    expect(screen.getByText('↻ 3')).toBeInTheDocument();
    expect(screen.getByText('⚠ 2')).toBeInTheDocument();
  });

  it('场景卡片：错误码被翻译为 errors.<code>', () => {
    renderList({
      scenes: [makeScene({ status: 'error', error: 'pollTimeout' })],
      phase: 'all_videos_ready',
      hasFailedScenes: true,
    });
    expect(screen.getByText('errors.pollTimeout')).toBeInTheDocument();
  });

  it('场景卡片：retrying:n:s 错误渲染为 retryingHint', () => {
    renderList({
      scenes: [makeScene({ status: 'error', error: 'retrying:3:120' })],
      phase: 'videos_generating',
    });
    expect(screen.getByText('retryingHint')).toBeInTheDocument();
  });

  it('场景卡片：未知错误码原样展示', () => {
    renderList({
      scenes: [makeScene({ status: 'error', error: 'something broke' })],
      phase: 'videos_generating',
    });
    expect(screen.getByText('something broke')).toBeInTheDocument();
  });

  it('场景卡片：completed 且有 videoUrl 时渲染视频', () => {
    const { container } = renderList({
      scenes: [makeScene({ status: 'completed', videoUrl: 'blob:https://x/v1' })],
      phase: 'all_videos_ready',
      allCompleted: true,
    });
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video).toHaveAttribute('src', 'blob:https://x/v1');
  });

  it('场景卡片：无旁白时不渲染引号行', () => {
    const { container } = renderList({
      scenes: [makeScene({ narration: '' })],
      phase: 'script_ready',
    });
    expect(container.querySelector('.italic')).toBeNull();
  });
});
