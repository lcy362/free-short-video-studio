'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { trackRetentionEvent } from '../lib/analytics';

/** 收藏引导出现的位置，用于埋点下钻 */
export type BookmarkPlace = 'library' | 'waiting' | 'prompt';

const DISMISS_KEY = 'agnes-bookmark-nudge-dismissed';
/** 曝光按「会话 × 位置」去重：组件随状态反复挂载时不应把 shown 刷成人均 6~7 次 */
const SHOWN_PREFIX = 'agnes-bookmark-nudge-shown:';

/**
 * 浏览器收藏引导。
 * ─────────────────────────────────────────────────────────────
 * 纯静态站没有账号与推送，回访最轻的入口就是浏览器书签。
 * 浏览器不允许脚本直接打开「添加书签」对话框，因此这里给出快捷键提示，
 * 由用户自己按 ⌘D / Ctrl+D；移动端没有键盘快捷键时只显示说明。
 *
 * ⚠️ 位于 studio-core/：只用相对路径 import、只用 studio 命名空间。
 */
export default function BookmarkNudge({
  place,
  active = true,
}: Readonly<{
  place: BookmarkPlace;
  /** 由调用方控制「合适时机」（如复制提示词后、生成中、作品库有记录后） */
  active?: boolean;
}>) {
  const t = useTranslations('studio');
  // 首帧统一不显示，挂载后再读 localStorage，避免 SSR / 水合不一致
  const [dismissed, setDismissed] = useState(true);
  const [shortcut, setShortcut] = useState('');

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
    if (!coarse) {
      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
      setShortcut(isMac ? '⌘ + D' : 'Ctrl + D');
    }
  }, []);

  const visible = active && !dismissed;

  useEffect(() => {
    if (!visible) return;
    try {
      const key = SHOWN_PREFIX + place;
      if (sessionStorage.getItem(key) === '1') return;
      sessionStorage.setItem(key, '1');
    } catch {
      // 隐私模式下写不了 sessionStorage，退化为「本次挂载上报一次」
    }
    trackRetentionEvent('bookmark_nudge_shown', { place });
  }, [place, visible]);

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* 隐私模式下写不了，本次会话内仍然隐藏 */
    }
    setDismissed(true);
    trackRetentionEvent('bookmark_nudge_dismiss', { place });
  };

  if (!visible) return null;

  const isPrompt = place === 'prompt';

  return (
    <div className="mt-3 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2.5" data-bookmark-nudge={place}>
      <p className="text-xs font-medium text-ink-2">
        {t(isPrompt ? 'library.bookmarkPromptTitle' : 'library.bookmarkTitle')}
      </p>
      <p className="mt-1 text-xs text-muted leading-relaxed">
        {t(isPrompt ? 'library.bookmarkPromptBody' : 'library.bookmarkBody')}
      </p>
      {shortcut && (
        <p className="mt-1 text-xs text-accent font-mono">
          {t('library.bookmarkShortcut', { key: shortcut })}
        </p>
      )}
      <button
        type="button"
        onClick={handleDismiss}
        className="mt-2 text-xs text-muted hover:text-ink-2 underline underline-offset-2 transition-colors"
      >
        {t('library.bookmarkDismiss')}
      </button>
    </div>
  );
}
