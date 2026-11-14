import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

import FastRetryControl from '@/studio-core/components/FastRetryControl';

const settings = { auto: false, perMinute: 30, minutes: 3 };

function setup(overrides: Partial<Parameters<typeof FastRetryControl>[0]> = {}) {
  const props = {
    settings,
    onSettingsChange: vi.fn(),
    phase: 'idle' as const,
    attempts: 0,
    remainingMs: 0,
    onStart: vi.fn(),
    onStop: vi.fn(),
    disabled: false,
    ...overrides,
  };
  render(<FastRetryControl {...props} />);
  return props;
}

describe('FastRetryControl · 快速重试面板', () => {
  it('开关反映 auto，点击后回传取反的设置', () => {
    const props = setup();
    const toggle = screen.getByRole('switch', { name: 'video.fastRetryTitle' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);
    expect(props.onSettingsChange).toHaveBeenCalledWith({ ...settings, auto: true });
  });

  it('修改次数与分钟数时按区间收敛并保留另一项', () => {
    const props = setup();
    fireEvent.change(screen.getByDisplayValue('30'), { target: { value: '500' } });
    expect(props.onSettingsChange).toHaveBeenCalledWith({ ...settings, perMinute: 120 });

    fireEvent.change(screen.getByDisplayValue('3'), { target: { value: '0' } });
    expect(props.onSettingsChange).toHaveBeenCalledWith({ ...settings, minutes: 1 });
  });

  it('available 阶段显示一次性开启按钮并回调 onStart', () => {
    const props = setup({ phase: 'available' });
    fireEvent.click(screen.getByRole('button', { name: 'video.fastRetryStart' }));
    expect(props.onStart).toHaveBeenCalled();
  });

  it('active 阶段展示已发次数与剩余时间，停止按钮回调 onStop', () => {
    const props = setup({ phase: 'active', attempts: 12, remainingMs: 65_000 });
    expect(screen.getByText(/errors.fastRetryActive/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'video.fastRetryStop' }));
    expect(props.onStop).toHaveBeenCalled();
    // 运行中不允许改参数
    expect(screen.getByDisplayValue('30')).toBeDisabled();
  });

  it('disabled 时开关与输入不可用', () => {
    setup({ disabled: true });
    expect(screen.getByRole('switch', { name: 'video.fastRetryTitle' })).toBeDisabled();
    expect(screen.getByDisplayValue('30')).toBeDisabled();
  });
});
