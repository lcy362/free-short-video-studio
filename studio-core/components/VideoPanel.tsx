'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useTranslations, useMessages, useLocale } from 'next-intl';
import PromptInput from './PromptInput';
import SelectorGroup from './SelectorGroup';
import GenerateButton from './GenerateButton';
import ProgressBar from './ProgressBar';
import MediaPreview from './MediaPreview';
import ModelPicker from './ModelPicker';
import ReferenceImageInput from './ReferenceImageInput';
import {
  DEFAULT_VIDEO_MODEL,
  formatRatioLabel,
  getModelCap,
  type VideoModelId,
  type VideoMode,
  type VideoRatio,
} from '../lib/demo-types';
import { fetchWithFailback } from '../lib/api-client';
import { trackDemoError } from '../lib/analytics';

type Status = 'idle' | 'submitting' | 'generating' | 'completed' | 'error';

const POLL_INTERVAL = 30000;
const MAX_POLL_TIME = 900_000;

// W3：提交被上游免费队列拒绝时的自动重试（实测 2.5-flash 可连续 25 次、跨 ~12 分钟全被拒）
const QUEUE_RETRY_MAX = 5;
const QUEUE_RETRY_INTERVAL = 30_000;
const QUEUE_RETRY_CODES = new Set(['video_queue_full', 'fail_to_fetch_task']);

/**
 * 上游 error 字段可能是字符串，也可能是 {code, message} 对象。
 * W1 崩页根因：直接把对象塞进字符串 state，渲染时 errorMsg.split 抛 TypeError。
 */
function parseUpstreamError(err: unknown): { message: string; code: string } {
  if (!err) return { message: '', code: '' };
  if (typeof err === 'string') return { message: err, code: '' };
  if (typeof err === 'object') {
    const e = err as { code?: unknown; message?: unknown };
    return {
      message: typeof e.message === 'string' ? e.message : JSON.stringify(err),
      code: typeof e.code === 'string' ? e.code : '',
    };
  }
  return { message: String(err), code: '' };
}

function extractVideoUrl(data: any): string | null {
  const videoUrl =
    data?.video_url
    || data?.url
    || data?.remixed_from_video_id
    || data?.data?.video_url
    || data?.data?.url
    || data?.result?.video_url
    || data?.result?.url
    || null;
  if (!videoUrl) return null;
  return videoUrl.startsWith('http://') || videoUrl.startsWith('https://') ? videoUrl : null;
}

