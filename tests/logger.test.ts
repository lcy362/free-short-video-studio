import { describe, it, expect, beforeEach, vi } from 'vitest';
import { studioLogger, formatLogTime, type LogEntry } from '../studio-core/lib/logger';

describe('logger', () => {
  beforeEach(() => {
    studioLogger.clear();
  });

  it('records entries via all level helpers', () => {
    studioLogger.info('system', 'a');
    studioLogger.warn('scene:1', 'b', 'raw-warn');
    studioLogger.error('system', 'c');
    studioLogger.success('ffmpeg', 'd');
    const all = studioLogger.getAll();
    expect(all.map((e) => e.level)).toEqual(['info', 'warn', 'error', 'success']);
    expect(all[0].scope).toBe('system');
    expect(all[1].raw).toBe('raw-warn');
    expect(all[1].id).toBeGreaterThan(all[0].id);
    expect(all[0].ts).toBeTypeOf('number');
  });

  it('getAll returns a copy (mutation-safe)', () => {
    studioLogger.info('system', 'x');
    const snapshot = studioLogger.getAll();
    snapshot.pop();
    expect(studioLogger.getAll()).toHaveLength(1);
  });

  it('caps the ring buffer at 500 entries', () => {
    for (let i = 0; i < 505; i++) studioLogger.info('system', `m${i}`);
    const all = studioLogger.getAll();
    expect(all).toHaveLength(500);
    expect(all[0].message).toBe('m5');
    expect(all[499].message).toBe('m504');
  });

  it('notifies subscribers and supports unsubscribe', () => {
    const seen: LogEntry[][] = [];
    const unsub = studioLogger.subscribe((logs) => seen.push(logs));
    studioLogger.info('system', 'one');
    expect(seen).toHaveLength(1);
    unsub();
    studioLogger.info('system', 'two');
    expect(seen).toHaveLength(1);
  });

  it('clear() empties logs and notifies', () => {
    const cb = vi.fn();
    studioLogger.subscribe(cb);
    studioLogger.info('system', 'x');
    studioLogger.clear();
    expect(studioLogger.getAll()).toHaveLength(0);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('formatLogTime renders HH:MM:SS in local time', () => {
    const ts = new Date(2024, 0, 1, 9, 5, 3).getTime();
    expect(formatLogTime(ts)).toBe('09:05:03');
    const ts2 = new Date(2024, 0, 1, 23, 59, 59).getTime();
    expect(formatLogTime(ts2)).toBe('23:59:59');
  });
});
