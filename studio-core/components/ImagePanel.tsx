'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations, useMessages, useLocale } from 'next-intl';
import PromptInput from './PromptInput';
import SelectorGroup from './SelectorGroup';
import GenerateButton from './GenerateButton';
import MediaPreview from './MediaPreview';
import { SIZE_OPTIONS } from '../lib/demo-types';
import { fetchWithFailback } from '../lib/api-client';
import {
  trackApiKeyPanelFocus,
  trackGenerationStart,
  trackGenerationSuccess,
  trackGetKeyClick,
  trackImageError,
} from '../lib/analytics';
import { readPrefillPrompt } from '../lib/prompt-prefill';
import { createLibraryItem, updateLibraryItem } from '../lib/library-store';
import { useGenerationAbandon } from '../lib/use-generation-abandon';
import DemoErrorLinks from './DemoErrorLinks';

const IMAGE_MODEL = 'agnes-image-2.1-flash';

type Status = 'idle' | 'generating' | 'completed' | 'error';

export default function TextToImage({ apiKey }: Readonly<{ apiKey: string }>) {
  const t = useTranslations('demo');
  const locale = useLocale();
  const messages = useMessages() as any;
  const samplePrompts: string[] = messages?.demo?.image?.samplePrompts ?? [
    'A Shiba Inu smiling under cherry blossoms, soft bokeh background, warm spring sunlight',
    'An enchanted treehouse village in a misty forest, fairy lights glowing between ancient oaks',
    'A futuristic cyberpunk city street at night, neon signs reflecting on wet pavement, flying cars overhead',
    'A cozy reading nook by a rainy window, warm lamplight, stacks of old books, a steaming cup of tea',
    'A majestic white tiger walking through a snow-covered pine forest, soft diffused light, cinematic composition',
  ];
  const [prompt, setPrompt] = useState('');
  // 从首页 / Showcase 带过来的预填提示词（?prompt=），水合后再注入
  useEffect(() => {
    const prefill = readPrefillPrompt();
    if (prefill) setPrompt(prefill);
  }, []);
  const [size, setSize] = useState('1024x1024');
  const [status, setStatus] = useState<Status>('idle');
  const [resultUrl, setResultUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [errorCode, setErrorCode] = useState('');
  // 出图耗时（埋点用）
  const startedAtRef = useRef(0);
  // 作品库记录 id
  const libraryItemIdRef = useRef('');

  // 页面卸载时出图仍在跑 → abandon
  useGenerationAbandon({
    active: status === 'generating',
    tab: 'image',
    model: IMAGE_MODEL,
    startedAt: startedAtRef.current,
  });

  const handleGenerate = async () => {
    if (!prompt.trim() || !apiKey) return;
    setStatus('generating');
    setErrorMsg('');
    setErrorCode('');
    startedAtRef.current = Date.now();
    trackGenerationStart({ tab: 'image', model: IMAGE_MODEL, mode: 'text', ratio: size });
    libraryItemIdRef.current = createLibraryItem({
      kind: 'image',
      status: 'running',
      title: prompt.trim().slice(0, 100),
      prompt: prompt.trim().slice(0, 4000),
      model: IMAGE_MODEL,
      ratio: size,
    }).id;

    try {
      const resp = await fetchWithFailback(
        '/v1/images/generations',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: IMAGE_MODEL,
            prompt: prompt.trim(),
            size: size,
            n: 1,
          }),
        },
        locale,
      );

      const data = await resp.json();

      const fail = (code: string, msg: string) => {
        setErrorCode(code);
        setErrorMsg(msg);
        setStatus('error');
        updateLibraryItem(libraryItemIdRef.current, { status: 'error', errorCode: code });
        trackImageError({
          code,
          model: IMAGE_MODEL,
          elapsed_s: startedAtRef.current
            ? Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000))
            : 0,
        });
      };

      if (resp.status === 401) {
        fail('invalid_api_key', t('errors.invalidApiKey'));
        return;
      }

      if (resp.status === 429) {
        fail('rate_limited', t('errors.rateLimited'));
        return;
      }

      if (!resp.ok) {
        const errMsg = data?.error?.message || data?.error || JSON.stringify(data).slice(0, 300);
        fail('upstream_error', `${t('errors.upstream')}\n${errMsg}`);
        return;
      }

      const imageUrl = data?.data?.[0]?.url;
      if (!imageUrl) {
        fail('no_image_url', t('errors.noResult'));
        return;
      }

      setResultUrl(imageUrl);
      setStatus('completed');
      updateLibraryItem(libraryItemIdRef.current, { status: 'completed', mediaUrl: imageUrl });
      trackGenerationSuccess({
        tab: 'image',
        model: IMAGE_MODEL,
        elapsed_s: startedAtRef.current
          ? Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000))
          : 0,
        retry_count: 0,
      });
    } catch {
      setErrorCode('network');
      setErrorMsg(t('errors.network'));
      setStatus('error');
      updateLibraryItem(libraryItemIdRef.current, { status: 'error', errorCode: 'network' });
      trackImageError({
        code: 'network',
        model: IMAGE_MODEL,
        elapsed_s: startedAtRef.current
          ? Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000))
          : 0,
      });
    }
  };

  const handleReset = () => {
    setStatus('idle');
    setResultUrl('');
    setErrorMsg('');
    setErrorCode('');
    libraryItemIdRef.current = '';
  };

  return (
    <div className="space-y-5">
      <PromptInput
        value={prompt}
        onChange={setPrompt}
        disabled={status === 'generating'}
        placeholderKey="image.promptPlaceholder"
        suggestions={samplePrompts}
      />

      <SelectorGroup
        label={t('image.size')}
        options={SIZE_OPTIONS}
        value={size}
        onChange={setSize}
        disabled={status === 'generating'}
      />

      {status !== 'completed' && (
        <>
          {!apiKey && (
            <div className="rounded-xl border border-accent/25 bg-accent/5 p-3 space-y-2 text-center">
              <p className="text-sm text-ink-2">{t('apiKey.noKeyTitle')}</p>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                <button
                  type="button"
                  onClick={() => {
                    trackApiKeyPanelFocus({ tab: 'image' });
                    document.getElementById('api-key-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    document.getElementById('api-key-input')?.focus();
                  }}
                  className="text-sm font-medium text-accent hover:underline"
                >
                  {t('apiKey.noKeyCta')} →
                </button>
                <a
                  href="https://platform.agnes-ai.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackGetKeyClick({ from: 'generate' })}
                  className="text-xs text-muted hover:text-ink transition"
                >
                  {t('apiKey.noKeyGet')}
                </a>
              </div>
            </div>
          )}
          <GenerateButton
            onClick={handleGenerate}
            loading={status === 'generating'}
            disabled={!prompt.trim() || !apiKey}
            label={t('image.generate')}
            loadingLabel={t('image.generating')}
          />
        </>
      )}

      {status === 'completed' && resultUrl && (
        <MediaPreview type="image" url={resultUrl} apiKey={apiKey} onRegenerate={handleReset} />
      )}

      {status === 'error' && (
        <div className="p-4 rounded-xl bg-danger/10 border border-danger/20">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-danger mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="space-y-1 min-w-0">
              <p className="text-sm text-danger font-medium">
                {errorMsg.split('\n')[0]}
              </p>
              {errorMsg.includes('\n') && (
                <p className="text-xs text-danger/70 break-all font-mono">
                  {errorMsg.split('\n').slice(1).join('\n')}
                </p>
              )}
              {errorCode === 'invalid_api_key' && (
                <p className="text-xs text-danger/70">{t('errors.checkApiKey')}</p>
              )}
              <DemoErrorLinks code={errorCode} />
            </div>
          </div>
          <button
            onClick={handleReset}
            className="mt-3 text-sm text-accent hover:text-ink transition-colors"
          >
            {t('retry')}
          </button>
        </div>
      )}
    </div>
  );
}