export default function TextToVideo({ apiKey }: { apiKey: string }) {
  const t = useTranslations('demo');
  const locale = useLocale();
  const [model, setModel] = useState<VideoModelId>(DEFAULT_VIDEO_MODEL);
  const [mode, setMode] = useState<VideoMode>('text');
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState('5');
  const [ratio, setRatio] = useState<VideoRatio>('16:9');
  const [refImageUrl, setRefImageUrl] = useState('');
  const [refImageName, setRefImageName] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [pollCount, setPollCount] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [lastPollStatus, setLastPollStatus] = useState('');
  const [videoId, setVideoId] = useState('');
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [copied, setCopied] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 最后一次已知的上游状态/进度：超时终查失败时用于区分「仍在排队」与「渲染中」（W2）
  const lastApiStatusRef = useRef('pending');
  const lastProgressRef = useRef(0);
  // 用户点「重试」后中止仍在进行的自动重试（W3）
  const abortRef = useRef(false);
  const resumeCheckedRef = useRef(false);

  const messages = useMessages() as any;
  const samplePrompts: string[] = messages?.demo?.video?.samplePrompts ?? [
    'Slow motion waves crashing against rocky shores at golden hour, drone shot gradually ascending to reveal the vast coastline',
    'A misty bamboo forest at dawn, soft golden light filtering through the leaves, gentle wind swaying the tall stalks',
    'Aerial drone shot flying over a turquoise mountain lake surrounded by snow-capped peaks, mirror-perfect reflections',
    'A cozy village street in autumn, warm streetlights glowing through falling golden leaves, puddles reflecting the amber light',
    'Time-lapse of a starry night sky over a desert canyon, the Milky Way slowly rotating above ancient rock formations',
  ];

  const caps = getModelCap(model);

  // 按所选模型动态派生选项（参考源项目 useVideoModelCaps）
  const modeOptions = caps.modes.map((m) => ({ value: m.id, labelKey: m.labelKey }));
  const durationOptions = caps.durations.map((d) => ({ value: d, labelKey: `${d}s` }));
  // W5：2.5 系列只展示比例 + 720P（避免把示意像素当承诺值）
  const ratioOptions = caps.ratios.map((r) => ({
    value: r.value,
    label: formatRatioLabel(caps, r, (key) => t(key)),
  }));

  // 模型切换 → 修正表单默认值（选项集变化时避免非法值）
  const handleModelChange = (m: VideoModelId) => {
    setModel(m);
    const c = getModelCap(m);
    if (!c.modes.some((x) => x.id === mode)) setMode(c.modes[0].id);
    if (!c.durations.includes(duration)) setDuration(c.durations[0]);
    if (!c.ratios.some((r) => r.value === ratio)) setRatio(c.ratios[0].value);
  };

  // Pick a random sample prompt on each mount
  const randomPrompt = useMemo(
    () => samplePrompts[Math.floor(Math.random() * samplePrompts.length)],
    [],
  );

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // 结束态统一出口：写错误面板 + 上报（W7），错误码不再只存在于内存
  const finishWithError = useCallback(
    (code: string, msg: string) => {
      setStatus('error');
      setErrorCode(code);
      setErrorMsg(msg);
      stopPolling();
      trackDemoError({
        code,
        model,
        elapsed_s: startTimeRef.current
          ? Math.floor((Date.now() - startTimeRef.current) / 1000)
          : 0,
      });
    },
    [model, stopPolling],
  );

  // 单次状态查询（不含调度），供轮询与「超时终查」复用（W2）
  const queryStatus = useCallback(
    async (id: string) => {
      // 2.5 系列轮询需带 model_name
      const modelParam = `&model_name=${encodeURIComponent(model)}`;
      const resp = await fetchWithFailback(
        `/agnesapi?video_id=${encodeURIComponent(id)}${modelParam}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
        locale,
      );
      if (!resp.ok) return { ok: false as const, httpStatus: resp.status, data: null };
      const data = await resp.json();
      return { ok: true as const, httpStatus: resp.status, data };
    },
    [apiKey, locale, model],
  );

  const pollStatus = useCallback(
    async (id: string) => {
      const elapsed = Date.now() - startTimeRef.current;

      // ── W2：预算到点后强制再查一次终态，命中 failed 就给出上游真实原因 ──
      if (elapsed > MAX_POLL_TIME) {
        let data: any = null;
        try {
          const r = await queryStatus(id);
          if (r.ok) data = r.data;
        } catch {
          // 终查网络失败：退化为按最后一次已知状态分类
        }

        const apiStatus = String(data?.status || '').toLowerCase();
        if (data && apiStatus === 'completed') {
          const url = extractVideoUrl(data);
          if (url) {
            setResultUrl(url);
            setStatus('completed');
            stopPolling();
            return;
          }
        }
        if (data && apiStatus === 'failed') {
          const { message, code } = parseUpstreamError(data?.error);
          finishWithError(
            'videoFailed',
            `${t('errors.upstreamStuck')}\n${message || code || t('errors.videoFailed')}`,
          );
          return;
        }

        // 从未进入渲染（进度一直为 0）→ 上游仍在排队；否则是渲染中但超出本地预算
        const stillQueued =
          lastProgressRef.current === 0
          && (lastApiStatusRef.current === 'pending' || lastApiStatusRef.current === 'queued');

        if (stillQueued) {
          finishWithError('pollTimeoutQueued', t('errors.pollTimeoutQueued'));
        } else {
          finishWithError(
            'pollTimeoutRendering',
            `${t('errors.pollTimeoutRendering')}\n${t('errors.pollTimeout')}`,
          );
        }
        return;
      }

      setPollCount((c) => c + 1);

      try {
        const { ok, httpStatus, data } = await queryStatus(id);

        if (!ok) {
          setLastPollStatus(`HTTP ${httpStatus} (retrying...)`);
          pollTimerRef.current = setTimeout(() => pollStatus(id), POLL_INTERVAL);
          return;
        }

        const apiStatus = String(data?.status || 'pending').toLowerCase();
        const apiProgress = data?.progress ?? 0;

        lastApiStatusRef.current = apiStatus;
        lastProgressRef.current = apiProgress;
        setProgress(apiProgress);
        setLastPollStatus(`${apiStatus} (${apiProgress}%)`);

        if (apiStatus === 'completed') {
          const videoUrl = extractVideoUrl(data);
          if (videoUrl) {
            setResultUrl(videoUrl);
            setStatus('completed');
            stopPolling();
            return;
          }

          const keys = Object.keys(data).join(', ');
          setLastPollStatus(`completed (URL not found, fields: ${keys.slice(0, 80)})`);
          pollTimerRef.current = setTimeout(() => pollStatus(id), POLL_INTERVAL);
          return;
        }

        if (apiStatus === 'failed') {
          // ── W1：data.error 可能是对象，必须取 message/code，不能直接塞进字符串 state ──
          const { message, code } = parseUpstreamError(data?.error);
          finishWithError(
            'videoFailed',
            message || code
              ? `${t('errors.videoFailed')}\n${message || code}`
              : t('errors.videoFailed'),
          );
          return;
        }

        pollTimerRef.current = setTimeout(() => pollStatus(id), POLL_INTERVAL);
      } catch {
        setLastPollStatus('network error (retrying...)');
        pollTimerRef.current = setTimeout(() => pollStatus(id), POLL_INTERVAL);
      }
    },
    [queryStatus, finishWithError, t, stopPolling],
  );

  const handleGenerate = async () => {
    if (!prompt.trim() || !apiKey) return;

    startTimeRef.current = 0;
    abortRef.current = false;

    if (mode === 'image' && !refImageUrl) {
      finishWithError('missing_ref_image', t('video.refImageRequired'));
      return;
    }

    stopPolling();
    setStatus('submitting');
    setErrorMsg('');
    setErrorCode('');
    setProgress(0);
    setPollCount(0);
    setElapsedSeconds(0);
    setLastPollStatus('');
    setVideoId('');
    setRetryAttempt(0);
    setCopied(false);

    const payload: Record<string, unknown> = {
      model,
      prompt: prompt.trim(),
    };

    // ── 2.5 系列协议：mode / seconds / size / aspect_ratio ──
    // 固定 720P；不传 width/height/num_frames（旧版 v2.0 参数会返回 400 forbidden field）
    payload.mode = mode === 'image' ? 'reference' : 'text';
    payload.seconds = duration;
    payload.size = '720P';
    payload.aspect_ratio = ratio;
    if (mode === 'image' && refImageUrl) {
      payload.images = [refImageUrl];
    }

    // ── W3：提交侧有限次自动重试（上游免费队列饱和时会持续返回 503） ──
    for (let attempt = 0; attempt <= QUEUE_RETRY_MAX; attempt++) {
      if (abortRef.current) return;

      let result: { resp: Response; data: any } | null = null;
      try {
        const resp = await fetchWithFailback(
          '/v1/videos',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
          },
          locale,
        );
        const data = await resp.json();
        result = { resp, data };
      } catch {
        finishWithError('network', t('errors.network'));
        return;
      }

      const { resp, data } = result;

      if (resp.status === 401) {
        finishWithError('invalid_api_key', t('errors.invalidApiKey'));
        return;
      }

      if (resp.status === 429) {
        finishWithError('rate_limited', t('errors.rateLimited'));
        return;
      }

      if (!resp.ok) {
        const parsed = parseUpstreamError(data?.error);
        const code = parsed.code || (typeof data?.code === 'string' ? data.code : '');
        const queueFull = resp.status === 503 && QUEUE_RETRY_CODES.has(code);

        if (queueFull && attempt < QUEUE_RETRY_MAX) {
          const next = attempt + 1;
          setRetryAttempt(next);
          await new Promise((resolve) => setTimeout(resolve, QUEUE_RETRY_INTERVAL));
          continue;
        }

        if (queueFull) {
          finishWithError(
            'queue_full',
            `${t('errors.queueFullExhausted', { total: QUEUE_RETRY_MAX })}\n${parsed.message || code}`,
          );
          return;
        }

        const errMsg = parsed.message || JSON.stringify(data).slice(0, 300);
        finishWithError('upstream_error', `${t('errors.upstream')}\n${errMsg}`);
        return;
      }

      const id = data?.video_id || data?.task_id || data?.id;
      if (!id) {
        finishWithError('no_video_id', t('errors.noResult'));
        return;
      }

      setVideoId(String(id));
      setRetryAttempt(0);
      setStatus('generating');
      startTimeRef.current = Date.now();
      lastApiStatusRef.current = 'pending';
      lastProgressRef.current = 0;
      elapsedTimerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
      pollStatus(String(id));
      return;
    }
  };

  const handleReset = () => {
    // 中止仍在进行的队列自动重试（W3）
    abortRef.current = true;
    stopPolling();
    setStatus('idle');
    setResultUrl('');
    setErrorMsg('');
    setErrorCode('');
    setProgress(0);
    setPollCount(0);
    setElapsedSeconds(0);
    setLastPollStatus('');
    setRetryAttempt(0);
    setCopied(false);
  };

  // W6：从 ?video_id=xxx 恢复轮询 —— 错误面板「稍后查看结果」链接指向此处，纯前端，无需后端
  useEffect(() => {
    if (resumeCheckedRef.current) return;
    resumeCheckedRef.current = true;
    if (typeof window === 'undefined' || !apiKey) return;

    const id = new URLSearchParams(window.location.search).get('video_id');
    if (!id) return;

    setVideoId(id);
    setStatus('generating');
    startTimeRef.current = Date.now();
    lastApiStatusRef.current = 'pending';
    lastProgressRef.current = 0;
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    pollStatus(id);
  }, [apiKey, pollStatus]);

  const handleCopyVideoId = async () => {
    if (!videoId) return;
    try {
      await navigator.clipboard.writeText(videoId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板不可用（非 HTTPS / 权限拒绝）时忽略，ID 仍在页面上可手动复制
    }
  };

  const isBusy = status === 'submitting' || status === 'generating';

  return (
    <div className="space-y-5">
      {/* 模型选择（参考源项目：选模型阶段差异说明） */}
      <ModelPicker value={model} onChange={handleModelChange} disabled={isBusy} />

      {/* 生成模式：文生视频 / 图生视频 */}
      <SelectorGroup
        label={t('video.mode')}
        options={modeOptions}
        value={mode}
        onChange={setMode}
        disabled={isBusy}
      />

      {mode === 'image' && (
        <ReferenceImageInput
          dataUrl={refImageUrl}
          fileName={refImageName}
          onSelect={(url, name) => {
            setRefImageUrl(url);
            setRefImageName(name);
          }}
          onClear={() => {
            setRefImageUrl('');
            setRefImageName('');
          }}
          disabled={isBusy}
          hint={t('video.refImageHint')}
        />
      )}

      <PromptInput
        value={prompt}
        onChange={setPrompt}
        disabled={isBusy}
        placeholderKey="video.promptPlaceholder"
        suggestions={samplePrompts}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SelectorGroup
          label={t('video.duration')}
          options={durationOptions}
          value={duration}
          onChange={setDuration}
          disabled={isBusy}
        />
        <SelectorGroup
          label={t('video.ratio')}
          options={ratioOptions}
          value={ratio}
          onChange={setRatio}
          disabled={isBusy}
        />
      </div>

      {status !== 'completed' && status !== 'generating' && (
        <>
          <GenerateButton
            onClick={handleGenerate}
            loading={status === 'submitting'}
            disabled={!prompt.trim() || !apiKey}
            label={t('video.generate')}
            loadingLabel={
              retryAttempt > 0
                ? t('errors.queueFull', { current: retryAttempt, total: QUEUE_RETRY_MAX })
                : t('video.submitting')
            }
          />
          <p className="text-xs text-muted text-center">
            <svg className="inline w-3.5 h-3.5 me-1 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {t('video.timeHint')}
          </p>
        </>
      )}

      {status === 'generating' && (
        <ProgressBar
          progress={progress}
          estimatedMinutes={Number(duration)}
          pollCount={pollCount}
          elapsedSeconds={elapsedSeconds}
          lastPollStatus={lastPollStatus}
        />
      )}

      {status === 'completed' && resultUrl && (
        <MediaPreview
          type="video"
          url={resultUrl}
          apiKey={apiKey}
          onRegenerate={handleReset}
          // W4：2.5 系列 9:16 上游产物画面躺倒（容器 720×1280、无 rotation 元数据）
          orientationHint={ratio === '9:16'}
        />
      )}

      {status === 'error' && (
        <div className="p-4 rounded-xl bg-danger/10 border border-danger/20">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-danger mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              {/* W6：失败后保留 video_id，用户可复制并稍后回查终态 */}
              {videoId && (
                <div className="pt-1.5 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-danger/70 font-mono break-all">{videoId}</span>
                    <button
                      type="button"
                      onClick={handleCopyVideoId}
                      className="text-xs text-accent hover:text-ink transition-colors"
                    >
                      {copied ? t('copied') : t('errors.copyVideoId')}
                    </button>
                  </div>
                  <a
                    href={`?video_id=${encodeURIComponent(videoId)}`}
                    className="inline-block text-xs text-accent hover:text-ink transition-colors underline underline-offset-2"
                  >
                    {t('errors.checkLater')}
                  </a>
                </div>
              )}
            </div>
          </div>
          <button onClick={handleReset} className="mt-3 text-sm text-accent hover:text-ink transition-colors">
            {t('retry')}
          </button>
        </div>
      )}
    </div>
  );
}
