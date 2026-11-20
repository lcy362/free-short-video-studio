'use client';

import { useRef, useState } from 'react';
import { useTranslations, useMessages, useLocale } from 'next-intl';
import PromptInput from './PromptInput';
import SelectorGroup from './SelectorGroup';
import GenerateButton from './GenerateButton';
import MediaPreview from './MediaPreview';
import { SIZE_OPTIONS } from '../lib/demo-types';
import { fetchWithFailback } from '../lib/api-client';
import { trackGenerationStart, trackGenerationSuccess } from '../lib/analytics';
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
  const [size, setSize] = useState('1024x1024');
  const [status, setStatus] = useState<Status>('idle');
  const [resultUrl, setResultUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [errorCode, setErrorCode] = useState('');
  // 出图耗时（埋点用）
  const startedAtRef = useRef(0);

  const handleGenerate = async () => {
    if (!prompt.trim() || !apiKey) return;
    setStatus('generating');
    setErrorMsg('');
    setErrorCode('');
    startedAtRef.current = Date.now();
    trackGenerationStart({ tab: 'image', model: IMAGE_MODEL, mode: 'text', ratio: size });

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

      if (resp.status === 401) {
        setErrorCode('invalid_api_key');
        setErrorMsg(t('errors.invalidApiKey'));
        setStatus('error');
        return;
      }

      if (resp.status === 429) {
        setErrorCode('rate_limited');
        setErrorMsg(t('errors.rateLimited'));
        setStatus('error');
        return;
      }

      if (!resp.ok) {
        setErrorCode('upstream_error');
        const errMsg = data?.error?.message || data?.error || JSON.stringify(data).slice(0, 300);
        setErrorMsg(`${t('errors.upstream')}\n${errMsg}`);
        setStatus('error');
        return;
      }

      const imageUrl = data?.data?.[0]?.url;
      if (!imageUrl) {
        setErrorCode('no_image_url');
        setErrorMsg(t('errors.noResult'));
        setStatus('error');
        return;
      }

      setResultUrl(imageUrl);
      setStatus('completed');
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
    }
  };

  const handleReset = () => {
    setStatus('idle');
    setResultUrl('');
    setErrorMsg('');
    setErrorCode('');
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
            <p className="text-sm text-muted text-center">{t('apiKey.requiredHint')}</p>
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
