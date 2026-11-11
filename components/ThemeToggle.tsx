'use client';

import { useEffect, useState } from 'react';

/**
 * 主题三态切换：system（跟随系统）/ light / dark
 * 与官网 video-website 逻辑完全一致：
 *  localStorage['theme'] ∈ 'system' | 'light' | 'dark'（缺省 system）
 *  → 解析为 light|dark 写到 <html data-theme>
 */
export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme';
const CYCLE: ThemeMode[] = ['system', 'light', 'dark'];

const LABELS: Record<'zh' | 'en', Record<ThemeMode, string>> = {
  zh: { system: '跟随系统', light: '亮色', dark: '暗色' },
  en: { system: 'System', light: 'Light', dark: 'Dark' },
};

function resolveMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'dark';
    }
  }
  return mode;
}

function readStored(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* noop */
  }
  return 'system';
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = resolveMode(mode);
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* noop */
  }
}

const ICONS: Record<ThemeMode, string> = {
  system: 'M8 4h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm-3 12h14',
  light: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  dark: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z',
};

export default function ThemeToggle({
  locale,
  className = '',
}: Readonly<{
  locale: 'zh' | 'en';
  className?: string;
}>) {
  const [mode, setMode] = useState<ThemeMode>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMode(readStored());
    applyTheme(readStored());
    setMounted(true);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (readStored() === 'system') applyTheme('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const cycle = () => {
    const next = CYCLE[(CYCLE.indexOf(mode) + 1) % CYCLE.length];
    setMode(next);
    applyTheme(next);
  };

  const label = LABELS[locale][mode];

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      title={label}
      className={`flex items-center justify-center w-9 h-9 text-ink-2 hover:text-ink hover:bg-paper-2 rounded-lg transition-colors ${className}`}
    >
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        {mounted && (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={ICONS[mode]} />
        )}
      </svg>
    </button>
  );
}
