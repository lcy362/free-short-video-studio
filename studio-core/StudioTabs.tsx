'use client';

import { useTranslations } from 'next-intl';

/**
 * 三种创作模式（=免费在线工作台的三个 tab）
 * ─────────────────────────────────────────────────────────────
 * image    图像生成   文生图（agnes-image-2.1-flash）
 * simple   简单视频   单段文生视频 / 图生视频（Video 2.5 Flash，4–12 秒）
 * creative 创意视频   AI 拆分场景 → 逐段生成 → 浏览器内拼接成片
 *
 * ⚠️ 本文件位于 studio-core/（自包含同步目录）：只能相对路径 import，
 * 文案一律走 `studio` 命名空间，否则镜像工程 free-short-video-studio 会缺 key。
 */
export type StudioTab = 'image' | 'simple' | 'creative';

export const STUDIO_TABS: readonly StudioTab[] = ['image', 'simple', 'creative'];

export const DEFAULT_STUDIO_TAB: StudioTab = 'simple';

/** 把 URL 参数 / 外部字符串安全归一为 tab 值（非法值返回 null，由调用方兜底） */
export function parseStudioTab(value: string | null | undefined): StudioTab | null {
  if (!value) return null;
  return (STUDIO_TABS as readonly string[]).includes(value) ? (value as StudioTab) : null;
}

export default function StudioTabs({
  active,
  onChange,
}: Readonly<{
  active: StudioTab;
  onChange: (tab: StudioTab) => void;
}>) {
  const t = useTranslations('studio');

  return (
    <div className="space-y-2">
      <div
        className="flex p-1 bg-paper-2 border border-rule rounded-xl gap-1"
        role="tablist"
        aria-label={t('tabs.label')}
      >
        {STUDIO_TABS.map((tab) => {
          const selected = active === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`studio-tab-${tab}`}
              aria-selected={selected}
              aria-controls={`studio-panel-${tab}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab)}
              className={`flex-1 px-2 sm:px-4 py-2.5 text-xs sm:text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap ${
                selected
                  ? 'bg-paper-3 text-ink shadow-sm'
                  : 'text-muted hover:text-ink-2'
              }`}
            >
              {t(`tabs.${tab}`)}
            </button>
          );
        })}
      </div>
      {/* 当前模式的定位说明：写清「这一栏生成什么」，避免三个 tab 看起来一样 */}
      <p className="text-center text-xs text-muted leading-relaxed px-1">
        {t(`tabs.${active}Hint`)}
      </p>
    </div>
  );
}
