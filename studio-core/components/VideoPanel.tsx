'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslations, useMessages, useLocale } from 'next-intl';
import PromptInput from './PromptInput';
import SelectorGroup from './SelectorGroup';
import GenerateButton from './GenerateButton';
import ProgressBar from './ProgressBar';
import MediaPreview from './MediaPreview';
import ModelPicker from './ModelPicker';
import RefImagesInput, { type RefImageItem } from './RefImagesInput';
import FastRetryControl, { type FastRetryPhase } from './FastRetryControl';
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
import {
  DEFAULT_FAST_RETRY_SETTINGS,
  EMPTY_FAST_RETRY_RUN,
  SLOW_RETRY_MAX,
  decideRetry,
  fastRetryRemainingMs,
  formatRemaining,
  isFastRetryAvailable,
  loadFastRetrySettings,
  saveFastRetrySettings,
  type FastRetryRun,
  type FastRetrySettings,
} from '../lib/fast-retry';

type Status = 'idle' | 'submitting' | 'generating' | 'completed' | 'error';

const POLL_INTERVAL = 30000;
const MAX_POLL_TIME = 900_000;

// 上游免费队列饱和时返回的错误码（被拒发生在入队前，不消耗渲染配额）
const QUEUE_RETRY_CODES = new Set(['video_queue_full', 'fail_to_fetch_task']);

const isHttpUrl = (url: string) => /^https?:\/\//i.test(url);

/**
 * 上游 error 字段可能是字符串，也可能是 {code, message} 对象。
 * W1 崩页根因：直接把对象塞进字符串 state，渲染时 errorMsg.split 抛 TypeError。
 */
function parseUpstreamError(err: unknown): { message: string; code: string } {
  if (!err) return { message: '', code: '' };
  if (typeof err === 'string') return { message: err, code: '' };
  // 数字 / 布尔 / bigint 直接可读；symbol / function 没有可展示内容
  if (typeof err === 'number' || typeof err === 'boolean' || typeof err === 'bigint') {
    return { message: String(err), code: '' };
  }
  if (typeof err === 'object') {
    const e = err as { code?: unknown; message?: unknown };
    return {
      message: typeof e.message === 'string' ? e.message : JSON.stringify(err),
      code: typeof e.code === 'string' ? e.code : '',
    };
  }
  return { message: '', code: '' };
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

/** 提交一次的结果：成功拿到 id / 免费队列饱和（可重试）/ 终止性失败 */
type SubmitOutcome =
  | { kind: 'submitted'; data: any }
  | { kind: 'queue_full'; detail: string }
  | { kind: 'failed'; code: string; detail: string };

/** 把 /v1/videos 的响应归类（拆分出来是为了压住 handleGenerate 的圈复杂度） */
function classifySubmitResponse(resp: Response, data: any): SubmitOutcome {
  if (resp.status === 401) return { kind: 'failed', code: 'invalid_api_key', detail: '' };
  if (resp.status === 429) return { kind: 'failed', code: 'rate_limited', detail: '' };

  if (!resp.ok) {
    const parsed = parseUpstreamError(data?.error);
    const code = parsed.code || (typeof data?.code === 'string' ? data.code : '');
    if (resp.status === 503 && QUEUE_RETRY_CODES.has(code)) {
      return { kind: 'queue_full', detail: parsed.message || code };
    }
    return {
      kind: 'failed',
      code: 'upstream_error',
      detail: parsed.message || JSON.stringify(data).slice(0, 300),
    };
  }

  const id = data?.video_id || data?.task_id || data?.id;
  if (!id) return { kind: 'failed', code: 'no_video_id', detail: '' };
  return { kind: 'submitted', data };
}

/** 单次提交（不含队列重试） */
async function requestSubmitOnce(
  payload: Record<string, unknown>,
  apiKey: string,
  locale: string,
): Promise<SubmitOutcome> {
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
    return classifySubmitResponse(resp, await resp.json());
  } catch {
    return { kind: 'failed', code: 'network', detail: '' };
  }
}

