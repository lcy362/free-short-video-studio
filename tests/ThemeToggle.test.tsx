import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ThemeToggle from '@/components/ThemeToggle';

// 可控的 prefers-color-scheme mock
let prefersDark = false;
const mqListeners = new Set<() => void>();

function stubMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('dark') ? prefersDark : false,
      media: query,
      addEventListener: (_: string, cb: () => void) => mqListeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => mqListeners.delete(cb),
    })),
  );
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    prefersDark = false;
    mqListeners.clear();
    stubMatchMedia();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('挂载后读取 localStorage 并应用到 <html data-theme>', () => {
    localStorage.setItem('theme', 'dark');
    render(<ThemeToggle locale="zh" />);

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    // aria-label 是当前模式的本地化文案
    expect(screen.getByRole('button', { name: '暗色' })).toBeInTheDocument();
  });

  it('system 模式跟随 prefers-color-scheme', () => {
    prefersDark = true;
    render(<ThemeToggle locale="en" />);

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(screen.getByRole('button', { name: 'System' })).toBeInTheDocument();
  });

  it('点击按 system → light → dark → system 轮换并持久化', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle locale="zh" />);

    const btn = screen.getByRole('button');
    await user.click(btn); // system → light
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
    expect(screen.getByRole('button', { name: '亮色' })).toBeInTheDocument();

    await user.click(btn); // light → dark
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');

    await user.click(btn); // dark → system
    expect(localStorage.getItem('theme')).toBe('system');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light'); // 系统为亮色
  });

  it('system 模式下系统主题变化实时跟随', async () => {
    render(<ThemeToggle locale="zh" />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    prefersDark = true;
    for (const cb of mqListeners) cb();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('localStorage 值非法时按 system 处理', () => {
    localStorage.setItem('theme', 'blue');
    render(<ThemeToggle locale="zh" />);
    expect(screen.getByRole('button', { name: '跟随系统' })).toBeInTheDocument();
  });
});
