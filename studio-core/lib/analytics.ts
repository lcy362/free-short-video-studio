/**
 * 极简 GA 事件上报封装（W7 → 2026-11 扩展为完整漏斗）。
 *
 * - 页面已在 app/[locale]/layout.tsx 通过 next/script 注入 gtag.js（NEXT_PUBLIC_GA_ID）。
 * - gtag.js 未加载（被拦截 / 未配置 / 镜像工程无 GA）时静默降级到 dataLayer.push，永不抛错。
 * - 严禁传 prompt 原文、参考图 URL、API Key 等用户私有内容（隐私约束见 docs/AGNES_VIDEO.md）。
 *
 * 事件契约（上线后禁止改名，否则 GA 历史数据断裂，见 docs/plans/traffic-optimization-plan.md §3）：
 *   demo_video_start / demo_video_success / demo_video_error   —— 视频任务级（单镜 + 多镜）
 *   demo_video_scene_start / _success / _error                 —— 多镜成片的分段级（真实上游生成次数）
 *   demo_video_scene_resume_error                             —— 续轮询（无新提交）失败，不进分段成功率口径
 *   demo_video_abandon / demo_image_abandon                   —— 页面卸载时仍未出片，解释「有 start 无终态」
 *   demo_image_start / demo_image_success / demo_image_error   —— 图像
 *   api_key_saved    / get_key_click                           —— 转化前置动作
 *
 * 两个口径（都按 surface × tab 分组）：
 * - 任务成功率 = demo_video_success / demo_video_start
 *   start 在每次用户发起或重试时 +1（含刷新后用 ?video_id= 恢复），success 在最终出片时 +1。
 * - 分段成功率 = demo_video_scene_success / demo_video_scene_start（仅多镜成片，每段首次提交 +1）。
 *   scene_error 只允许出现在本轮有 scene_start 的段上（error <= start）；续轮询失败另报
 *   demo_video_scene_resume_error，避免用户反复重试失败场景把 error 数刷成 start 的数倍。
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

/** 一次生成是怎么发起的：新任务 / 失败后重试 / 刷新后恢复 */
export type GenerationSource = 'new' | 'retry' | 'resume';

export interface GenerationStartParams {
  tab: StudioTab;
  model?: string;
  mode?: string;
  duration_s?: number;
  ratio?: string;
  /** 是否带了参考图 / 音频 / 首尾帧等素材（只报布尔，不报内容） */
  has_ref_media?: boolean;
  /** 发起来源；缺省 new。retry / resume 用于区分人工重试与 ?video_id= 恢复 */
  source?: GenerationSource;
}

/** 一次生成尝试开始（用户点「生成」/ 手动重试 / ?video_id= 恢复） */
export function trackGenerationStart(p: GenerationStartParams): void {
  const name = p.tab === 'image' ? 'demo_image_start' : 'demo_video_start';
  trackEvent(name, {
    ...baseParams(p.tab),
    model: p.model,
    mode: p.mode,
    duration_s: p.duration_s,
    ratio: p.ratio,
    has_ref_media: p.has_ref_media,
    source: p.source ?? 'new',
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
export function trackGetKeyClick(p: { from: 'panel' | 'error' | 'generate' }): void {
  trackEvent('get_key_click', { surface: currentSurface(), from: p.from });
}

/**
 * 用户在「还没 Key」的生成按钮区点了「去填入 Key」。
 * 用来验证引导卡是否真的把人带到了 Key 面板，而不是只增加曝光。
 */
export function trackApiKeyPanelFocus(p: { tab: 'image' | 'simple' | 'creative' }): void {
  trackEvent('api_key_panel_focus', { surface: currentSurface(), tab: p.tab });
}

/** 用户从 Key 面板打开图文教程（衡量教程是否真的在降低门槛） */
export function trackApiKeyGuideClick(p: { from: 'panel' } = { from: 'panel' }): void {
  trackEvent('api_key_guide_click', { surface: currentSurface(), from: p.from });
}

/** 留存相关动作：作品库操作、收藏引导、「再来一个」 */
export type RetentionAction =
  | 'bookmark_nudge_shown'
  | 'bookmark_nudge_dismiss'
  | 'library_open'
  | 'library_check_result'
  | 'library_resume'
  | 'library_favorite'
  | 'library_delete'
  | 'library_clear'
  | 'create_another_click';

/**
 * 留存漏斗上报。只带动作、位置与任务类型，绝不带 prompt / mediaUrl 等内容。
 * GA 后台可按 place / kind 注册为事件级自定义维度做下钻。
 */
export function trackRetentionEvent(
  action: RetentionAction,
  params: { place?: string; kind?: string; tab?: StudioTab } = {},
): void {
  trackEvent(action, { surface: currentSurface(), ...params });
}

/** 图像生成失败（用于算图像成功率与错误码分布） */
export function trackImageError(p: { code: string; model?: string; elapsed_s?: number }): void {
  trackEvent('demo_image_error', {
    ...baseParams('image'),
    code: p.code,
    model: p.model,
    elapsed_s: p.elapsed_s,
  });
}

export interface GenerationSceneParams {
  /** 场景序号（1 起） */
  scene: number;
  scene_total: number;
  model?: string;
}

/** 多镜成片：某一段视频首次提交（真实上游生成次数，口径与任务级 start 分开） */
export function trackSceneStart(p: GenerationSceneParams): void {
  trackEvent('demo_video_scene_start', {
    ...baseParams('creative'),
    scene: p.scene,
    scene_total: p.scene_total,
    model: p.model,
  });
}

/** 多镜成片：某一段视频出片成功 */
export function trackSceneSuccess(p: GenerationSceneParams): void {
  trackEvent('demo_video_scene_success', {
    ...baseParams('creative'),
    scene: p.scene,
    scene_total: p.scene_total,
    model: p.model,
  });
}

/** 多镜成片：某一段视频失败（code 用于下钻具体原因） */
export function trackSceneError(p: GenerationSceneParams & { code: string }): void {
  trackEvent('demo_video_scene_error', {
    ...baseParams('creative'),
    scene: p.scene,
    scene_total: p.scene_total,
    model: p.model,
    code: p.code,
  });
}

/**
 * 多镜成片：续轮询失败（场景已有 video_id、本轮没有新提交）。
 * 单独事件，不进 scene_success / scene_start 口径，但保留失败码可下钻。
 */
export function trackSceneResumeError(p: GenerationSceneParams & { code: string }): void {
  trackEvent('demo_video_scene_resume_error', {
    ...baseParams('creative'),
    scene: p.scene,
    scene_total: p.scene_total,
    model: p.model,
    code: p.code,
  });
}

export interface GenerationAbandonParams {
  tab: StudioTab;
  model?: string;
  /** 从提交到页面卸载的秒数 */
  elapsed_s?: number;
  /** 是否已有 video_id（有则可凭 ?video_id= 回查结果） */
  has_video_id?: boolean;
  reason?: 'pagehide' | 'visibility_hidden';
}

/**
 * 页面卸载时任务仍无终态：解释「start - success - error」的缺口。
 * 只由 useGenerationAbandon 在 pagehide 时调用，切后台不视为放弃。
 */
export function trackGenerationAbandon(p: GenerationAbandonParams): void {
  const name = p.tab === 'image' ? 'demo_image_abandon' : 'demo_video_abandon';
  trackEvent(name, {
    ...baseParams(p.tab),
    model: p.model,
    elapsed_s: p.elapsed_s,
    has_video_id: !!p.has_video_id,
    reason: p.reason ?? 'pagehide',
  });
}
