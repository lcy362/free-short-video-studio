import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import LogPanel from '@/studio-core/components/LogPanel';
import { studioLogger } from '@/studio-core/lib/logger';

describe('LogPanel', () => {
  beforeEach(() => {
    studioLogger.clear();
  });

  it('默认折叠：只显示标题与条数，无日志内容区', () => {
    studioLogger.info('system', 'hello');
    render(<LogPanel />);

    expect(screen.getByText('logPanel')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByText('hello')).toBeNull();
    expect(screen.queryByText('noLogs')).toBeNull();
  });

  it('展开后显示日志：scope 非 system 时展示，raw 以 — 前缀展示', async () => {
    const user = userEvent.setup();
    studioLogger.info('system', 'started');
    studioLogger.error('scene:1', 'boom', 'TypeError: x');
    render(<LogPanel />);

    await user.click(screen.getByText('logPanel'));

    expect(screen.getByText('started')).toBeInTheDocument();
    expect(screen.getByText('scene:1')).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
    expect(screen.getByText('— TypeError: x')).toBeInTheDocument();
    // error 徽标
    expect(screen.getByText(/logErrors/)).toBeInTheDocument();
  });

  it('scope 为 system 时不显示 scope 标签', async () => {
    const user = userEvent.setup();
    studioLogger.info('system', 'only message');
    render(<LogPanel />);
    await user.click(screen.getByText('logPanel'));

    expect(screen.getByText('only message')).toBeInTheDocument();
    expect(screen.queryByText('system')).toBeNull();
  });

  it('warn 徽标按条数显示', async () => {
    const user = userEvent.setup();
    studioLogger.warn('system', 'w1');
    studioLogger.warn('system', 'w2');
    render(<LogPanel />);
    await user.click(screen.getByText('logPanel'));

    expect(screen.getByText('2 logWarnings')).toBeInTheDocument();
  });

  it('展开后可切换 autoScroll 样式态', async () => {
    const user = userEvent.setup();
    render(<LogPanel />);
    await user.click(screen.getByText('logPanel'));

    const btn = screen.getByText('autoScroll');
    const activeClass = 'bg-accent/20';
    expect(btn.className).toContain(activeClass);
    await user.click(btn);
    expect(btn.className).not.toContain(activeClass);
  });

  it('clearLog 清空后显示占位符', async () => {
    const user = userEvent.setup();
    studioLogger.info('system', 'to be cleared');
    render(<LogPanel />);
    await user.click(screen.getByText('logPanel'));

    await user.click(screen.getByText('clearLog'));
    expect(studioLogger.getAll()).toHaveLength(0);
    expect(screen.getByText('noLogs')).toBeInTheDocument();
  });
});
