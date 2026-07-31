// 视频提交限速器
// 视频提交接口（POST /v1/videos）并发度现为「每分钟 1 次」，
// 本限速器保证任意两次提交之间至少间隔 MIN_SUBMIT_INTERVAL（60s）。
// 对齐原项目 agnes-video-generator 的令牌桶思路，但针对提交端点单独收紧为 1 次/分钟。

import { MIN_SUBMIT_INTERVAL } from '../types';

/** 可中断的 sleep，返回是否正常结束（未被取消） */
export function sleep(ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * 提交限速器（单例）。
 *
 * 用法：每次提交前 `await submitLimiter.acquire()`，它会阻塞直到距上次提交
 * 已过 MIN_SUBMIT_INTERVAL；首个请求立即放行。
 *
 * 设计要点：
 * - 与原项目「提交+轮询共享令牌桶」不同，这里把提交单独限速为 1 次/分钟；
 *   轮询不经过此限速器（轮询请求量低：每场景 60s 一次，N 场景合计 N 次/分钟，
 *   远低于 Agnes 总配额 16 次/分钟，安全）。
 * - 多个场景的提交会被串行化排队，但提交后立即并行轮询，整体吞吐仍受控。
 */
class SubmitRateLimiter {
  private lastSubmitAt = 0;
  /** 串行化链：保证并发 acquire 按调用顺序（FIFO）获得窗口，避免竞态 */
  private chain: Promise<void> = Promise.resolve();
  private waiters = 0;

  /**
   * 等待直到允许下一次提交。返回本次需等待的毫秒数（0 表示立即放行）。
   * 并发调用会按调用顺序串行排队，保证任意两次提交间隔 ≥ MIN_SUBMIT_INTERVAL。
   */
  async acquire(signal?: AbortSignal): Promise<number> {
    // 排到链尾，等待前一个 acquire 释放
    const prev = this.chain;
    let release!: () => void;
    this.chain = new Promise<void>((r) => {
      release = r;
    });
    this.waiters++;

    try {
      await prev;
      if (signal?.aborted) return 0;

      const now = Date.now();
      const elapsed = now - this.lastSubmitAt;
      const wait = Math.max(0, MIN_SUBMIT_INTERVAL - elapsed);

      if (wait > 0) {
        const ok = await sleep(wait, signal);
        if (!ok) return wait; // 被取消
      }

      // 占用一个 60s 窗口
      this.lastSubmitAt = Date.now();
      return wait;
    } finally {
      this.waiters--;
      release();
    }
  }

  /** 当前排队等待提交的请求数（用于 UI 展示） */
  get pendingWaiters(): number {
    return this.waiters;
  }

  /** 距离下次可提交还需等待的毫秒数 */
  msUntilNextSlot(): number {
    const elapsed = Date.now() - this.lastSubmitAt;
    return Math.max(0, MIN_SUBMIT_INTERVAL - elapsed);
  }

  /** 重置（新项目从头开始时调用，避免继承上一个项目的窗口） */
  reset(): void {
    this.lastSubmitAt = 0;
  }
}

/** 全局单例 */
export const submitLimiter = new SubmitRateLimiter();
