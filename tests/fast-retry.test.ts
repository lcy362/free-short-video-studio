import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_FAST_RETRY_SETTINGS,
  EMPTY_FAST_RETRY_RUN,
  FAST_RETRY_AVAILABLE_AFTER,
  FAST_RETRY_DEFAULT_INTERVAL_MINUTES,
  FAST_RETRY_MAX_INTERVAL_MINUTES,
  FAST_RETRY_MAX_MINUTES,
  FAST_RETRY_MAX_PER_MINUTE,
  FAST_RETRY_MIN_INTERVAL_MINUTES,
  FAST_RETRY_MIN_PER_MINUTE,
  LONG_TASK_DEFAULT_MINUTES,
  LONG_TASK_MAX_MINUTES,
  LONG_TASK_MIN_MINUTES,
  SLOW_RETRY_INTERVAL_MS,
  SLOW_RETRY_MAX,
  clampFastRetryInterval,
  clampFastRetryParams,
  clampLongTaskMinutes,
  decideRetry,
  fastRetryChainRemainingMs,
  fastRetryIntervalMs,
  fastRetryRemainingMs,
  formatRemaining,
  isFastRetryAvailable,
  loadFastRetrySettings,
  longTaskRemainingMs,
  saveFastRetrySettings,
  type FastRetryRun,
  type FastRetrySettings,
} from '@/studio-core/lib/fast-retry';

const autoOn: FastRetrySettings = {
  ...DEFAULT_FAST_RETRY_SETTINGS,
  auto: true,
  perMinute: 30,
  minutes: 3,
};

function run(overrides: Partial<FastRetryRun> = {}): FastRetryRun {
  return { ...EMPTY_FAST_RETRY_RUN, ...overrides };
}

describe('fast retry params', () => {
  it('把 x / y 收敛到源项目区间（1–120 次/分、1–30 分钟）', () => {
    expect(clampFastRetryParams(0, 0)).toEqual({
      perMinute: FAST_RETRY_MIN_PER_MINUTE,
      minutes: 1,
    });
    expect(clampFastRetryParams(999, 99)).toEqual({
      perMinute: FAST_RETRY_MAX_PER_MINUTE,
      minutes: FAST_RETRY_MAX_MINUTES,
    });
    expect(clampFastRetryParams(29.6, 2.4)).toEqual({ perMinute: 30, minutes: 2 });
  });

  it('非法输入回落到默认参数而非 0', () => {
    expect(clampFastRetryParams('abc', null)).toEqual({
      perMinute: DEFAULT_FAST_RETRY_SETTINGS.perMinute,
      minutes: DEFAULT_FAST_RETRY_SETTINGS.minutes,
    });
  });

  it('两轮间隔收敛到 1–60 分钟，非法值回落默认 5', () => {
    expect(clampFastRetryInterval(0)).toBe(FAST_RETRY_MIN_INTERVAL_MINUTES);
    expect(clampFastRetryInterval(999)).toBe(FAST_RETRY_MAX_INTERVAL_MINUTES);
    expect(clampFastRetryInterval('x')).toBe(FAST_RETRY_DEFAULT_INTERVAL_MINUTES);
  });

  it('长任务预算收敛到 5–480 分钟，非法值回落默认 60', () => {
    expect(clampLongTaskMinutes(0)).toBe(LONG_TASK_MIN_MINUTES);
    expect(clampLongTaskMinutes(9999)).toBe(LONG_TASK_MAX_MINUTES);
    expect(clampLongTaskMinutes(null)).toBe(LONG_TASK_DEFAULT_MINUTES);
  });

  it('间隔 = 60s / x，且下限 0.5s', () => {
    expect(fastRetryIntervalMs(30)).toBe(2000);
    expect(fastRetryIntervalMs(120)).toBe(500);
    expect(fastRetryIntervalMs(0)).toBe(60_000);
  });

  it('剩余时间与展示格式', () => {
    const start = 1_000_000;
    expect(fastRetryRemainingMs(start, 3, start)).toBe(180_000);
    expect(fastRetryRemainingMs(start, 3, start + 181_000)).toBe(0);
    expect(formatRemaining(180_000)).toBe('3:00');
    expect(formatRemaining(65_000)).toBe('1:05');
  });

  it('接力倒计时与长任务剩余预算', () => {
    const start = 1_000_000;
    expect(fastRetryChainRemainingMs(start, 5, start)).toBe(300_000);
    expect(fastRetryChainRemainingMs(start, 5, start + 300_000)).toBe(0);

    const settings: FastRetrySettings = { ...autoOn, longTask: true, longTaskMinutes: 60 };
    expect(longTaskRemainingMs(run({ busyWaitedMs: 1_800_000 }), settings)).toBe(1_800_000);
    expect(longTaskRemainingMs(run({ busyWaitedMs: 0 }), { ...settings, longTask: false })).toBe(0);
  });
});

