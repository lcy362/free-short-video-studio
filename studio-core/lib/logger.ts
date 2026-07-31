// Studio 运行日志系统
// 网页版无后台日志，用内存环形缓冲 + 订阅机制在页面上展示运行日志。
// 日志按场景/全局分组，含时间戳、级别、scope、消息。

export type LogLevel = 'info' | 'warn' | 'error' | 'success';

export interface LogEntry {
  id: number;
  ts: number;
  level: LogLevel;
  /** 归属：'system' 全局 / `scene:N` 某场景 / 'ffmpeg' 拼接 */
  scope: string;
  message: string;
  /** 原始错误消息（若有，便于复制排查） */
  raw?: string;
}

const MAX_LOGS = 500;

class StudioLogger {
  private logs: LogEntry[] = [];
  private nextId = 1;
  private subscribers = new Set<(logs: LogEntry[]) => void>();

  /** 记录一条日志 */
  log(level: LogLevel, scope: string, message: string, raw?: string): void {
    const entry: LogEntry = {
      id: this.nextId++,
      ts: Date.now(),
      level,
      scope,
      message,
      raw,
    };
    this.logs.push(entry);
    if (this.logs.length > MAX_LOGS) {
      this.logs = this.logs.slice(-MAX_LOGS);
    }
    this.notify();
  }

  info(scope: string, message: string): void {
    this.log('info', scope, message);
  }
  warn(scope: string, message: string, raw?: string): void {
    this.log('warn', scope, message, raw);
  }
  error(scope: string, message: string, raw?: string): void {
    this.log('error', scope, message, raw);
  }
  success(scope: string, message: string): void {
    this.log('success', scope, message);
  }

  /** 获取全部日志（副本） */
  getAll(): LogEntry[] {
    return [...this.logs];
  }

  /** 订阅日志变化，返回取消订阅函数 */
  subscribe(cb: (logs: LogEntry[]) => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  private notify(): void {
    const snapshot = [...this.logs];
    this.subscribers.forEach((cb) => cb(snapshot));
  }

  /** 清空日志 */
  clear(): void {
    this.logs = [];
    this.notify();
  }
}

/** 全局单例 */
export const studioLogger = new StudioLogger();

/** 格式化时间戳为 HH:MM:SS */
export function formatLogTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}
