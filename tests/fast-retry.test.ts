import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_FAST_RETRY_SETTINGS,
  EMPTY_FAST_RETRY_RUN,
  FAST_RETRY_AVAILABLE_AFTER,
  FAST_RETRY_MAX_AUTO_WINDOWS,
  FAST_RETRY_MAX_MINUTES,
  FAST_RETRY_MAX_PER_MINUTE,
  FAST_RETRY_MIN_PER_MINUTE,
  SLOW_RETRY_INTERVAL_MS,
  SLOW_RETRY_MAX,
  clampFastRetryParams,
  decideRetry,
  fastRetryIntervalMs,
  fastRetryRemainingMs,
  formatRemaining,
  isFastRetryAvailable,
  loadFastRetrySettings,
  saveFastRetrySettings,
  type FastRetryRun,
  type FastRetrySettings,
} from '@/studio-core/lib/fast-retry';

const autoOn: FastRetrySettings = { auto: true, perMinute: 30, minutes: 3 };

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

  it('自动窗口用尽后不再自动开启（300 次连打回归）', () => {
    const d = decideRetry({
      settings: autoOn,
      run: run({ busyStreak: 3, autoWindows: FAST_RETRY_MAX_AUTO_WINDOWS }),
    });
    expect(d.mode).toBe('slow');
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

  it('快速模式到期后回到慢速节奏（冷却）', () => {
    const now = 2_000_000;
    const d = decideRetry({
      settings: autoOn,
      run: run({ fastStartedAt: now - 181_000, fastAttempts: 90 }),
      now,
    });
    expect(d).toEqual({ mode: 'slow', intervalMs: SLOW_RETRY_INTERVAL_MS, reason: 'expired' });
  });

  it('慢速次数用尽且未开启快速 → exhausted', () => {
    const d = decideRetry({
      settings: { ...autoOn, auto: false },
      run: run({ busyStreak: 0, slowAttempts: SLOW_RETRY_MAX }),
    });
    expect(d).toEqual({ mode: 'exhausted', reason: 'exhausted' });
  });

  it('快速到期且慢速也用尽 → exhausted', () => {
    const now = 2_000_000;
    const d = decideRetry({
      settings: autoOn,
      run: run({ fastStartedAt: now - 200_000, slowAttempts: SLOW_RETRY_MAX }),
      now,
    });
    expect(d.mode).toBe('exhausted');
  });
});

describe('isFastRetryAvailable', () => {
  it('未开自动 + 连续 2 次忙信号 + 未手动关闭 → 开放一次性开关', () => {
    expect(
      isFastRetryAvailable(run({ busyStreak: 2 }), { ...autoOn, auto: false }),
    ).toBe(true);
  });

  it('已开自动 / 已手动关闭 / 快速模式进行中 → 不需要一次性开关', () => {
    expect(isFastRetryAvailable(run({ busyStreak: 2 }), autoOn)).toBe(false);
    expect(
      isFastRetryAvailable(run({ busyStreak: 2, autoOff: true }), { ...autoOn, auto: false }),
    ).toBe(false);
    expect(
      isFastRetryAvailable(run({ busyStreak: 2, fastStartedAt: 1 }), { ...autoOn, auto: false }),
    ).toBe(false);
  });
});

describe('fast retry settings storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('无存储时返回默认设置（auto 关闭）', () => {
    expect(loadFastRetrySettings()).toEqual(DEFAULT_FAST_RETRY_SETTINGS);
  });

  it('写入后可读回，且参数被收敛', () => {
    saveFastRetrySettings({ auto: true, perMinute: 500, minutes: 0 });
    expect(loadFastRetrySettings()).toEqual({
      auto: true,
      perMinute: FAST_RETRY_MAX_PER_MINUTE,
      minutes: 1,
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
