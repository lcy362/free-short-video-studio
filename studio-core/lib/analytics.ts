/**
 * 极简 GA 事件上报封装（W7：demo 失败原因观测）。
 *
 * - 页面已在 app/[locale]/layout.tsx 通过 next/script 注入 gtag.js（NEXT_PUBLIC_GA_ID）。
 * - gtag.js 未加载（被拦截 / 未配置）时静默降级到 dataLayer.push，永不抛错。
 * - 严禁传 prompt 原文等用户私有内容（隐私约束见 docs/AGNES_VIDEO.md）。
 */

type EventParams = Record<string, string | number | boolean | undefined>;

export function trackEvent(name: string, params: EventParams = {}): void {
  if (typeof window === 'undefined') return;

  try {
    const w = window as unknown as {
      gtag?: (...args: unknown[]) => void;
      dataLayer?: unknown[];
    };

    if (typeof w.gtag === 'function') {
      w.gtag('event', name, params);
      return;
    }

    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ event: name, ...params });
  } catch {
    // 上报失败不影响主流程
  }
}

/** demo 生成失败事件：用于区分 pollTimeout / upstream_error / videoFailed 等真实占比 */
export function trackDemoError(params: {
  code: string;
  model: string;
  elapsed_s: number;
}): void {
  trackEvent('demo_video_error', params);
}
