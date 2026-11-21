'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  clearLibraryItems,
  deleteLibraryItem,
  loadLibraryItems,
  requestStudioResume,
  subscribeLibrary,
  toggleLibraryFavorite,
  type LibraryItem,
  type LibraryKind,
  type LibraryStatus,
} from '../lib/library-store';
import { trackRetentionEvent } from '../lib/analytics';
import BookmarkNudge from './BookmarkNudge';

const KIND_KEY: Record<LibraryKind, string> = {
  image: 'kindImage',
  simple: 'kindSimple',
  creative: 'kindCreative',
};

const STATUS_KEY: Record<LibraryStatus, string> = {
  running: 'statusRunning',
  completed: 'statusCompleted',
  error: 'statusError',
};

/**
 * 独立作品库模块：图片 / 单镜短片 / 多镜成片的任务记录合并展示。
 * ─────────────────────────────────────────────────────────────
 * 与三个面板解耦：面板只往 library-store 写状态，这里订阅变化统一渲染。
 * 因此它挂在 StudioWorkspace（三 tab 之外），不再依附多镜成片的 idle 阶段。
 */
export default function LibraryPanel({
  onResumeProject,
}: Readonly<{
  /** 恢复多镜项目时把工作台切到 creative tab（由外层统一管理 tab 状态） */
  onResumeProject?: () => void;
}> = {}) {
  const t = useTranslations('studio');
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    const refresh = () => setItems(loadLibraryItems());
    refresh();
    return subscribeLibrary(refresh);
  }, []);

  const handleResume = (item: LibraryItem) => {
    if (!item.projectRef) return;
    trackRetentionEvent('library_resume', { place: 'library', kind: item.kind });
    onResumeProject?.();
    requestStudioResume(item.projectRef);
  };

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    clearLibraryItems();
    setItems([]);
    setConfirmClear(false);
    trackRetentionEvent('library_clear', { place: 'library' });
  };

  // 新用户没有记录时不占首屏；一旦生成过任意类型作品，作品库自动出现
  if (items.length === 0) return null;

  return (
    <section className="card-surface rounded-2xl p-5 sm:p-6" aria-label={t('library.title')}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-base font-semibold text-ink flex items-center gap-2">
          <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7zm5 3h6m-6 4h4" />
          </svg>
          {t('library.title')}
          <span className="text-xs font-normal text-muted">({items.length})</span>
        </h2>
        <button
          type="button"
          onClick={handleClear}
          className="text-xs text-muted hover:text-danger transition-colors"
        >
          {confirmClear ? `${t('library.clear')}?` : t('library.clear')}
        </button>
      </div>
      <p className="text-xs text-muted leading-relaxed mb-3">{t('library.subtitle')}</p>

      <ul className="space-y-2 max-h-80 overflow-y-auto pe-1">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-rule bg-paper"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-ink-2 truncate" title={item.title}>
                {item.title || t('library.title')}
              </p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-muted">
                <span className="text-accent">{t(`library.${KIND_KEY[item.kind]}`)}</span>
                <span>·</span>
                <span>{t(`library.${STATUS_KEY[item.status]}`)}</span>
                {item.progress && <><span>·</span><span>{item.progress}</span></>}
                <span>·</span>
                <span>{new Date(item.updatedAt).toLocaleString()}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {item.status === 'completed' && item.mediaUrl && (
                <a
                  href={item.mediaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackRetentionEvent('library_open', { place: 'library', kind: item.kind })}
                  className="text-xs px-2.5 py-1 bg-accent/15 text-accent rounded hover:bg-accent/25 transition"
                >
                  {t('library.open')}
                </a>
              )}
              {item.videoId && (
                <a
                  href={`?tab=simple&video_id=${encodeURIComponent(item.videoId)}`}
                  onClick={() => trackRetentionEvent('library_check_result', { place: 'library', kind: item.kind })}
                  className="text-xs px-2.5 py-1 bg-paper-3 text-ink-2 rounded hover:bg-paper-2 transition"
                >
                  {t('library.checkResult')}
                </a>
              )}
              {item.kind === 'creative' && item.projectRef && (
                <button
                  type="button"
                  onClick={() => handleResume(item)}
                  className="text-xs px-2.5 py-1 bg-paper-3 text-ink-2 rounded hover:bg-paper-2 transition"
                >
                  {t('library.resume')}
                </button>
              )}
              <button
                type="button"
                aria-pressed={!!item.favorite}
                onClick={() => {
                  toggleLibraryFavorite(item.id);
                  trackRetentionEvent('library_favorite', { place: 'library', kind: item.kind });
                }}
                className={`text-xs px-2 py-1 rounded transition ${item.favorite ? 'text-accent bg-accent/10' : 'text-muted hover:text-ink-2'}`}
              >
                {item.favorite ? '★' : '☆'} {t('library.favorite')}
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteLibraryItem(item.id);
                  trackRetentionEvent('library_delete', { place: 'library', kind: item.kind });
                }}
                className="text-xs px-2 py-1 text-danger hover:bg-danger/10 rounded transition"
              >
                {t('library.delete')}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <BookmarkNudge place="library" />
    </section>
  );
}
