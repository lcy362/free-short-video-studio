import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sleep, submitLimiter } from '../studio-core/lib/rate-limiter';

const MIN_INTERVAL = 60_000;

describe('sleep', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resolves true after the delay', async () => {
    const p = sleep(1000);
    const spy = vi.fn();
    p.then(spy);
    await vi.advanceTimersByTimeAsync(999);
    expect(spy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(spy).toHaveBeenCalledWith(true);
  });

  it('resolves false immediately when signal already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(sleep(1000, ac.signal)).resolves.toBe(false);
  });

  it('resolves false when aborted mid-sleep', async () => {
    const ac = new AbortController();
    const p = sleep(10_000, ac.signal);
    const spy = vi.fn();
    p.then(spy);
    await vi.advanceTimersByTimeAsync(100);
    ac.abort();
    await Promise.resolve();
    expect(spy).toHaveBeenCalledWith(false);
  });
});

describe('submitLimiter', () => {
  // 实现用绝对时间窗口（lastSubmitAt=0 会被当作「刚提交」），
  // 生产环境 Date.now() 是真实时间戳 → reset 后 elapsed 巨大 → 首次立即放行。
  // 测试必须用同等量级的时间基准，从 t=0 起跑会错误地触发 60s 等待。
  const T0 = 1_700_000_000_000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    submitLimiter.reset();
  });
  afterEach(() => vi.useRealTimers());

  it('first acquire passes immediately (wait = 0)', async () => {
    const wait = submitLimiter.acquire();
    await vi.advanceTimersByTimeAsync(0);
    await expect(wait).resolves.toBe(0);
  });

  it('second acquire waits for the 60s window', async () => {
    await vi.advanceTimersByTimeAsync(0);
    await submitLimiter.acquire();
    const p2 = submitLimiter.acquire();
    let resolved: number | undefined;
    p2.then((w) => (resolved = w));
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBeUndefined();
    expect(submitLimiter.pendingWaiters).toBe(1);
    await vi.advanceTimersByTimeAsync(MIN_INTERVAL);
    await expect(p2).resolves.toBeGreaterThan(0);
  });

  it('returns the remaining wait when aborted mid-wait', async () => {
    await vi.advanceTimersByTimeAsync(0);
    await submitLimiter.acquire();
    const ac = new AbortController();
    const p2 = submitLimiter.acquire(ac.signal);
    await vi.advanceTimersByTimeAsync(0);
    ac.abort();
    await expect(p2).resolves.toBeGreaterThan(0);
  });

  it('returns 0 when signal aborted while queued', async () => {
    // 占住链：让第一个 acquire 挂在 sleep 上
    await vi.advanceTimersByTimeAsync(0);
    await submitLimiter.acquire();
    const ac = new AbortController();
    ac.abort();
    await expect(submitLimiter.acquire(ac.signal)).resolves.toBe(0);
  });

  it('msUntilNextSlot reflects the remaining window', async () => {
    expect(submitLimiter.msUntilNextSlot()).toBe(0);
    await vi.advanceTimersByTimeAsync(0);
    await submitLimiter.acquire();
    const ms = submitLimiter.msUntilNextSlot();
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(MIN_INTERVAL);
  });

  it('reset() clears the window', async () => {
    await vi.advanceTimersByTimeAsync(0);
    await submitLimiter.acquire();
    expect(submitLimiter.msUntilNextSlot()).toBeGreaterThan(0);
    submitLimiter.reset();
    expect(submitLimiter.msUntilNextSlot()).toBe(0);
  });
});