describe('decideRetry', () => {
  it('未满足连续 2 次忙信号时保持常规节奏（5×30s）', () => {
    const d = decideRetry({ settings: autoOn, run: run({ busyStreak: 1 }) });
    expect(d).toEqual({ mode: 'slow', intervalMs: SLOW_RETRY_INTERVAL_MS, reason: 'slow' });
  });

  it('自动开启：连续 2 次忙信号后进入快速连打', () => {
    const d = decideRetry({
      settings: autoOn,
      run: run({ busyStreak: FAST_RETRY_AVAILABLE_AFTER }),
    });
    expect(d).toEqual({ mode: 'fast', intervalMs: 2000, startNow: true, reason: 'started' });
  });

  it('关闭自动时不自动开启，继续慢速', () => {
    const d = decideRetry({
      settings: { ...autoOn, auto: false },
      run: run({ busyStreak: 5 }),
    });
    expect(d.mode).toBe('slow');
  });

  it('手动关过（autoOff）后本轮不再自动拉起', () => {
    const d = decideRetry({
      settings: autoOn,
      run: run({ busyStreak: 5, autoOff: true }),
    });
    expect(d.mode).toBe('slow');
  });

  it('快速模式进行中按 intervalMs 连打', () => {
    const now = 2_000_000;
    const d = decideRetry({
      settings: autoOn,
      run: run({ fastStartedAt: now - 30_000, fastAttempts: 12 }),
      now,
    });
    expect(d).toEqual({ mode: 'fast', intervalMs: 2000, startNow: false, reason: 'active' });
  });

  it('快速模式到期后先回常规节奏，由调用方进入接力等待', () => {
    const now = 2_000_000;
    const d = decideRetry({
      settings: autoOn,
      run: run({ fastStartedAt: now - 181_000, fastAttempts: 90 }),
      now,
    });
    expect(d).toEqual({ mode: 'slow', intervalMs: SLOW_RETRY_INTERVAL_MS, reason: 'expired' });
  });

  it('接力等待未满间隔时保持常规节奏，且不再按次数封顶', () => {
    const now = 2_000_000;
    const d = decideRetry({
      settings: autoOn,
      run: run({ chainPending: true, chainStartedAt: now - 60_000, slowAttempts: 99 }),
      now,
    });
    expect(d).toEqual({ mode: 'slow', intervalMs: SLOW_RETRY_INTERVAL_MS, reason: 'slow' });
  });

  it('接力等满间隔后的下一个忙信号自动开新一轮', () => {
    const now = 2_000_000;
    const d = decideRetry({
      settings: autoOn,
      run: run({ chainPending: true, chainStartedAt: now - 300_000, rounds: 1 }),
      now,
    });
    expect(d).toEqual({ mode: 'fast', intervalMs: 2000, startNow: true, reason: 'chained' });
  });

  it('慢速次数用尽且未开启快速 → exhausted', () => {
    const d = decideRetry({
      settings: { ...autoOn, auto: false },
      run: run({ busyStreak: 0, slowAttempts: SLOW_RETRY_MAX }),
    });
    expect(d).toEqual({ mode: 'exhausted', reason: 'exhausted' });
  });

  it('长任务开启后忙轨不再按次数封顶', () => {
    const d = decideRetry({
      settings: { ...autoOn, auto: false, longTask: true, longTaskMinutes: 60 },
      run: run({ slowAttempts: 99, busyWaitedMs: 10 * 60_000 }),
    });
    expect(d).toEqual({ mode: 'slow', intervalMs: SLOW_RETRY_INTERVAL_MS, reason: 'slow' });
  });

  it('长任务预算耗尽 → exhausted(budget)，接力也停止', () => {
    const now = 2_000_000;
    const settings: FastRetrySettings = { ...autoOn, longTask: true, longTaskMinutes: 5 };
    const d = decideRetry({
      settings,
      run: run({
        chainPending: true,
        chainStartedAt: now - 600_000,
        busyWaitedMs: 5 * 60_000,
      }),
      now,
    });
    expect(d).toEqual({ mode: 'exhausted', reason: 'budget' });
  });

  it('长任务预算耗尽时，进行中的快速窗口在到期后也不再续', () => {
    const now = 2_000_000;
    const settings: FastRetrySettings = { ...autoOn, longTask: true, longTaskMinutes: 5 };
    const d = decideRetry({
      settings,
      run: run({ fastStartedAt: now - 181_000, busyWaitedMs: 5 * 60_000 }),
      now,
    });
    expect(d).toEqual({ mode: 'exhausted', reason: 'budget' });
  });
});