export default function TextToVideo({ apiKey }: Readonly<{ apiKey: string }>) {
  const t = useTranslations('demo');
  const locale = useLocale();
  const [model, setModel] = useState<VideoModelId>(DEFAULT_VIDEO_MODEL);
  const [mode, setMode] = useState<VideoMode>('text');
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState('5');
  const [ratio, setRatio] = useState<VideoRatio>('16:9');
  const [refImages, setRefImages] = useState<RefImageItem[]>([]);
  const [frames, setFrames] = useState<RefImageItem[]>([]);
  const [audioUrls, setAudioUrls] = useState<string[]>(['']);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [pollCount, setPollCount] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [lastPollStatus, setLastPollStatus] = useState('');
  const [videoId, setVideoId] = useState('');
  const [copied, setCopied] = useState(false);

  // ── 队列重试 / 快速重试 ──
  // 初值用默认，挂载后再读 localStorage（与 StudioClient 一致，避免 SSR/水合不一致）
  const [fastSettings, setFastSettings] = useState<FastRetrySettings>(DEFAULT_FAST_RETRY_SETTINGS);
  const [busyStreak, setBusyStreak] = useState(0);
  const [slowAttempt, setSlowAttempt] = useState(0);
  const [fastRun, setFastRun] = useState<{ startedAt: number; attempts: number } | null>(null);
  const [fastExpired, setFastExpired] = useState(false);
  const [tick, setTick] = useState(0);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 最后一次已知的上游状态/进度：超时终查失败时用于区分「仍在排队」与「渲染中」（W2）
  const lastApiStatusRef = useRef('pending');
  const lastProgressRef = useRef(0);
  // 用户点「重试」后中止仍在进行的自动重试（W3）
  const abortRef = useRef(false);
  const resumeCheckedRef = useRef(false);
  // 本轮重试状态（ref 供递归提交循环读取，避免闭包拿到旧值）
  const runRef = useRef<FastRetryRun>({ ...EMPTY_FAST_RETRY_RUN });
  const fastSettingsRef = useRef(fastSettings);
  // 可被「手动开启快速重试」提前唤醒的等待器
  const sleepRef = useRef<{ timer: ReturnType<typeof setTimeout>; resolve: () => void } | null>(null);

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

  const fastMinutes = fastSettings.minutes;
  useEffect(() => {
    fastSettingsRef.current = fastSettings;
  }, [fastSettings]);

  // 读取上次保存的快速重试设置（自动开关 + x / y）
  useEffect(() => {
    const loaded = loadFastRetrySettings();
    fastSettingsRef.current = loaded;
    setFastSettings(loaded);
  }, []);

  // 快速重试剩余时间需要每秒重算（源项目用本地时钟，不额外轮询）
  useEffect(() => {
    if (!fastRun) return;
    setTick(Date.now());
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [fastRun]);

  // 模型切换 → 修正表单默认值（选项集变化时避免非法值）
  const handleModelChange = (m: VideoModelId) => {
    setModel(m);
    const c = getModelCap(m);
    if (!c.modes.some((x) => x.id === mode)) setMode(c.modes[0].id);
    if (!c.durations.includes(duration)) setDuration(c.durations[0]);
    if (!c.ratios.some((r) => r.value === ratio)) setRatio(c.ratios[0].value);
  };

  const clearSleep = useCallback(() => {
    const s = sleepRef.current;
    if (!s) return;
    clearTimeout(s.timer);
    sleepRef.current = null;
    s.resolve();
  }, []);

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
    return () => {
      stopPolling();
      clearSleep();
    };
  }, [clearSleep, stopPolling]);

  /** 清空队列/快速重试的展示状态 */
  const resetRetryUi = useCallback(() => {
    setBusyStreak(0);
    setSlowAttempt(0);
    setFastRun(null);
    setFastExpired(false);
  }, []);

  // 结束态统一出口：写错误面板 + 上报（W7），错误码不再只存在于内存
  const finishWithError = useCallback(
    (code: string, msg: string) => {
      setStatus('error');
      setErrorCode(code);
      setErrorMsg(msg);
      stopPolling();
      resetRetryUi();
      trackDemoError({
        code,
        model,
        elapsed_s: startTimeRef.current
          ? Math.floor((Date.now() - startTimeRef.current) / 1000)
          : 0,
      });
    },
    [model, resetRetryUi, stopPolling],
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

  /**
   * W2：预算到点后强制再查一次终态。
   * 终态 completed/failed 直接收尾；查不到就按「仍在排队 / 渲染中」给出不同错误原因。
   */
  const finishTimedOutPoll = useCallback(
    async (id: string) => {
      let data: any = null;
      try {
        const r = await queryStatus(id);
        if (r.ok) data = r.data;
      } catch {
        // 终查网络失败：退化为按最后一次已知状态分类
      }

      const apiStatus = String(data?.status || '').toLowerCase();
      const videoUrl = data && apiStatus === 'completed' ? extractVideoUrl(data) : null;
      if (videoUrl) {
        setResultUrl(videoUrl);
        setStatus('completed');
        stopPolling();
        return;
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
        return;
      }
      finishWithError(
        'pollTimeoutRendering',
        `${t('errors.pollTimeoutRendering')}\n${t('errors.pollTimeout')}`,
      );
    },
    [finishWithError, queryStatus, stopPolling, t],
  );

  /** 处理一次成功的状态查询：到终态则收尾并返回 false（不再轮询），否则返回 true */
  const applyPollData = useCallback(
    (data: any): boolean => {
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
          return false;
        }
        const keys = Object.keys(data).join(', ');
        setLastPollStatus(`completed (URL not found, fields: ${keys.slice(0, 80)})`);
        return true;
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
        return false;
      }

      return true;
    },
    [finishWithError, stopPolling, t],
  );

  const pollStatus = useCallback(
    async (id: string) => {
      const scheduleNextPoll = () => {
        pollTimerRef.current = setTimeout(() => pollStatus(id), POLL_INTERVAL);
      };

      if (Date.now() - startTimeRef.current > MAX_POLL_TIME) {
        await finishTimedOutPoll(id);
        return;
      }

      setPollCount((c) => c + 1);

      try {
        const { ok, httpStatus, data } = await queryStatus(id);

        if (!ok) {
          setLastPollStatus(`HTTP ${httpStatus} (retrying...)`);
          scheduleNextPoll();
          return;
        }
        if (applyPollData(data)) scheduleNextPoll();
      } catch {
        setLastPollStatus('network error (retrying...)');
        scheduleNextPoll();
      }
    },
    [applyPollData, finishTimedOutPoll, queryStatus],
  );

  /** 提交成功后进入生成态：起计时器 + 开始轮询 */
  const beginPolling = useCallback(
    (id: string) => {
      setVideoId(id);
      setStatus('generating');
      startTimeRef.current = Date.now();
      lastApiStatusRef.current = 'pending';
      lastProgressRef.current = 0;
      elapsedTimerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
      pollStatus(id);
    },
    [pollStatus],
  );

  /** 把提交失败的 code 映射成用户可读的终态错误 */
  const finishSubmitError = useCallback(
    (code: string, detail: string) => {
      switch (code) {
        case 'network':
          finishWithError('network', t('errors.network'));
          return;
        case 'invalid_api_key':
          finishWithError('invalid_api_key', t('errors.invalidApiKey'));
          return;
        case 'rate_limited':
          finishWithError('rate_limited', t('errors.rateLimited'));
          return;
        case 'no_video_id':
          finishWithError('no_video_id', t('errors.noResult'));
          return;
        default:
          finishWithError('upstream_error', `${t('errors.upstream')}\n${detail}`);
      }
    },
    [finishWithError, t],
  );

  /** 可被手动唤醒的等待（手动开启快速重试时可跳过剩余等待） */
  const wait = useCallback((ms: number) => new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      sleepRef.current = null;
      resolve();
    }, ms);
    sleepRef.current = { timer, resolve };
  }), []);

  /**
   * ── 队列重试循环（慢速 5×30s + 快速重试模式）──
   * 每次收到忙信号都交给 `decideRetry` 判定下一跳节奏；必须串行，用递归而不是 for + await。
   */
  const submitLoop = useCallback(
    async (payload: Record<string, unknown>): Promise<void> => {
      const run = runRef.current;
      const outcome = await requestSubmitOnce(payload, apiKey, locale);
      if (abortRef.current) return;

      if (outcome.kind === 'submitted') {
        resetRetryUi();
        const id = String(outcome.data.video_id || outcome.data.task_id || outcome.data.id);
        beginPolling(id);
        return;
      }

      if (outcome.kind === 'failed') {
        finishSubmitError(outcome.code, outcome.detail);
        return;
      }

      // ── 上游免费队列饱和：累计忙信号，决定下一跳节奏 ──
      run.busyStreak += 1;
      if (run.fastStartedAt) run.fastAttempts += 1;
      setBusyStreak(run.busyStreak);

      const decision = decideRetry({ settings: fastSettingsRef.current, run });

      if (decision.mode === 'exhausted') {
        const total = run.slowAttempts + run.fastAttempts;
        finishWithError(
          'queue_full',
          `${t('errors.queueFullExhausted', { total: Math.max(total, SLOW_RETRY_MAX) })}\n${outcome.detail}`,
        );
        return;
      }

      if (decision.mode === 'fast') {
        if (decision.startNow) {
          // 连续 2 次忙信号 + 设置已开启自动 → 直接进入快速连打
          run.fastStartedAt = Date.now();
          run.fastAttempts = 0;
        }
        setFastExpired(false);
        setFastRun({ startedAt: run.fastStartedAt, attempts: run.fastAttempts });
      } else {
        run.slowAttempts += 1;
        if (decision.reason === 'expired') {
          // 快速模式到期：回到常规节奏并清零忙信号（需重新累计 2 次才再自动开启）
          run.fastStartedAt = 0;
          run.fastAttempts = 0;
          run.busyStreak = 0;
          setFastRun(null);
          setFastExpired(true);
          setBusyStreak(0);
        }
        setSlowAttempt(run.slowAttempts);
      }

      await wait(decision.intervalMs);
      if (abortRef.current) return;
      return submitLoop(payload);
    },
    [apiKey, beginPolling, finishSubmitError, finishWithError, locale, resetRetryUi, t, wait],
  );

  /** 把参考音频输入收敛为合法 URL 列表（≤ 模型上限） */
  const collectAudioUrls = (): string[] =>
    audioUrls
      .map((u) => u.trim())
      .filter((u) => u.length > 0 && isHttpUrl(u))
      .slice(0, caps.maxRefAudios);

  /** 组装 /v1/videos 请求体（2.5 协议：mode / seconds / size / aspect_ratio + 素材） */
  const buildSubmitPayload = (): Record<string, unknown> => {
    // 固定 720P；不传 width/height/num_frames（旧版 v2.0 参数会返回 400 forbidden field）
    const payload: Record<string, unknown> = {
      model,
      prompt: prompt.trim(),
      seconds: duration,
      size: '720P',
      aspect_ratio: ratio,
    };

    if (mode === 'image') {
      payload.mode = 'reference';
      if (refImages.length) payload.images = refImages.map((i) => i.dataUrl);
      const audios = collectAudioUrls();
      if (audios.length) payload.audios = audios;
      return payload;
    }

    if (mode === 'keyframe') {
      payload.mode = 'keyframe';
      if (frames[0]) payload.first_frame = frames[0].dataUrl;
      if (frames[1]) payload.last_frame = frames[1].dataUrl;
      return payload;
    }

    payload.mode = 'text';
    return payload;
  };

  /** 清空上一次运行的展示状态 */
  const resetRunState = () => {
    stopPolling();
    clearSleep();
    setStatus('submitting');
    setErrorMsg('');
    setErrorCode('');
    setProgress(0);
    setPollCount(0);
    setElapsedSeconds(0);
    setLastPollStatus('');
    setVideoId('');
    setCopied(false);
    resetRetryUi();
    runRef.current = { ...EMPTY_FAST_RETRY_RUN };
  };

  /** 生成前校验素材（对齐接口语义：reference 至少 1 图或 1 音频；keyframe 至少首帧） */
  const validateMaterials = (): boolean => {
    const rawAudios = audioUrls.map((u) => u.trim()).filter(Boolean);
    if (rawAudios.some((u) => !isHttpUrl(u))) {
      finishWithError('invalid_audio_url', t('video.audioUrlInvalid'));
      return false;
    }
    if (mode === 'image' && !refImages.length && !rawAudios.length) {
      finishWithError('missing_ref_image', t('video.refImageRequired'));
      return false;
    }
    if (mode === 'keyframe' && !frames.length) {
      finishWithError('missing_first_frame', t('video.keyframeRequired'));
      return false;
    }
    return true;
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || !apiKey) return;

    startTimeRef.current = 0;
    abortRef.current = false;

    if (!validateMaterials()) return;

    resetRunState();
    await submitLoop(buildSubmitPayload());
  };

  const handleReset = () => {
    // 中止仍在进行的队列自动重试（W3）
    abortRef.current = true;
    clearSleep();
    stopPolling();
    setStatus('idle');
    setResultUrl('');
    setErrorMsg('');
    setErrorCode('');
    setProgress(0);
    setPollCount(0);
    setElapsedSeconds(0);
    setLastPollStatus('');
    setCopied(false);
    resetRetryUi();
  };

  /** 设置变更：持久化 + 供循环读取 */
  const handleFastSettingsChange = (next: FastRetrySettings) => {
    setFastSettings(next);
    fastSettingsRef.current = next;
    saveFastRetrySettings(next);
  };

  /** 一次性开启快速重试（未开自动时的手动入口，跳过剩余等待立即连打） */
  const handleStartFastRetry = () => {
    const run = runRef.current;
    run.fastStartedAt = Date.now();
    run.fastAttempts = 0;
    run.autoOff = false;
    setFastExpired(false);
    setFastRun({ startedAt: run.fastStartedAt, attempts: 0 });
    clearSleep();
  };

  /** 停止快速重试（本轮不再被自动模式拉起） */
  const handleStopFastRetry = () => {
    const run = runRef.current;
    run.fastStartedAt = 0;
    run.fastAttempts = 0;
    run.busyStreak = 0;
    run.autoOff = true;
    setFastRun(null);
    setBusyStreak(0);
    setFastExpired(false);
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
  const remainingMs = fastRun
    ? fastRetryRemainingMs(fastRun.startedAt, fastMinutes, tick || Date.now())
    : 0;
  const retryPhase: FastRetryPhase = fastRun
    ? 'active'
    : isFastRetryAvailable({ ...runRef.current, busyStreak }, fastSettings)
      ? 'available'
      : 'idle';

  const retryLoadingLabel = (): string => {
    if (fastRun) {
      return t('errors.fastRetryActive', {
        n: fastRun.attempts,
        x: formatRemaining(remainingMs),
      });
    }
    if (slowAttempt > 0) {
      return t('errors.queueFull', { current: slowAttempt, total: SLOW_RETRY_MAX });
    }
    return t('video.submitting');
  };

  const updateAudioUrl = (index: number, value: string) => {
    setAudioUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
  };

  return (
    <div className="space-y-5">
      {/* 模型选择（参考源项目：选模型阶段差异说明） */}
      <ModelPicker value={model} onChange={handleModelChange} disabled={isBusy} />

      {/* 生成模式：文生视频 / 图生视频（多图参考） / 首尾帧 */}
      <SelectorGroup
        label={t('video.mode')}
        options={modeOptions}
        value={mode}
        onChange={setMode}
        disabled={isBusy}
      />

      {mode === 'image' && (
        <div className="space-y-4">
          <RefImagesInput
            label={t('video.refImage')}
            items={refImages}
            max={caps.maxRefImages}
            onAdd={(items) => setRefImages((prev) => [...prev, ...items].slice(0, caps.maxRefImages))}
            onRemove={(index) => setRefImages((prev) => prev.filter((_, i) => i !== index))}
            disabled={isBusy}
            hint={t('video.refImagesHint', { max: caps.maxRefImages })}
          />

          {/* 参考音频：仅接受公开 http(s) URL，上游 ≤3 段 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink-2">{t('video.audioUrls')}</span>
              {audioUrls.length < caps.maxRefAudios && !isBusy && (
                <button
                  type="button"
                  onClick={() => setAudioUrls((prev) => [...prev, ''])}
                  className="text-xs text-accent hover:text-ink transition-colors"
                >
                  + {t('video.addAudio')}
                </button>
              )}
            </div>
            {audioUrls.map((url, index) => (
              <div key={`audio-${index}`} className="flex items-center gap-2">
                <input
                  type="url"
                  value={url}
                  disabled={isBusy}
                  onChange={(e) => updateAudioUrl(index, e.target.value)}
                  placeholder="https://..."
                  aria-label={`${t('video.audioUrls')} ${index + 1}`}
                  className="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg bg-paper border border-rule text-ink placeholder:text-muted focus:border-accent outline-none disabled:opacity-50"
                />
                {audioUrls.length > 1 && !isBusy && (
                  <button
                    type="button"
                    onClick={() => setAudioUrls((prev) => prev.filter((_, i) => i !== index))}
                    aria-label={`${t('video.clearImage')} ${index + 1}`}
                    className="text-xs text-muted hover:text-danger transition-colors"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <p className="text-xs text-muted">{t('video.audioUrlHint', { max: caps.maxRefAudios })}</p>
          </div>
        </div>
      )}

      {mode === 'keyframe' && (
        <RefImagesInput
          label={t('video.refImage')}
          items={frames}
          max={2}
          onAdd={(items) => setFrames((prev) => [...prev, ...items].slice(0, 2))}
          onRemove={(index) => setFrames((prev) => prev.filter((_, i) => i !== index))}
          disabled={isBusy}
          hint={t('video.keyframeHint')}
          slotLabels={[t('video.firstFrame'), t('video.lastFrame')]}
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

      {/* 快速重试：连续 2 次队列繁忙后按「每分钟 x 次 / 持续 y 分钟」连打 */}
      <FastRetryControl
        settings={fastSettings}
        onSettingsChange={handleFastSettingsChange}
        phase={retryPhase}
        attempts={fastRun?.attempts ?? 0}
        remainingMs={remainingMs}
        onStart={handleStartFastRetry}
        onStop={handleStopFastRetry}
        disabled={status === 'generating'}
      />

      {fastExpired && status === 'submitting' && (
        <p className="text-xs text-muted text-center">{t('errors.fastRetryExpired')}</p>
      )}

      {status !== 'completed' && status !== 'generating' && (
        <>
          <GenerateButton
            onClick={handleGenerate}
            loading={status === 'submitting'}
            disabled={!prompt.trim() || !apiKey}
            label={t('video.generate')}
            loadingLabel={retryLoadingLabel()}
          />
          <p className="text-xs text-muted text-center">
            <svg className="inline w-3.5 h-3.5 me-1 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
