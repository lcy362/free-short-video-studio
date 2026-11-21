'use client';

import { useTranslations } from 'next-intl';
import BookmarkNudge from './BookmarkNudge';

/**
 * 等待期说明：只在「正在提交 / 轮询 / 编排 / 拼接」时渲染。
 * 公开仓库地址（非私有 ID），随 studio-core 同步到镜像站同样有效。
 */
export const SELF_HOST_URL = 'https://github.com/lcy362/agnes-video-generator';

export default function WaitingNotice() {
  const t = useTranslations('studio');

  return (
    <div className="rounded-xl border border-accent/25 bg-accent/5 p-4" role="status">
      <p className="text-sm font-medium text-ink-2 flex items-center gap-2">
        <svg className="w-4 h-4 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {t('library.waitTitle')}
      </p>
      <p className="mt-2 text-xs text-muted leading-relaxed">{t('library.waitBody')}</p>
      <p className="mt-2 text-xs text-muted leading-relaxed">
        {t('library.waitSelfHost')}{' '}
        {/* 不带 data-smartlink：普通外链不应触发广告跳转 */}
        <a
          href={SELF_HOST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline underline-offset-2 hover:text-ink transition-colors"
        >
          {t('library.waitSelfHostLink')}
        </a>
      </p>
      <BookmarkNudge place="waiting" />
    </div>
  );
}
