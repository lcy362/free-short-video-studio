'use client';

import { useCallback, useEffect, useState } from 'react';
import ApiKeyPanel, { useApiKey } from './ApiKeyPanel';
import {
  loadAgnesDomain,
  saveAgnesDomain,
  DEFAULT_AGNES_DOMAIN,
  type AgnesDomainId,
} from './lib/api-domains';
import StudioTabs, { DEFAULT_STUDIO_TAB, parseStudioTab, type StudioTab } from './StudioTabs';
import ImagePanel from './components/ImagePanel';
import VideoPanel from './components/VideoPanel';
import StudioClient from './StudioClient';

/**
 * 免费在线工作台（三模式合一）
 * ─────────────────────────────────────────────────────────────
 * 把原先分开的「在线体验（/demo）」与「网页版创意工作室（/studio）」合并为同一个
 * 工作台组件：图像生成 / 简单视频 / 创意视频 三个 tab，API Key 与域名设置只保留
 * 一份，切换到创意视频时复用原有 StudioClient（embedded 模式，不再重复渲染 Key 面板）。
 *
 * 本组件被三处使用：
 *   1. video-website  app/[locale]/demo/page.tsx      defaultTab="simple"
 *   2. video-website  app/[locale]/studio/page.tsx    defaultTab="creative"
 *   3. free-short-video-studio  components/StudioLanding.tsx（镜像站同一份实现）
 *
 * 三个面板**常驻挂载、仅用 hidden 切换**：这样切 tab 不会中断正在进行的生成
 * （简单视频的轮询、创意视频的逐段编排都在各自组件里跑，卸载即中止）。
 *
 * ⚠️ studio-core/ 同步约束：只允许相对路径 import，文案只用 `studio` / `demo`
 * 两个命名空间（`demo` 由 scripts/sync-studio.mjs 一并抽取到镜像工程）。
 */
export default function StudioWorkspace({
  defaultTab = DEFAULT_STUDIO_TAB,
  syncUrl = true,
}: Readonly<{
  defaultTab?: StudioTab;
  /** 切换 tab 时把 ?tab= 写进地址栏（便于分享 / 回链，纯前端，不触发导航） */
  syncUrl?: boolean;
}>) {
  const { apiKey, hasKey, saveKey, clearKey } = useApiKey();
  const [tab, setTab] = useState<StudioTab>(defaultTab);
  const [domain, setDomain] = useState<AgnesDomainId>(DEFAULT_AGNES_DOMAIN);

  // 域名偏好从 localStorage 恢复（SSR 后水合，避免不一致）
  useEffect(() => {
    setDomain(loadAgnesDomain());
  }, []);

  // 初始 tab 以 URL ?tab= 为准（覆盖 defaultTab），支持 /demo?tab=creative 直达
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const fromUrl = parseStudioTab(new URLSearchParams(window.location.search).get('tab'));
    if (fromUrl) setTab(fromUrl);
  }, []);

  const handleDomainChange = useCallback((id: AgnesDomainId) => {
    setDomain(id);
    saveAgnesDomain(id);
  }, []);

  const handleTabChange = useCallback(
    (next: StudioTab) => {
      setTab(next);
      if (!syncUrl || typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      url.searchParams.set('tab', next);
      window.history.replaceState(null, '', url.toString());
    },
    [syncUrl],
  );

  return (
    <div className="space-y-6">
      <StudioTabs active={tab} onChange={handleTabChange} />

      {/* API Key / 域名：三个模式共用一份设置 */}
      <ApiKeyPanel
        apiKey={apiKey}
        hasKey={hasKey}
        saveKey={saveKey}
        clearKey={clearKey}
        domain={domain}
        onDomainChange={handleDomainChange}
      />

      <div
        className="card-surface rounded-2xl p-6 sm:p-8"
        role="tabpanel"
        id="studio-panel-image"
        aria-labelledby="studio-tab-image"
        hidden={tab !== 'image'}
      >
        <ImagePanel apiKey={apiKey} />
      </div>

      <div
        className="card-surface rounded-2xl p-6 sm:p-8"
        role="tabpanel"
        id="studio-panel-simple"
        aria-labelledby="studio-tab-simple"
        hidden={tab !== 'simple'}
      >
        <VideoPanel apiKey={apiKey} />
      </div>

      {/* 创意视频：复用原 StudioClient（embedded = 隐藏它自带的 Key 面板与未填 Key 提示） */}
      <div role="tabpanel" id="studio-panel-creative" aria-labelledby="studio-tab-creative" hidden={tab !== 'creative'}>
        <StudioClient
          embedded
          apiKey={apiKey}
          hasKey={hasKey}
          domain={domain}
          onDomainChange={handleDomainChange}
        />
      </div>
    </div>
  );
}
