'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';

const STORAGE_KEY = 'agnes_api_key';

export function useApiKey() {
  const [apiKey, setApiKey] = useState<string>('');
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) || '' : '';
    setApiKey(saved);
    setHasKey(!!saved);
  }, []);

  const saveKey = useCallback((key: string) => {
    localStorage.setItem(STORAGE_KEY, key);
    setApiKey(key);
    setHasKey(!!key);
  }, []);

  const clearKey = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setApiKey('');
    setHasKey(false);
  }, []);

  return { apiKey, hasKey, saveKey, clearKey };
}

export default function ApiKeyPanel({
  apiKey,
  hasKey,
  saveKey,
  clearKey,
}: {
  apiKey: string;
  hasKey: boolean;
  saveKey: (k: string) => void;
  clearKey: () => void;
}) {
  const t = useTranslations('studio');
  const [inputValue, setInputValue] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [expanded, setExpanded] = useState(!hasKey);

  useEffect(() => {
    setInputValue(apiKey);
  }, [apiKey]);

  return (
    <div className="bg-gray-800/40 backdrop-blur-xl border border-gray-700/60 rounded-2xl p-4 sm:p-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left group"
        aria-expanded={expanded}
        aria-controls="apikey-panel-body"
      >
        <span className="text-sm font-medium text-gray-200 flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          {t('apiKey.title')}
          {hasKey && (
            <span className="inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse" aria-label={t('apiKey.saved')} />
          )}
        </span>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div
        id="apikey-panel-body"
        className={`overflow-hidden transition-all duration-300 ${expanded ? 'mt-4 max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={t('apiKey.placeholder')}
                className="w-full bg-gray-800/80 border border-gray-700 rounded-lg pl-4 pr-10 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500/70 focus:ring-1 focus:ring-blue-500/30 transition"
                aria-label={t('apiKey.label')}
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-gray-300 transition rounded"
                aria-label={showKey ? t('apiKey.hide') : t('apiKey.show')}
              >
                {showKey ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => saveKey(inputValue.trim())}
              disabled={!inputValue.trim()}
              className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-all text-white"
            >
              {t('apiKey.save')}
            </button>
            {hasKey && (
              <button
                onClick={clearKey}
                className="px-4 py-2 text-sm text-gray-400 hover:text-red-400 transition"
              >
                {t('apiKey.clear')}
              </button>
            )}
          </div>

          <p className="text-xs text-gray-500">
            {t('apiKey.hint')}{' '}
            <a
              href="https://platform.agnes-ai.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              platform.agnes-ai.com
            </a>
          </p>

          <div className="flex items-start gap-1.5 text-xs text-gray-400 bg-gray-800/50 rounded-lg p-2.5 border border-gray-700/50">
            <svg className="w-3.5 h-3.5 mt-px shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{t('apiKey.localOnly')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
