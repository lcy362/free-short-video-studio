/**
 * 快速重试模式（前端直连版）
 * ─────────────────────────────────────────────────────────────
 * 协议对齐源项目 `core/api/fast_retry.py` + `docs/plans/v8.0/fast_retry_auto_PRD.md`：
 *
 * - 上游 503 `video_queue_full` 阶段**不触发 429、不消耗渲染配额**（实测连续 26 次
 *   全部 503、零限流），所以提高探测频率是安全的；
 * - 常规节奏（慢速）5 次 × 30s 保持不变；连续 2 次忙信号后开放快速重试；
 * - 快速重试按「每分钟 x 次、持续 y 分钟」连打，到期自动回到慢速节奏
 *   （并把忙信号计数清零，需重新累计 2 次，天然冷却）；
 * - 手动关闭后本轮不再被自动模式拉起（`autoOff`），重新生成才重置；
 * - 全局开关（是否自动开启 + x / y）持久化在 localStorage，对应源项目的设置页。
 *
 * 本模块只放**纯逻辑**（参数收敛 / 间隔换算 / 下一跳决策）与本地存储读写，
 * 便于单测；请求与计时器留在 `components/VideoPanel.tsx`。
 */

/** 连续多少次忙信号后开放快速重试（源项目 FAST_RETRY_AVAILABLE_AFTER） */
export const FAST_RETRY_AVAILABLE_AFTER = 2;

/** 每分钟次数 x 的合法区间（上限 120 ≈ 每 0.5s 一跳） */
export const FAST_RETRY_MIN_PER_MINUTE = 1;
export const FAST_RETRY_MAX_PER_MINUTE = 120;

/** 持续分钟数 y 的合法区间 */
export const FAST_RETRY_MIN_MINUTES = 1;
export const FAST_RETRY_MAX_MINUTES = 30;

/**
 * 单轮运行内「自动快速重试」最多开启几次窗口。
 *
 * 源项目里快速模式到期后需重新累计忙信号才会再开，理论上可无限循环；官网没有
 * 后台任务页兜底（用户就一直盯着进度条），实测出现过连打 300 次仍不结束的情况。
 * 因此这里封顶 2 个窗口：到期 → 回常规 5 次 → 明确报「队列饱和」，把决定权交回用户。
 */
export const FAST_RETRY_MAX_AUTO_WINDOWS = 2;

/** 默认参数：30 次/分钟（每 2s 一跳）、持续 3 分钟 */
export const FAST_RETRY_DEFAULT_PER_MINUTE = 30;
export const FAST_RETRY_DEFAULT_MINUTES = 3;

/** 常规（慢速）重试：5 次 × 30s，与 W3 上线时的行为一致 */
export const SLOW_RETRY_MAX = 5;
export const SLOW_RETRY_INTERVAL_MS = 30_000;

const SETTINGS_STORAGE_KEY = 'agnes_fast_retry';

/** 快速重试设置（持久化）：auto = 到条件自动开启 */
export interface FastRetrySettings {
  auto: boolean;
  perMinute: number;
  minutes: number;
}

export const DEFAULT_FAST_RETRY_SETTINGS: FastRetrySettings = {
  auto: false,
  perMinute: FAST_RETRY_DEFAULT_PER_MINUTE,
  minutes: FAST_RETRY_DEFAULT_MINUTES,
};

/** 一轮运行内的重试状态（不持久化） */
export interface FastRetryRun {
  /** 连续忙信号次数（收到成功响应即清零） */
  busyStreak: number;
  /** 常规重试已用次数 */
  slowAttempts: number;
  /** 本轮快速重试开始时间戳（0 = 未开启） */
  fastStartedAt: number;
  /** 快速重试已发出次数 */
  fastAttempts: number;
  /** 用户本轮手动关过 → 不再自动拉起 */
  autoOff: boolean;
  /** 本轮已自动开启过几次快速窗口（到 FAST_RETRY_MAX_AUTO_WINDOWS 后不再自动开） */
  autoWindows: number;
}

export const EMPTY_FAST_RETRY_RUN: FastRetryRun = {
  busyStreak: 0,
  slowAttempts: 0,
  fastStartedAt: 0,
  fastAttempts: 0,
  autoOff: false,
  autoWindows: 0,
};

export type RetryDecision =
  /** 走快速节奏（本跳间隔 intervalMs） */
  | { mode: 'fast'; intervalMs: number; startNow: boolean; reason: 'active' | 'started' | 'expired' }
  /** 走常规节奏 */
  | { mode: 'slow'; intervalMs: number; reason: 'slow' | 'expired' }
  /** 两类重试均用尽 */
  | { mode: 'exhausted'; reason: 'exhausted' };

/**
 * 数字收敛：空值 / 非数字回落到 fallback；数值（含 0、负数、小数）按整数处理，
 * 再由调用方夹到区间内（对齐源项目 clamp_params 的「非法输入回落到下限」）。
 */
