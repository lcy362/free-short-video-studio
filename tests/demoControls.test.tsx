import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useMessages: () => ({ demo: { video: { samplePrompts: ['v1'] }, image: { samplePrompts: ['i1'] } } }),
  useLocale: () => 'zh',
}));

import GenerateButton from '@/studio-core/components/GenerateButton';
import ProgressBar from '@/studio-core/components/ProgressBar';
import PromptInput from '@/studio-core/components/PromptInput';
import SelectorGroup from '@/studio-core/components/SelectorGroup';
import ModelPicker from '@/studio-core/components/ModelPicker';
import StudioTabs, { parseStudioTab, STUDIO_TABS, DEFAULT_STUDIO_TAB } from '@/studio-core/StudioTabs';

describe('GenerateButton', () => {
  it('普通状态显示 label，可点击', async () => {
    const onClick = vi.fn();
    render(<GenerateButton onClick={onClick} loading={false} disabled={false} label="生成" loadingLabel="生成中" />);
    const btn = screen.getByRole('button', { name: '生成' });
    expect(btn).toBeEnabled();
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('loading 时换成 loadingLabel 且禁用', () => {
    render(<GenerateButton onClick={vi.fn()} loading disabled={false} label="生成" loadingLabel="生成中" />);
    expect(screen.getByRole('button', { name: '生成中' })).toBeDisabled();
  });

  it('disabled 时不响应点击', async () => {
    const onClick = vi.fn();
    render(<GenerateButton onClick={onClick} loading={false} disabled label="生成" loadingLabel="生成中" />);
    await userEvent.click(screen.getByRole('button', { name: '生成' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('ProgressBar', () => {
  const base = { estimatedMinutes: 5, pollCount: 2, elapsedSeconds: 65, lastPollStatus: 'pending (30%)' };

  it('正常显示百分比、格式化耗时、轮询次数与上游状态', () => {
    render(<ProgressBar {...base} progress={42} />);
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByText('1:05')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('pending (30%)')).toBeInTheDocument();
  });

  it('进度超过 100 / 小于 0 都被夹到 0–100', () => {
    const { rerender } = render(<ProgressBar {...base} progress={180} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
    rerender(<ProgressBar {...base} progress={-12} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('上游状态为空时显示占位符', () => {
    render(<ProgressBar {...base} progress={0} elapsedSeconds={0} lastPollStatus="" />);
    expect(screen.getByText('--')).toBeInTheDocument();
    expect(screen.getByText('0:00')).toBeInTheDocument();
  });
});

describe('PromptInput', () => {
  it('输入时回调并更新字数', async () => {
    const onChange = vi.fn();
    render(<PromptInput value="" onChange={onChange} disabled={false} />);
    const box = screen.getByLabelText('promptLabel');
    await userEvent.type(box, 'abc');
    expect(onChange).toHaveBeenCalled();
    expect(box).toHaveAttribute('maxlength', '2000');
    expect(box).toHaveAttribute('placeholder', 'image.promptPlaceholder');
  });

  it('有建议且为空且可用时显示建议，点击后回填', async () => {
    const onChange = vi.fn();
    render(<PromptInput value="" onChange={onChange} disabled={false} suggestions={['一条提示词']} />);
    const suggestion = screen.getByRole('button', { name: /一条提示词/ });
    await userEvent.click(suggestion);
    expect(onChange).toHaveBeenCalledWith('一条提示词');
  });

  it('已有内容 / 禁用 / 无建议时不显示建议按钮，字数正确', () => {
    const { rerender } = render(<PromptInput value="已有内容" onChange={vi.fn()} disabled={false} suggestions={['一条提示词']} />);
    expect(screen.queryByRole('button', { name: /一条提示词/ })).not.toBeInTheDocument();
    expect(screen.getByText('4/2000')).toBeInTheDocument();

    rerender(<PromptInput value="" onChange={vi.fn()} disabled suggestions={['一条提示词']} />);
    expect(screen.queryByRole('button', { name: /一条提示词/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('promptLabel')).toBeDisabled();

    rerender(<PromptInput value="" onChange={vi.fn()} disabled={false} suggestions={[]} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('可覆盖 placeholderKey', () => {
    render(<PromptInput value="" onChange={vi.fn()} disabled={false} placeholderKey="video.promptPlaceholder" />);
    expect(screen.getByLabelText('promptLabel')).toHaveAttribute('placeholder', 'video.promptPlaceholder');
  });
});

describe('SelectorGroup', () => {
  const options = [
    { value: 'a', label: '选项 A' },
    { value: 'b', labelKey: 'label.b' },
  ];

  it('渲染 label 与两个选项，选中项 aria-pressed=true', () => {
    render(<SelectorGroup label="时长" options={options} value="a" onChange={vi.fn()} disabled={false} />);
    expect(screen.getByText('时长')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '选项 A' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'label.b' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('点击选项回调对应 value；禁用时不触发', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<SelectorGroup label="时长" options={options} value="a" onChange={onChange} disabled={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'label.b' }));
    expect(onChange).toHaveBeenCalledWith('b');

    onChange.mockClear();
    rerender(<SelectorGroup label="时长" options={options} value="a" onChange={onChange} disabled />);
    expect(screen.getByRole('button', { name: '选项 A' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'label.b' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('ModelPicker', () => {
  it('渲染模型、能力卡与档位信息', () => {
    render(<ModelPicker value="agnes-video-2.5-flash" onChange={vi.fn()} disabled={false} />);
    expect(screen.getByRole('button', { name: 'video.modelV25Flash' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('video.modelV25FlashDesc')).toBeInTheDocument();
    expect(screen.getByText('video.freeLimited')).toBeInTheDocument();
    expect(screen.getByText(/4s \/ 5s \/ 6s \/ 8s \/ 10s \/ 12s/)).toBeInTheDocument();
    expect(screen.getByText(/720P/)).toBeInTheDocument();
  });

  it('点击模型回调；禁用时不可点', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<ModelPicker value="agnes-video-2.5-flash" onChange={onChange} disabled={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'video.modelV25Flash' }));
    expect(onChange).toHaveBeenCalledWith('agnes-video-2.5-flash');

    onChange.mockClear();
    rerender(<ModelPicker value="agnes-video-2.5-flash" onChange={onChange} disabled />);
    await userEvent.click(screen.getByRole('button', { name: 'video.modelV25Flash' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('StudioTabs', () => {
  it('渲染三个 tab，激活态与 aria 属性正确', () => {
    render(<StudioTabs active="simple" onChange={vi.fn()} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(screen.getByRole('tab', { name: 'tabs.image' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'tabs.simple' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'tabs.creative' })).toHaveAttribute('aria-controls', 'studio-panel-creative');
    expect(screen.getByText('tabs.simpleHint')).toBeInTheDocument();
  });

  it('点击 tab 回调对应模式，切换后说明文案跟着变', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<StudioTabs active="simple" onChange={onChange} />);
    await userEvent.click(screen.getByRole('tab', { name: 'tabs.image' }));
    expect(onChange).toHaveBeenCalledWith('image');
    await userEvent.click(screen.getByRole('tab', { name: 'tabs.creative' }));
    expect(onChange).toHaveBeenCalledWith('creative');

    rerender(<StudioTabs active="creative" onChange={onChange} />);
    expect(screen.getByText('tabs.creativeHint')).toBeInTheDocument();
  });
});

describe('parseStudioTab', () => {
  it('合法值原样返回，非法值返回 null；顺序固定', () => {
    expect(parseStudioTab('image')).toBe('image');
    expect(parseStudioTab('video')).toBeNull();
    expect(parseStudioTab(null)).toBeNull();
    expect(parseStudioTab('')).toBeNull();
    expect([...STUDIO_TABS]).toEqual(['image', 'simple', 'creative']);
    expect(DEFAULT_STUDIO_TAB).toBe('simple');
  });
});
