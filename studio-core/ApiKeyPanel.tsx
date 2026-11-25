'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AGNES_DOMAINS, type AgnesDomainId } from './lib/api-domains';
import { trackApiKeyGuideClick, trackApiKeySaved, trackGetKeyClick } from './lib/analytics';
import step1Image from './assets/api-key/01-platform-login.png';
import step2Image from './assets/api-key/03-create-key.png';
import step3Image from './assets/api-key/04-paste-key.png';

const STORAGE_KEY = 'agnes_api_key';
const PLATFORM_URL = 'https://platform.agnes-ai.com';
const STEPS = [
  { image: step1Image, titleKey: 'apiKey.step1', altKey: 'apiKey.stepAlt1' },
  { image: step2Image, titleKey: 'apiKey.step2', altKey: 'apiKey.stepAlt2' },
  { image: step3Image, titleKey: 'apiKey.step3', altKey: 'apiKey.stepAlt3' },
];

const PRIMARY_CTA = 'bg-accent hover:bg-accent/90 text-accent-ink';
const SECONDARY_CTA = 'border border-accent/40 text-accent hover:bg-accent/10';

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
  domain,
  onDomainChange,
}: Readonly<{
  apiKey: string;
  hasKey: boolean;
  saveKey: (k: string) => void;
  clearKey: () => void;
  domain: AgnesDomainId;
  onDomainChange: (id: AgnesDomainId) => void;
}>) {
  const t = useTranslations('studio');
  const locale = useLocale();
  const [inputValue, setInputValue] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [expanded, setExpanded] = useState(!hasKey);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // 还没领到 Key 时，用户真正要做的动作是「去注册」，不是「保存」。
  // 输入框一旦有内容（已复制 Key 回来），主次立刻反转回「保存」。
  const getKeyIsPrimary = !hasKey && !inputValue.trim();

  useEffect(() => {
    setInputValue(apiKey);
  }, [apiKey]);

  // 保存成功后自动收起，避免占着工作台首屏
  useEffect(() => {
    if (hasKey) setExpanded(false);
  }, [hasKey]);

  const copyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(PLATFORM_URL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板不可用时仍可选中文本手动复制，不阻断流程
    }
  }, []);

  return (
    <div id="api-key-panel" className="card-surface rounded-2xl p-4 sm:p-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-start group"
        aria-expanded={expanded}
        aria-controls="apikey-panel-body"
      >
        <span className="text-sm font-medium text-ink-2 flex items-center gap-2">
          <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          <span>API Key</span>
          {hasKey ? (
            <span className="inline-flex items-center gap-1 text-xs font-normal text-success">
              <span className="inline-block w-2 h-2 bg-success rounded-full" aria-hidden="true" />
              {t('apiKey.saved')}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-xs font-normal text-accent">
              {t('apiKey.intro')}
            </span>
          )}
        </span>
        <svg
          className={`w-4 h-4 text-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div
        id="apikey-panel-body"
        className={`overflow-hidden transition-all duration-300 ${expanded ? 'mt-4 max-h-[68rem] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-ink">{t('apiKey.title')}</p>
            <p className="mt-1 text-xs text-muted leading-relaxed">{t('apiKey.trustFree')}</p>
          </div>

          {/* 三步缩略图：把「注册很长」的直觉拆成看得见的三个动作 */}
          {!hasKey && (
            <div className="rounded-xl border border-rule bg-paper-3/50 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-semibold text-ink">{t('apiKey.stepsTitle')}</p>
                <p className="text-xs text-muted">{t('apiKey.stepsHint')}</p>
              </div>
              <ol className="mt-2.5 grid grid-cols-3 gap-2">
                {STEPS.map((step, i) => (
                  <li key={step.titleKey} className="min-w-0">
                    <img
                      src={step.image.src}
                      alt={t(step.altKey)}
                      loading="lazy"
                      className="w-full h-16 sm:h-20 object-cover object-top rounded-md border border-rule bg-paper"
                    />
                    <p className="mt-1.5 flex items-start gap-1 text-[11px] leading-tight text-ink-2">
                      <span className="shrink-0 inline-flex h-4 w-4 items-center justify-center rounded-full bg-accent/10 text-[10px] font-semibold text-accent" aria-hidden="true">{i + 1}</span>
                      <span>{t(step.titleKey)}</span>
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="flex-1 relative">
            <input
              id="api-key-input"
              type={showKey ? 'text' : 'password'}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={t('apiKey.placeholder')}
              className="w-full bg-paper border border-rule rounded-lg ps-4 pe-10 py-2.5 text-sm text-ink placeholder-muted focus:outline-none focus:border-accent/70 focus:ring-1 focus:ring-accent/30 transition"
              aria-label={t('apiKey.label')}
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted hover:text-ink-2 transition rounded"
              aria-label={showKey ? t('apiKey.hide') : t('apiKey.show')}
            >
              {showKey ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                const key = inputValue.trim();
                // 重复保存同一个 Key 不是新转化：历史数据里 api_key_saved 人均 2.92 次主要来自这里
                if (!key || key === apiKey) return;
                saveKey(key);
                trackApiKeySaved({ source: 'manual' });
              }}
              disabled={!inputValue.trim()}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${getKeyIsPrimary ? `order-2 ${SECONDARY_CTA}` : `order-1 ${PRIMARY_CTA}`}`}
            >
              {t('apiKey.save')}
            </button>
            <a
              href={PLATFORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackGetKeyClick({ from: 'panel' })}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition ${getKeyIsPrimary ? `order-1 ${PRIMARY_CTA}` : `order-2 ${SECONDARY_CTA}`}`}
            >
              {t('apiKey.getKey')} ↗
            </a>
            {hasKey && (
              <button
                onClick={clearKey}
                className="order-3 px-2 py-2 text-xs text-muted hover:text-danger transition"
              >
                {t('apiKey.clear')}
              </button>
            )}
          </div>

          {hasKey ? (
            <p className="text-xs text-success">{t('apiKey.savedHint')}</p>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-rule bg-paper px-2.5 py-1.5">
              <span className="text-xs text-muted shrink-0">{t('apiKey.getKeyNote')}</span>
              <code className="min-w-0 flex-1 truncate text-xs text-accent" title={PLATFORM_URL}>{PLATFORM_URL}</code>
              <button
                type="button"
                onClick={copyUrl}
                className="shrink-0 rounded border border-accent/40 px-2 py-0.5 text-xs font-medium text-accent hover:bg-accent/10 transition"
                aria-label={t('apiKey.copyLink')}
              >
                {copied ? t('apiKey.copied') : t('apiKey.copyLink')}
              </button>
            </div>
          )}

          {/* 图文教程入口：注册/创建 Key 的每一步都有截图，放在面板里方便边看边操作 */}
          <a
            href={`/${locale}/guides/api-key`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackApiKeyGuideClick()}
            className="flex items-center justify-between gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/10 transition"
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              {t('apiKey.guideLink')}
            </span>
            <span aria-hidden="true">→</span>
          </a>

          <ul className="text-xs text-muted space-y-1.5 pt-1">
            <li className="flex items-start gap-1.5">
              <span className="text-accent mt-px" aria-hidden="true">1</span>
              {t('apiKey.trustFree')}
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-accent mt-px" aria-hidden="true">2</span>
              {t('apiKey.trustLocal')}
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-accent mt-px" aria-hidden="true">3</span>
              {t('apiKey.trustOnce')}
            </li>
          </ul>

          {/* 域名配置：默认国际站，收进高级选项；三种线路对所有语言开放 */}
          <div className="border-t border-rule pt-3">
            <button
              type="button"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-ink-2 transition"
              aria-expanded={advancedOpen}
            >
              <svg className={`w-3 h-3 transition-transform ${advancedOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {t('apiKey.advanced')}
            </button>
            {advancedOpen && (
              <div className="mt-2 space-y-2">
                <span className="block text-xs text-muted">{t('domainLabel')}</span>
                <div className="flex gap-2">
                  {AGNES_DOMAINS.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => onDomainChange(d.id)}
                      className={`flex-1 py-1.5 text-xs rounded-lg border transition ${
                        domain === d.id
                          ? 'bg-accent border-accent text-accent-ink shadow-sm'
                          : 'bg-paper border-rule text-muted hover:text-ink-2 hover:bg-paper-3'
                      }`}
                      aria-pressed={domain === d.id}
                    >
                      {t(d.labelKey)}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted leading-relaxed">{t('domainHint')}</p>
              </div>
            )}
          </div>

          <div className="flex items-start gap-1.5 text-xs text-ink-2 bg-paper-3 rounded-lg p-2.5 border border-rule">
            <svg className="w-3.5 h-3.5 mt-px shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{t('apiKey.localOnly')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
