/**
 * 队列重试策略（前端直连版，对齐源项目 v8.2 / v8.3 / v8.4）
 * ─────────────────────────────────────────────────────────────
 * 权威来源：
 * - `docs/plans/v7.7/fast_retry_PRD.md`（快速重试本体）
 * - `docs/plans/v8.0/fast_retry_auto_PRD.md`（自动开启）
 * - `docs/plans/v8.3/long_task_mode_PRD.md`（长任务等待预算）
 * - `docs/plans/v8.4/fast_retry_chain_PRD.md`（两轮自动接力）
 *
 * 三个开关的分工（与源站一致）：
 * - 快速重试：决定「多久打一次」。一轮 y 分钟（默认 3），按 x 次/分钟连打；
 *   到期后进入接力等待，距到期满 intervalMinutes（默认 5）后的下一个忙信号自动开新一轮。
 * - 长任务模式：决定「总共等多久」。默认关闭，开启后把「忙轨次数封顶」换成
 *   「累计忙轨等待预算」（默认 60 分钟，5–480），成功即结束。
 * - auto：决定「第一次要不要自己开」。手动开启的轮次同样参与接力。
 *
 * 关键事实：上游 503 `video_queue_full` 阶段**不触发 429、不消耗渲染配额**
 * （源站实测连续 26 次全部 503、零限流），所以提高探测频率是安全的。
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

/** 默认参数：30 次/分钟（每 2s 一跳）、持续 3 分钟 */
export const FAST_RETRY_DEFAULT_PER_MINUTE = 30;
export const FAST_RETRY_DEFAULT_MINUTES = 3;

/** v8.4 两轮快速重试之间的常规节奏间隔（分钟） */
export const FAST_RETRY_MIN_INTERVAL_MINUTES = 1;
export const FAST_RETRY_MAX_INTERVAL_MINUTES = 60;
export const FAST_RETRY_DEFAULT_INTERVAL_MINUTES = 5;

/** v8.3 长任务等待预算（分钟） */
export const LONG_TASK_MIN_MINUTES = 5;
export const LONG_TASK_MAX_MINUTES = 480;
export const LONG_TASK_DEFAULT_MINUTES = 60;
/** 设置面板的步进（源站设置页 5 分钟一档） */
export const LONG_TASK_STEP_MINUTES = 5;

/** 常规（慢速）忙轨：5 次 × 30s。仅在从未进入快速重试时作为次数封顶 */
export const SLOW_RETRY_MAX = 5;
export const SLOW_RETRY_INTERVAL_MS = 30_000;

const SETTINGS_STORAGE_KEY = 'agnes_fast_retry';

/** 快速重试 + 长任务设置（持久化）：auto = 到条件自动开启 */
export interface FastRetrySettings {
  auto: boolean;
  perMinute: number;
  minutes: number;
  /** 两轮快速重试之间的间隔（分钟），v8.4 */
  intervalMinutes: number;
  /** 长任务模式开关，v8.3 */
  longTask: boolean;
  /** 长任务累计等待预算（分钟） */
  longTaskMinutes: number;
}

/** 一轮运行内的重试状态（不持久化） */
export interface FastRetryRun {
  /** 连续忙信号次数（收到成功响应即清零） */
  busyStreak: number;
  /** 常规重试已用次数（仅未进入快速重试时用于封顶） */
  slowAttempts: number;
  /** 本轮快速重试开始时间戳（0 = 未开启） */
  fastStartedAt: number;
  /** 快速重试已发出次数 */
  fastAttempts: number;
  /** 用户本轮手动关过 → 不再自动拉起 */
  autoOff: boolean;
  /** v8.4 接力等待中（上一轮快速窗口已到期） */
  chainPending: boolean;
  /** 上一轮到期时刻（接力计时起点） */
  chainStartedAt: number;
  /** 已自动接力的轮数（含手动开的轮次） */
  rounds: number;
  /** v8.3 累计忙轨等待（毫秒）：长任务预算口径，只在排队等待时累加 */
  busyWaitedMs: number;
}

export const EMPTY_FAST_RETRY_RUN: FastRetryRun = {
  busyStreak: 0,
  slowAttempts: 0,
  fastStartedAt: 0,
  fastAttempts: 0,
  autoOff: false,
  chainPending: false,
  chainStartedAt: 0,
  rounds: 0,
  busyWaitedMs: 0,
};

export const DEFAULT_FAST_RETRY_SETTINGS: FastRetrySettings = {
  auto: false,
  perMinute: FAST_RETRY_DEFAULT_PER_MINUTE,
  minutes: FAST_RETRY_DEFAULT_MINUTES,
  intervalMinutes: FAST_RETRY_DEFAULT_INTERVAL_MINUTES,
  longTask: false,
  longTaskMinutes: LONG_TASK_DEFAULT_MINUTES,
};

export type RetryDecision =
  /** 走快速节奏（本跳间隔 intervalMs） */
  | {
      mode: 'fast';
      intervalMs: number;
      startNow: boolean;
      reason: 'active' | 'started' | 'chained';
    }
  /** 走常规节奏 */
  | { mode: 'slow'; intervalMs: number; reason: 'slow' | 'expired' }
  /** 两类重试均用尽 */
  | { mode: 'exhausted'; reason: 'exhausted' | 'budget' };

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

