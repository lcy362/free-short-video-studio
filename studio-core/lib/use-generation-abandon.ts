'use client';

import { useEffect, useRef } from 'react';
import { trackGenerationAbandon, type StudioTab } from './analytics';

export interface GenerationAbandonState {
  /** 当前是否有生成任务在跑且尚未到达 success / error */
  active: boolean;
  tab: StudioTab;
  model?: string;
  /** 本轮生成开始时间戳（Date.now()），0 / undefined 表示未知 */
  startedAt?: number;
  /** 是否已拿到 video_id（决定能否用 ?video_id= 回查） */
  hasVideoId?: boolean;
}

/**
 * 页面卸载（关闭标签页 / 刷新 / 导航离开）时，若任务还没有终态事件，
 * 上报一次 abandon，用来解释 GA 里「有 start 没 success/error」的缺口。
 *
 * 刻意只监听 pagehide：切到后台标签页时 JS 仍在运行（定时器只是被节流），
 * 不算放弃；已成功 / 已失败 / 已取消的任务 active=false，也不会误报。
 * 每轮生成只报一次，重新进入运行态后可再次上报。
 */
export function useGenerationAbandon(state: GenerationAbandonState): void {
  const stateRef = useRef(state);
  stateRef.current = state;
  const reportedRef = useRef(false);

  useEffect(() => {
    if (!state.active) reportedRef.current = false;
  }, [state.active]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPageHide = () => {
      const s = stateRef.current;
      if (!s.active || reportedRef.current) return;
      reportedRef.current = true;
      trackGenerationAbandon({
        tab: s.tab,
        model: s.model,
        elapsed_s: s.startedAt
          ? Math.max(0, Math.floor((Date.now() - s.startedAt) / 1000))
          : 0,
        has_video_id: s.hasVideoId,
        reason: 'pagehide',
      });
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);
}
