import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import IdeaInput from '@/studio-core/components/IdeaInput';

const noop = () => {};

const baseProps = {
  idea: 'a cat',
  setIdea: noop,
  sceneCount: 3,
  setSceneCount: noop,
  ratio: '16:9' as const,
  setRatio: noop,
  duration: 8 as const,
  setDuration: noop,
  style: 'cinematic' as const,
  setStyle: noop,
  enableWatermark: false,
  setEnableWatermark: noop,
  model: 'agnes-video-v2.0' as const,
  setModel: noop,
  loading: false,
  onGenerate: noop,
};

function rerenderWith(over: Partial<typeof baseProps>) {
  return render(<IdeaInput {...baseProps} {...over} />);
}

describe('IdeaInput', () => {
  it('输入创意回调 setIdea', async () => {
    const user = userEvent.setup();
    const setIdea = vi.fn();
    rerenderWith({ setIdea });

    await user.type(screen.getByRole('textbox'), 'x');
    expect(setIdea).toHaveBeenLastCalledWith(expect.stringContaining('x'));
  });

  it('创意为空或生成中时生成按钮禁用；loading 显示生成中文案', () => {
    const { unmount } = rerenderWith({ idea: '   ' });
    expect(screen.getByText('generateScript').closest('button')).toBeDisabled();
    unmount();

    rerenderWith({ loading: true });
    expect(screen.getByText('scriptGenerating')).toBeInTheDocument();
    expect(screen.getByText('scriptGenerating').closest('button')).toBeDisabled();
  });

  it('点击生成回调 onGenerate', async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    rerenderWith({ onGenerate });
    await user.click(screen.getByText('generateScript'));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('模型二选一：aria-pressed 高亮，点击切换回调', async () => {
    const user = userEvent.setup();
    const setModel = vi.fn();
    rerenderWith({ model: 'agnes-video-v2.0', setModel });

    // 可访问名称为 "modelV2 modelFree"（label + badge 两个文本节点），用前缀正则区分
    const v2 = screen.getByRole('button', { name: /^modelV2 / });
    const v25 = screen.getByRole('button', { name: /^modelV25Flash / });
    expect(v2).toHaveAttribute('aria-pressed', 'true');
    expect(v25).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('modelV2Desc')).toBeInTheDocument();

    await user.click(v25);
    expect(setModel).toHaveBeenCalledWith('agnes-video-2.5-flash');
  });

  it('场景数 2/3/4/5 可选', async () => {
    const user = userEvent.setup();
    const setSceneCount = vi.fn();
    rerenderWith({ setSceneCount });
    await user.click(screen.getByText('5'));
    expect(setSceneCount).toHaveBeenCalledWith(5);
  });

  it('画面比例三选一', async () => {
    const user = userEvent.setup();
    const setRatio = vi.fn();
    rerenderWith({ setRatio });
    await user.click(screen.getByText('portrait'));
    expect(setRatio).toHaveBeenCalledWith('9:16');
  });

  it('场景时长四选一', async () => {
    const user = userEvent.setup();
    const setDuration = vi.fn();
    rerenderWith({ setDuration });
    await user.click(screen.getByText('duration12'));
    expect(setDuration).toHaveBeenCalledWith(12);
  });

  it('风格五选一（style_<key> 文案）', async () => {
    const user = userEvent.setup();
    const setStyle = vi.fn();
    rerenderWith({ setStyle });
    await user.click(screen.getByText('style_anime'));
    expect(setStyle).toHaveBeenCalledWith('anime');
  });

  it('水印开关切换回调 setEnableWatermark', async () => {
    const user = userEvent.setup();
    const setEnableWatermark = vi.fn();
    rerenderWith({ setEnableWatermark });

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(setEnableWatermark).toHaveBeenCalledWith(true);
  });

  it('loading 时所有选项控件禁用', () => {
    rerenderWith({ loading: true });

    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    for (const name of [/^modelV2 /, /^modelV25Flash /, 'portrait', 'duration12', 'style_anime']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });
});
