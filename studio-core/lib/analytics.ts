/**
 * 极简 GA 事件上报封装（W7 → 2026-11 扩展为完整漏斗）。
 *
 * - 页面已在 app/[locale]/layout.tsx 通过 next/script 注入 gtag.js（NEXT_PUBLIC_GA_ID）。
 * - gtag.js 未加载（被拦截 / 未配置 / 镜像工程无 GA）时静默降级到 dataLayer.push，永不抛错。
 * - 严禁传 prompt 原文、参考图 URL、API Key 等用户私有内容（隐私约束见 docs/AGNES_VIDEO.md）。
 *
 * 事件契约（上线后禁止改名，否则 GA 历史数据断裂，见 docs/plans/traffic-optimization-plan.md §3）：
 *   demo_video_start   / demo_video_success / demo_video_error   —— 视频（简单 + 创意）
 *   demo_image_start   / demo_image_success                      —— 图像
 *   api_key_saved      / get_key_click                           —— 转化前置动作
 *
 * 成功率 = demo_video_success / demo_video_start（按 surface × tab 分组）。
 */

type EventParams = Record<string, string | number | boolean | undefined>;

/** 工作台所在页面：/studio 下为 studio，其余（含 /demo）为 demo */
export type StudioSurface = 'demo' | 'studio';
/** 三个 tab，与 StudioTabs 的 StudioTab 一一对应（此处不 import，保持 lib 层零依赖） */
export type StudioTab = 'image' | 'simple' | 'creative';

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

/** 从 URL 推断 surface：/zh/studio → studio，/zh/demo → demo */
function currentSurface(): StudioSurface {
  if (typeof window === 'undefined') return 'demo';
  return /\/studio(\/|$)/.test(window.location.pathname) ? 'studio' : 'demo';
}

/** 公共参数：所有工作台事件都带 surface + tab，便于交叉分组 */
function baseParams(tab: StudioTab): EventParams {
  return { surface: currentSurface(), tab };
}

export interface GenerationStartParams {
  tab: StudioTab;
  model?: string;
  mode?: string;
  duration_s?: number;
  ratio?: string;
  /** 是否带了参考图 / 音频 / 首尾帧等素材（只报布尔，不报内容） */
  has_ref_media?: boolean;
}

/** 一次生成尝试开始（用户点「生成」，含手动重试） */
export function trackGenerationStart(p: GenerationStartParams): void {
  const name = p.tab === 'image' ? 'demo_image_start' : 'demo_video_start';
  trackEvent(name, {
    ...baseParams(p.tab),
    model: p.model,
    mode: p.mode,
    duration_s: p.duration_s,
    ratio: p.ratio,
    has_ref_media: p.has_ref_media,
  });
}

export interface GenerationSuccessParams {
  tab: StudioTab;
  model?: string;
  /** 从提交到出片的秒数 */
  elapsed_s?: number;
  /** 本次运行内的重试次数（首次成功为 0） */
  retry_count?: number;
}

/** 一次生成成功出片 */
export function trackGenerationSuccess(p: GenerationSuccessParams): void {
  const name = p.tab === 'image' ? 'demo_image_success' : 'demo_video_success';
  trackEvent(name, {
    ...baseParams(p.tab),
    model: p.model,
    elapsed_s: p.elapsed_s,
    retry_count: p.retry_count,
  });
}

export interface GenerationErrorParams {
  code: string;
  model?: string;
  elapsed_s?: number;
  /** 本次运行内的重试次数（首次即失败为 0） */
  retry_count?: number;
  tab?: StudioTab;
}

/**
 * demo 生成失败事件：用于区分 queue_full / rate_limited / invalid_api_key /
 * pollTimeoutRendering 等真实占比。`code` 需在 GA 后台注册为事件级自定义维度才能下钻。
 */
export function trackDemoError(p: GenerationErrorParams): void {
  trackEvent('demo_video_error', {
    ...baseParams(p.tab ?? 'simple'),
    code: p.code,
    model: p.model,
    elapsed_s: p.elapsed_s,
    retry_count: p.retry_count,
  });
}

/** 用户保存了自己的 API Key（只报事件，绝不报 Key 内容） */
export function trackApiKeySaved(p: { source?: 'manual' | 'prefill' } = {}): void {
  trackEvent('api_key_saved', { surface: currentSurface(), source: p.source ?? 'manual' });
}

/** 用户点击「去获取 Key」（Key 门槛的关键流失点） */
export function trackGetKeyClick(p: { from: 'panel' | 'error' }): void {
  trackEvent('get_key_click', { surface: currentSurface(), from: p.from });
}