function toInt(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

/** 把 (x, y) 收敛到合法区间；空值 / 非数字回落到默认值 */
export function clampFastRetryParams(
  perMinute: unknown,
  minutes: unknown,
): { perMinute: number; minutes: number } {
  const px = toInt(perMinute, FAST_RETRY_DEFAULT_PER_MINUTE);
  const py = toInt(minutes, FAST_RETRY_DEFAULT_MINUTES);
  return {
    perMinute: Math.max(FAST_RETRY_MIN_PER_MINUTE, Math.min(FAST_RETRY_MAX_PER_MINUTE, px)),
    minutes: Math.max(FAST_RETRY_MIN_MINUTES, Math.min(FAST_RETRY_MAX_MINUTES, py)),
  };
}

/** 快速模式两跳间隔（毫秒），下限 0.5s（对齐源项目 interval_seconds） */
export function fastRetryIntervalMs(perMinute: number): number {
  const x = Math.max(1, Math.floor(perMinute || 1));
  return Math.max(500, Math.round(60_000 / x));
}

/** 快速模式剩余时间（毫秒，永不为负） */
export function fastRetryRemainingMs(
  startedAt: number,
  minutes: number,
  now: number = Date.now(),
): number {
  if (!startedAt) return 0;
  return Math.max(0, startedAt + minutes * 60_000 - now);
}

/** 剩余时间展示为 m:ss */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * 下一跳怎么重试（纯函数）。
 *
 * 判定顺序：
 * 1. 快速模式进行中且未到期 → fast（intervalMs）
 * 2. 快速模式到期 → 回到慢速，并由调用方清零忙信号计数（冷却）
 * 3. 未开启且「自动」且连续忙信号 ≥2 → 立刻开快速（startNow）
 * 4. 常规重试未用尽 → slow
 * 5. 否则 → exhausted
 */
export function decideRetry(args: {
  settings: FastRetrySettings;
  run: FastRetryRun;
  now?: number;
}): RetryDecision {
  const { settings, run } = args;
  const now = args.now ?? Date.now();
  const params = clampFastRetryParams(settings.perMinute, settings.minutes);
  const intervalMs = fastRetryIntervalMs(params.perMinute);

  if (run.fastStartedAt) {
    if (fastRetryRemainingMs(run.fastStartedAt, params.minutes, now) > 0) {
      return { mode: 'fast', intervalMs, startNow: false, reason: 'active' };
    }
    // 到期：本轮快速模式结束，交回慢速节奏（冷却由调用方清零 busyStreak 实现）
    if (run.slowAttempts < SLOW_RETRY_MAX) {
      return { mode: 'slow', intervalMs: SLOW_RETRY_INTERVAL_MS, reason: 'expired' };
    }
    return { mode: 'exhausted', reason: 'exhausted' };
  }

  // 手动关过（autoOff）或自动窗口已用尽 → 本轮不再自动拉起
  if (
    settings.auto
    && !run.autoOff
    && run.autoWindows < FAST_RETRY_MAX_AUTO_WINDOWS
    && run.busyStreak >= FAST_RETRY_AVAILABLE_AFTER
  ) {
    return { mode: 'fast', intervalMs, startNow: true, reason: 'started' };
  }

  if (run.slowAttempts < SLOW_RETRY_MAX) {
    return { mode: 'slow', intervalMs: SLOW_RETRY_INTERVAL_MS, reason: 'slow' };
  }

  return { mode: 'exhausted', reason: 'exhausted' };
}

/** 是否到了「可手动开启快速重试」的条件 */
export function isFastRetryAvailable(
  run: FastRetryRun,
  settings: FastRetrySettings,
): boolean {
  return (
    !run.fastStartedAt
    && !settings.auto
    && !run.autoOff
    && run.busyStreak >= FAST_RETRY_AVAILABLE_AFTER
  );
}

/** 读取持久化设置（非法值回落默认；localStorage 不可用时返回默认） */
export function loadFastRetrySettings(): FastRetrySettings {
  if (typeof window === 'undefined') return { ...DEFAULT_FAST_RETRY_SETTINGS };
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_FAST_RETRY_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<FastRetrySettings>;
    const params = clampFastRetryParams(parsed.perMinute, parsed.minutes);
    return { auto: parsed.auto === true, ...params };
  } catch {
    return { ...DEFAULT_FAST_RETRY_SETTINGS };
  }
}

/** 写入持久化设置（失败静默：隐私模式 / 配额满不影响生成） */
export function saveFastRetrySettings(settings: FastRetrySettings): void {
  if (typeof window === 'undefined') return;
  const params = clampFastRetryParams(settings.perMinute, settings.minutes);
  try {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ auto: settings.auto, ...params }),
    );
  } catch {
    // 忽略：本地存储不可用时仅失去记忆，不影响本次运行
  }
}
