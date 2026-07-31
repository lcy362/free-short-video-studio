'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { studioLogger, formatLogTime, type LogEntry, type LogLevel } from '../lib/logger';

const LEVEL_CONFIG: Record<LogLevel, { color: string; icon: string; label: string }> = {
  info: { color: 'text-gray-300', icon: '·', label: 'INFO' },
  warn: { color: 'text-amber-400', icon: '⚠', label: 'WARN' },
  error: { color: 'text-red-400', icon: '✕', label: 'ERR ' },
  success: { color: 'text-green-400', icon: '✓', label: 'OK  ' },
};

export default function LogPanel() {
  const t = useTranslations('studio');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = studioLogger.subscribe(setLogs);
    setLogs(studioLogger.getAll());
    return unsub;
  }, []);

  useEffect(() => {
    if (expanded && autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, expanded, autoScroll]);

  const errorCount = logs.filter((l) => l.level === 'error').length;
  const warnCount = logs.filter((l) => l.level === 'warn').length;

  return (
    <div className="bg-gray-900/60 backdrop-blur-xl border border-gray-700/60 rounded-2xl overflow-hidden">
      {/* 头部 */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-800/40 transition"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-sm font-medium text-gray-200">{t('logPanel')}</span>
          {errorCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded font-mono">
              {errorCount} {t('logErrors')}
            </span>
          )}
          {warnCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded font-mono">
              {warnCount} {t('logWarnings')}
            </span>
          )}
          <span className="text-[10px] text-gray-500 font-mono">{logs.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {expanded && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setAutoScroll((v) => !v);
              }}
              className={`text-[10px] px-1.5 py-0.5 rounded font-mono transition ${
                autoScroll ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700/50 text-gray-500'
              }`}
            >
              {t('autoScroll')}
            </button>
          )}
          {expanded && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                studioLogger.clear();
              }}
              className="text-[10px] px-1.5 py-0.5 bg-gray-700/50 text-gray-400 hover:text-gray-200 rounded font-mono transition"
            >
              {t('clearLog')}
            </button>
          )}
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* 日志内容 */}
      {expanded && (
        <div
          ref={containerRef}
          className="max-h-72 overflow-y-auto px-4 py-2 border-t border-gray-700/40 font-mono text-xs space-y-0.5 bg-black/30"
        >
          {logs.length === 0 ? (
            <p className="text-gray-600 italic py-2">{t('noLogs')}</p>
          ) : (
            logs.map((entry) => {
              const cfg = LEVEL_CONFIG[entry.level];
              return (
                <div key={entry.id} className="flex gap-2 leading-relaxed hover:bg-white/[0.03] px-1 rounded">
                  <span className="text-gray-600 shrink-0">{formatLogTime(entry.ts)}</span>
                  <span className={`shrink-0 ${cfg.color}`}>{cfg.icon}</span>
                  {entry.scope !== 'system' && (
                    <span className="text-blue-400/70 shrink-0">{entry.scope}</span>
                  )}
                  <span className={`${cfg.color} break-all`}>{entry.message}</span>
                  {entry.raw && (
                    <span className="text-gray-600 break-all">— {entry.raw}</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