/** 两轮间隔收敛（1–60 分钟，非法值回落到默认 5） */
export function clampFastRetryInterval(value: unknown): number {
  const v = toInt(value, FAST_RETRY_DEFAULT_INTERVAL_MINUTES);
  return Math.max(
    FAST_RETRY_MIN_INTERVAL_MINUTES,
    Math.min(FAST_RETRY_MAX_INTERVAL_MINUTES, v),
  );
}

/** 长任务预算收敛（5–480 分钟，非法值回落到默认 60） */
export function clampLongTaskMinutes(value: unknown): number {
  const v = toInt(value, LONG_TASK_DEFAULT_MINUTES);
  return Math.max(LONG_TASK_MIN_MINUTES, Math.min(LONG_TASK_MAX_MINUTES, v));
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

/** 接力等待剩余时间：距「可以开下一轮」还有多久（毫秒，永不为负） */
export function fastRetryChainRemainingMs(
  chainStartedAt: number,
  intervalMinutes: number,
  now: number = Date.now(),
): number {
  if (!chainStartedAt) return 0;
  const gap = clampFastRetryInterval(intervalMinutes) * 60_000;
  return Math.max(0, chainStartedAt + gap - now);
}

/** 长任务预算剩余（毫秒，永不为负）；未开启返回 0 */
export function longTaskRemainingMs(
  run: FastRetryRun,
  settings: FastRetrySettings,
): number {
  if (!settings.longTask) return 0;
  const budget = clampLongTaskMinutes(settings.longTaskMinutes) * 60_000;
  return Math.max(0, budget - run.busyWaitedMs);
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
 * 判定顺序（对齐源站状态机）：
 * 1. 快速模式进行中且未到期 → fast（intervalMs）
 * 2. 快速模式到期 → slow（expired），由调用方置 chainPending 并从此刻起算接力间隔
 * 3. 接力等待中且距到期已满 intervalMinutes → fast（chained，沿用本任务参数）
 * 4. 接力等待中未满 → slow（chain_wait）；接力期间不再按次数封顶
 * 5. 未开过快速模式：auto 且连续忙信号 ≥2 → 立刻开快速（started）
 * 6. 否则按常规忙轨，次数未用尽 → slow；用尽 → exhausted
 *
 * 长任务模式：只要预算未耗尽，忙轨不设次数上限；预算耗尽即 budget（最终队列饱和）。
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
  const gapMs = clampFastRetryInterval(settings.intervalMinutes) * 60_000;
  const budgetMs = clampLongTaskMinutes(settings.longTaskMinutes) * 60_000;
  const budgetExhausted = settings.longTask === true && run.busyWaitedMs >= budgetMs;

  if (run.fastStartedAt) {
    if (fastRetryRemainingMs(run.fastStartedAt, params.minutes, now) > 0) {
      return { mode: 'fast', intervalMs, startNow: false, reason: 'active' };
    }
    if (budgetExhausted) return { mode: 'exhausted', reason: 'budget' };
    // 到期：本轮结束，交回常规节奏；调用方置 chainPending + chainStartedAt
    return { mode: 'slow', intervalMs: SLOW_RETRY_INTERVAL_MS, reason: 'expired' };
  }

  if (run.chainPending) {
    if (budgetExhausted) return { mode: 'exhausted', reason: 'budget' };
    if (run.chainStartedAt && now - run.chainStartedAt >= gapMs) {
      return { mode: 'fast', intervalMs, startNow: true, reason: 'chained' };
    }
    // 接力等待：不再按次数封顶，直到成功 / 手动关闭 / 预算耗尽
    return { mode: 'slow', intervalMs: SLOW_RETRY_INTERVAL_MS, reason: 'slow' };
  }

  if (
    settings.auto
    && !run.autoOff
    && run.busyStreak >= FAST_RETRY_AVAILABLE_AFTER
  ) {
    if (budgetExhausted) return { mode: 'exhausted', reason: 'budget' };
    return { mode: 'fast', intervalMs, startNow: true, reason: 'started' };
  }

  if (settings.longTask === true || run.slowAttempts < SLOW_RETRY_MAX) {
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
    && !run.chainPending
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
    return {
      auto: parsed.auto === true,
      ...params,
      intervalMinutes: clampFastRetryInterval(parsed.intervalMinutes),
      longTask: parsed.longTask === true,
      longTaskMinutes: clampLongTaskMinutes(parsed.longTaskMinutes),
    };
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
      JSON.stringify({
        auto: settings.auto,
        ...params,
        intervalMinutes: clampFastRetryInterval(settings.intervalMinutes),
        longTask: settings.longTask === true,
        longTaskMinutes: clampLongTaskMinutes(settings.longTaskMinutes),
      }),
    );
  } catch {
    // 忽略：本地存储不可用时仅失去记忆，不影响本次运行
  }
}