describe('isFastRetryAvailable', () => {
  it('未开自动 + 连续 2 次忙信号 + 未手动关闭 → 开放一次性开关', () => {
    expect(
      isFastRetryAvailable(run({ busyStreak: 2 }), { ...autoOn, auto: false }),
    ).toBe(true);
  });

  it('已开自动 / 已手动关闭 / 快速模式进行中 / 接力等待中 → 不需要一次性开关', () => {
    expect(isFastRetryAvailable(run({ busyStreak: 2 }), autoOn)).toBe(false);
    expect(
      isFastRetryAvailable(run({ busyStreak: 2, autoOff: true }), { ...autoOn, auto: false }),
    ).toBe(false);
    expect(
      isFastRetryAvailable(run({ busyStreak: 2, fastStartedAt: 1 }), { ...autoOn, auto: false }),
    ).toBe(false);
    expect(
      isFastRetryAvailable(run({ busyStreak: 2, chainPending: true }), { ...autoOn, auto: false }),
    ).toBe(false);
  });
});

describe('fast retry settings storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('无存储时返回默认设置（auto / 长任务关闭）', () => {
    expect(loadFastRetrySettings()).toEqual(DEFAULT_FAST_RETRY_SETTINGS);
  });

  it('写入后可读回，且 x / y 与新字段都被收敛', () => {
    saveFastRetrySettings({
      auto: true,
      perMinute: 500,
      minutes: 0,
      intervalMinutes: 999,
      longTask: true,
      longTaskMinutes: 9999,
    });
    expect(loadFastRetrySettings()).toEqual({
      auto: true,
      perMinute: FAST_RETRY_MAX_PER_MINUTE,
      minutes: 1,
      intervalMinutes: FAST_RETRY_MAX_INTERVAL_MINUTES,
      longTask: true,
      longTaskMinutes: LONG_TASK_MAX_MINUTES,
    });
  });

  it('旧版存储（无 interval / 长任务字段）自动补默认值', () => {
    localStorage.setItem('agnes_fast_retry', JSON.stringify({ auto: true, perMinute: 10, minutes: 2 }));
    expect(loadFastRetrySettings()).toEqual({
      auto: true,
      perMinute: 10,
      minutes: 2,
      intervalMinutes: FAST_RETRY_DEFAULT_INTERVAL_MINUTES,
      longTask: false,
      longTaskMinutes: LONG_TASK_DEFAULT_MINUTES,
    });
  });

  it('存储被篡改为非法 JSON / 非法值时回退默认', () => {
    localStorage.setItem('agnes_fast_retry', '{oops');
    expect(loadFastRetrySettings()).toEqual(DEFAULT_FAST_RETRY_SETTINGS);

    localStorage.setItem('agnes_fast_retry', JSON.stringify({ auto: 'yes', perMinute: null }));
    const loaded = loadFastRetrySettings();
    expect(loaded.auto).toBe(false);
    expect(loaded.perMinute).toBe(DEFAULT_FAST_RETRY_SETTINGS.perMinute);
  });
});
