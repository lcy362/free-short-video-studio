'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import ApiKeyPanel, { useApiKey } from './ApiKeyPanel';
import {
  loadStudioModel,
  saveStudioModel,
  DEFAULT_STUDIO_VIDEO_MODEL,
  type StudioVideoModelId,
} from './lib/video-models';
import {
  loadAgnesDomain,
  saveAgnesDomain,
  getAgnesBase,
  DEFAULT_AGNES_DOMAIN,
  type AgnesDomainId,
} from './lib/api-domains';
import IdeaInput from './components/IdeaInput';
import DemoErrorLinks from './components/DemoErrorLinks';
import SceneList from './components/SceneList';
import FFmpegLoader from './components/FFmpegLoader';
import VideoPreview from './components/VideoPreview';
import LogPanel from './components/LogPanel';
import WaitingNotice from './components/WaitingNotice';
import { splitScenes, ChatApiError } from './lib/chat-api';
import { VideoOrchestrator } from './lib/orchestrator';
import { submitLimiter } from './lib/rate-limiter';
import { studioLogger } from './lib/logger';
import {
  trackApiKeyPanelFocus,
  trackDemoError,
  trackGenerationStart,
  trackGenerationSuccess,
  trackGetKeyClick,
  trackSceneError,
  trackSceneResumeError,
  trackSceneStart,
  trackSceneSuccess,
} from './lib/analytics';
import { useGenerationAbandon } from './lib/use-generation-abandon';
import {
  loadProjects,
  saveProject,
  genProjectId,
  isResumable,
} from './lib/task-store';
import {
  createLibraryItem,
  updateLibraryItem,
  loadLibraryItems,
  subscribeStudioResume,
} from './lib/library-store';
import {
  loadFFmpeg,
  scaleVideo,
  concatVideos,
  writeBlobToFile,
  readFileAsBlobURL,
  deleteFile,
} from './lib/ffmpeg-service';
import {
  STUDIO_RATIO_DIMS,
} from './types';
import type {
  StudioPhase,
  Scene,
  StudioRatio,
  StudioDuration,
  StudioStyle,
  StudioProject,
} from './types';

/**
 * 逐段下载 + 缩放为统一尺寸，返回缩放后的虚拟文件名列表。
 *
 * 必须**串行**（ffmpeg.wasm 只有一个实例，并行会互相覆盖虚拟文件系统），
 * 因此用递归而不是 for + await 表达顺序（Sonar S9382「循环内 await 可并行」在此不适用）。
 */
async function scaleScenesSequentially(
  scenes: readonly Scene[],
  width: number,
  height: number,
  onProgress: (ratio: number) => void,
): Promise<string[]> {
  const scaledNames: string[] = [];

  const scaleAt = async (i: number): Promise<void> => {
    if (i >= scenes.length) return;
    const scene = scenes[i];
    if (scene.videoUrl) {
      studioLogger.info('ffmpeg', `Scaling scene ${i + 1}/${scenes.length}`);
      // 根据 blob 类型决定输入扩展名（录制下载的是 webm，直接下载的是 mp4）
      const blob = await fetch(scene.videoUrl).then((r) => r.blob());
      const ext = blob.type.includes('webm') ? 'webm' : 'mp4';
      const inputName = `input_${i}.${ext}`;
      const scaledName = `scaled_${i}.mp4`; // 缩放后统一为 mp4
      await writeBlobToFile(blob, inputName);
      await scaleVideo(inputName, scaledName, width, height, (p) => {
        onProgress(i / scenes.length + p / scenes.length);
      });
      await deleteFile(inputName);
      scaledNames.push(scaledName);
    }
    await scaleAt(i + 1);
  };

  await scaleAt(0);
  return scaledNames;
}

/** 从 errorMsg 或 scene.error 提取错误 code，用于匹配提示文案 */
function extractErrorCode(errorMsg: string): string | null {
  // 单场景错误码（精确匹配）
  const codes = [
    'scriptFailed', 'videoFailed', 'pollTimeout',
    'concatFailed', 'network', 'invalidApiKey', 'rateLimited',
    'aborted', 'maxConsecutiveFailures', 'submitFailed', 'downloadFailed',
    'queue_full', 'upstream_error', 'no_video_id',
  ];
  for (const c of codes) {
    if (errorMsg === c) return c;
  }
  // sceneFailed 是聚合码（多个场景失败时设置）
  if (errorMsg === 'sceneFailed') return 'sceneFailed';
  return null;
}

export default function StudioClient({
  embedded = false,
  apiKey: apiKeyProp,
  hasKey: hasKeyProp,
  domain: domainProp,
  onDomainChange,
}: Readonly<{
  /**
   * true = 被 StudioWorkspace 三 tab 工作台内嵌：
   * 不再渲染自带的 ApiKeyPanel 与「未填 Key」提示（由外层统一托管），其余流程不变。
   */
  embedded?: boolean;
  apiKey?: string;
  hasKey?: boolean;
  domain?: AgnesDomainId;
  onDomainChange?: (id: AgnesDomainId) => void;
}> = {}) {
  const t = useTranslations('studio');
  const locale = useLocale();
  // 页面直用时走内置 hook；embedded 模式由外层传入。hook 仍无条件调用（保持 hook 顺序稳定）
  const localApiKey = useApiKey();
  const apiKey = apiKeyProp ?? localApiKey.apiKey;
  const hasKey = hasKeyProp ?? localApiKey.hasKey;

  const [phase, setPhase] = useState<StudioPhase>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [idea, setIdea] = useState('');
  const [sceneCount, setSceneCount] = useState(3);
  const [ratio, setRatio] = useState<StudioRatio>('16:9');
  const [duration, setDuration] = useState<StudioDuration>(5);
  const [style, setStyle] = useState<StudioStyle>('cinematic');
  const [enableWatermark, setEnableWatermark] = useState(false);
  const [model, setModel] = useState<StudioVideoModelId>(DEFAULT_STUDIO_VIDEO_MODEL);
  const [domain, setDomain] = useState<AgnesDomainId>(domainProp ?? DEFAULT_AGNES_DOMAIN);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [ffmpegProgress, setFfmpegProgress] = useState(0);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [finalVideoUrl, setFinalVideoUrl] = useState('');
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  // 作品库记录 id：与 task-store 的断点续传数据一一对应，但只存展示元信息
  const libraryItemIdRef = useRef<string>('');
  // 供 useEffect 里的订阅回调调用最新的 handleResume（避免闭包持有旧状态）
  const handleResumeRef = useRef<(p: StudioProject) => void>(() => {});

  // 持久化相关 ref
  const currentProjectIdRef = useRef<string | null>(null);
  const createdAtRef = useRef<number>(Date.now());
  // 创意流程的出片耗时起点（埋点用）
  const genStartedAtRef = useRef<number>(0);
  // 分段级埋点去重：每段只计一次「首次提交」与一次终态（成功或失败）
  const sceneStartedRef = useRef<Set<number>>(new Set());
  const sceneDoneRef = useRef<Set<number>>(new Set());
  // 本次任务里用户点了几次「重试失败场景」，用于 success / error 的 retry_count
  const userRetryRef = useRef(0);
  const metaRef = useRef({
    idea, sceneCount, ratio, duration, style, enableWatermark, model, phase, errorMsg, finalVideoUrl,
  });
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProjectRef = useRef<StudioProject | null>(null);

  // 页面卸载时多镜流程仍在跑 → abandon，解释「有 start 无终态」的缺口
  useGenerationAbandon({
    active: phase === 'script_generating' || phase === 'videos_generating'
      || phase === 'ffmpeg_loading' || phase === 'concatenating',
    tab: 'creative',
    model,
    startedAt: genStartedAtRef.current,
    hasVideoId: scenes.some((s) => !!s.videoId),
  });

  useEffect(() => { currentProjectIdRef.current = currentProjectId; }, [currentProjectId]);
  useEffect(() => {
    metaRef.current = { idea, sceneCount, ratio, duration, style, enableWatermark, model, phase, errorMsg, finalVideoUrl };
  }, [idea, sceneCount, ratio, duration, style, enableWatermark, model, phase, errorMsg, finalVideoUrl]);

  // 模型/域名选择从 localStorage 恢复（SSR 后水合，避免不一致）
  useEffect(() => {
    setModel(loadStudioModel());
    // embedded 模式下域名由外层托管，避免覆盖父级状态
    if (domainProp === undefined) setDomain(loadAgnesDomain());
  }, [domainProp]);

  const handleModelChange = (m: StudioVideoModelId) => {
    setModel(m);
    saveStudioModel(m);
  };

  const handleDomainChange = (id: AgnesDomainId) => {
    setDomain(id);
    if (onDomainChange) onDomainChange(id);
    else saveAgnesDomain(id);
  };

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (persistTimerRef.current) { clearTimeout(persistTimerRef.current); persistTimerRef.current = null; }
      if (pendingProjectRef.current) saveProject(pendingProjectRef.current);
    };
  }, []);

  /** 同步断点续传数据 + 作品库展示信息（progress / status） */
  const persistToLibrary = (project: StudioProject) => {
    if (!libraryItemIdRef.current) return;
    const done = project.scenes.filter((s) => s.status === 'completed').length;
    updateLibraryItem(libraryItemIdRef.current, {
      progress: `${done}/${project.scenes.length}`,
      status: project.phase === 'completed' ? 'completed' : project.phase === 'error' ? 'error' : 'running',
      errorCode: project.errorMsg,
    });
  };

  const flushPersist = () => {
    if (persistTimerRef.current) { clearTimeout(persistTimerRef.current); persistTimerRef.current = null; }
    if (pendingProjectRef.current) {
      saveProject(pendingProjectRef.current);
      persistToLibrary(pendingProjectRef.current);
      pendingProjectRef.current = null;
    }
  };

  const persist = (upcomingScenes: Scene[]) => {
    const id = currentProjectIdRef.current;
    if (!id) return;
    const m = metaRef.current;
    pendingProjectRef.current = {
      id, idea: m.idea, sceneCount: m.sceneCount, ratio: m.ratio, duration: m.duration,
      style: m.style,
      enableWatermark: m.enableWatermark, model: m.model, scenes: upcomingScenes, phase: m.phase,
      errorMsg: m.errorMsg || undefined, createdAt: createdAtRef.current,
      updatedAt: Date.now(), finalVideoUrl: m.finalVideoUrl || undefined,
    };
    if (!persistTimerRef.current) {
      persistTimerRef.current = setTimeout(() => {
        persistTimerRef.current = null;
        if (pendingProjectRef.current) {
          saveProject(pendingProjectRef.current);
          persistToLibrary(pendingProjectRef.current);
          pendingProjectRef.current = null;
        }
      }, 1500);
    }
  };

  /** 阶段1：LLM 场景拆分 */
  const handleSplitScenes = async () => {
    if (!idea.trim() || !apiKey) return;
    setPhase('script_generating');
    setErrorMsg('');
    studioLogger.info('system', `Splitting scenes: idea="${idea.trim().slice(0, 50)}...", count=${sceneCount}`);

    try {
      const items = await splitScenes(apiKey, { idea: idea.trim(), sceneCount, style, locale });
      const newScenes: Scene[] = items.map((item, i) => ({
        index: i + 1, title: item.title, visualPrompt: item.visualPrompt,
        narration: item.narration, status: 'pending' as const,
      }));

      const id = genProjectId();
      createdAtRef.current = Date.now();
      setCurrentProjectId(id);
      setScenes(newScenes);
      setPhase('script_ready');
      submitLimiter.reset();
      studioLogger.success('system', `Scene split complete, ${newScenes.length} scenes`);

      libraryItemIdRef.current = createLibraryItem({
        kind: 'creative',
        status: 'running',
        title: idea.trim().slice(0, 100),
        projectRef: id,
        model,
        ratio,
        duration_s: duration,
        progress: `0/${newScenes.length}`,
      }).id;
      pendingProjectRef.current = {
        id, idea: idea.trim(), sceneCount, ratio, duration, style, enableWatermark, model,
        scenes: newScenes, phase: 'script_ready', createdAt: createdAtRef.current, updatedAt: Date.now(),
      };
      flushPersist();
    } catch (e) {
      const msg = e instanceof ChatApiError ? e.message : (e as Error).message;
      const raw = e instanceof Error ? e.stack || e.message : String(e);
      studioLogger.error('system', `Scene split failed: ${msg}`, raw);
      createLibraryItem({
        kind: 'creative',
        status: 'error',
        title: idea.trim().slice(0, 100),
        model,
        ratio,
        duration_s: duration,
        errorCode: 'scriptFailed',
      });
      setErrorMsg('scriptFailed');
      setPhase('error');
    }
  };

  /** 启动编排器 */
  const startOrchestrator = async (
    initialScenes: Scene[],
    ratioOverride?: StudioRatio,
    durationOverride?: StudioDuration,
    modelOverride?: StudioVideoModelId,
  ) => {
    if (!apiKey) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    // 新一轮运行重置分段埋点（重试的段会重新提交，应重新计入 scene_start）
    sceneStartedRef.current = new Set();
    sceneDoneRef.current = new Set();

    const useRatio = ratioOverride ?? ratio;
    const useDuration = durationOverride ?? duration;
    const useModel = modelOverride ?? model;
    const orch = new VideoOrchestrator(
      apiKey, useRatio,
      {
        onSceneUpdate: (i, patch) => {
          // Superseded run (retry / resume / new project / unmount): drop every callback.
          // Otherwise the previous run's in-flight scenes are recorded as failures, which
          // flooded `aborted` (682 events in 2 days) and inflated the failure rate, and it
          // also clobbered the fresh state the new run had just set.
          if (ac.signal.aborted) return;
          // 分段级埋点：首次提交 / 出片 / 失败各计一次
          // （有 videoId 的续轮询跳过提交，不会重复计 scene_start）
          if (patch.status === 'submitting' && !sceneStartedRef.current.has(i)) {
            sceneStartedRef.current.add(i);
            trackSceneStart({
              scene: i + 1,
              scene_total: initialScenes.length,
              model: useModel,
            });
          }
          if (patch.status === 'completed' && !sceneDoneRef.current.has(i)) {
            sceneDoneRef.current.add(i);
            trackSceneSuccess({
              scene: i + 1,
              scene_total: initialScenes.length,
              model: useModel,
            });
          }
          if (patch.status === 'error' && !sceneDoneRef.current.has(i)) {
            sceneDoneRef.current.add(i);
            const params = {
              scene: i + 1,
              scene_total: initialScenes.length,
              model: useModel,
              code: patch.error || 'sceneFailed',
            };
            // 只有本轮真实提交过的段才进分段成功率口径（error <= start）。
            // 续轮询（重试失败场景 / 刷新恢复）没有新提交，单独记 resume_error，
            // 否则用户反复点重试会把 scene_error 刷成 scene_start 的数倍。
            if (sceneStartedRef.current.has(i)) trackSceneError(params);
            else trackSceneResumeError(params);
          }
          setScenes((prev) => {
            const next = [...prev];
            if (next[i]) next[i] = { ...next[i], ...patch };
            return next;
          });
        },
        onPhaseChange: (p) => {
          // Same rule as onSceneUpdate: a superseded run must not drive the page state.
          if (ac.signal.aborted) return;
          metaRef.current.phase = p;
          setPhase(p);
        },
        onPersist: (sc) => {
          // A superseded run must not overwrite the new run's persisted project.
          if (ac.signal.aborted) return;
          persist(sc);
        },
      },
      ac.signal,
      useDuration,
      useModel,
      getAgnesBase(domain),
    );
    metaRef.current.phase = 'videos_generating';
    setPhase('videos_generating');
    setErrorMsg('');

    try {
      const { ok, failedIndices } = await orch.runAll(initialScenes);
      // Superseded / cancelled run: skip every follow-up side effect (phase, persist,
      // failure telemetry). Whoever replaced us (retry / resume / new project / cancel)
      // owns the UI state -- and this run must never be counted as a generation failure.
      if (ac.signal.aborted) return;
      flushPersist();

      // 全部失败 → 整页错误；部分失败 → 仍进 all_videos_ready（场景卡片里单独标红 + 可重试）
      if (ok || failedIndices.length < initialScenes.length) {
        metaRef.current.phase = 'all_videos_ready';
        setPhase('all_videos_ready');
      } else {
        metaRef.current.phase = 'error';
        setPhase('error');
        setErrorMsg('sceneFailed');
        updateLibraryItem(libraryItemIdRef.current, { status: 'error', errorCode: 'sceneFailed' });
        // 任务级失败：全部场景都没出片
        trackDemoError({
          code: 'sceneFailed',
          model: useModel,
          tab: 'creative',
          elapsed_s: genStartedAtRef.current
            ? Math.max(0, Math.floor((Date.now() - genStartedAtRef.current) / 1000))
            : 0,
          retry_count: userRetryRef.current,
        });
      }
    } catch (e) {
      // 兜底：编排器异常不冒泡成未处理的 Promise rejection
      const msg = e instanceof Error ? e.message : String(e);
      studioLogger.error('system', `Orchestrator failed: ${msg}`);
      metaRef.current.phase = 'error';
      setPhase('error');
      setErrorMsg('sceneFailed');
      updateLibraryItem(libraryItemIdRef.current, { status: 'error', errorCode: 'orchestratorFailed' });
      trackDemoError({
        code: 'orchestratorFailed',
        model: useModel,
        tab: 'creative',
        elapsed_s: genStartedAtRef.current
          ? Math.max(0, Math.floor((Date.now() - genStartedAtRef.current) / 1000))
          : 0,
        retry_count: userRetryRef.current,
      });
    }
  };

  const handleGenerateVideos = () => {
    genStartedAtRef.current = Date.now();
    userRetryRef.current = 0;
    trackGenerationStart({
      tab: 'creative',
      model,
      mode: 'text',
      duration_s: duration,
      ratio,
      source: 'new',
    });
    return startOrchestrator(scenes);
  };
  /** 重试失败场景：视为新一次尝试，计入任务级 start（保证端到端成功率分子分母配对） */
  const handleRetryFailed = () => {
    userRetryRef.current += 1;
    genStartedAtRef.current = Date.now();
    trackGenerationStart({
      tab: 'creative',
      model,
      mode: 'text',
      duration_s: duration,
      ratio,
      source: 'retry',
    });
    return startOrchestrator(scenes);
  };

  const handleResume = (project: StudioProject) => {
    abortRef.current?.abort();
    // 复用作品库里同一条记录；旧数据（无记录）则补建一条
    const existing = loadLibraryItems().find((i) => i.projectRef === project.id);
    libraryItemIdRef.current = existing?.id ?? createLibraryItem({
      kind: 'creative',
      status: 'running',
      title: project.idea.slice(0, 100),
      projectRef: project.id,
      model: project.model,
      ratio: project.ratio,
      duration_s: project.duration,
      progress: `0/${project.scenes.length}`,
    }).id;
    updateLibraryItem(libraryItemIdRef.current, { status: 'running' });
    const restored = project.scenes.map((s) => ({ ...s, videoUrl: undefined }));
    const resumeModel = project.model ?? DEFAULT_STUDIO_VIDEO_MODEL;
    setIdea(project.idea); setSceneCount(project.sceneCount); setRatio(project.ratio);
    setDuration(project.duration ?? 5); setStyle(project.style); setEnableWatermark(project.enableWatermark);
    setModel(resumeModel);
    setScenes(restored); setCurrentProjectId(project.id);
    createdAtRef.current = project.createdAt;
    setFinalVideoUrl(''); setErrorMsg(project.errorMsg ?? '');
    metaRef.current = {
      idea: project.idea, sceneCount: project.sceneCount, ratio: project.ratio,
      duration: project.duration ?? 5,
      style: project.style, enableWatermark: project.enableWatermark, model: resumeModel,
      phase: 'videos_generating', errorMsg: project.errorMsg ?? '', finalVideoUrl: '',
    };
    studioLogger.info('system', `Resuming project: ${project.idea.slice(0, 40)}`);

    if (isResumable(project)) {
      genStartedAtRef.current = Date.now();
      userRetryRef.current = 0;
      trackGenerationStart({
        tab: 'creative',
        model: resumeModel,
        mode: 'text',
        duration_s: project.duration ?? 5,
        ratio: project.ratio,
        source: 'resume',
      });
      void startOrchestrator(restored, project.ratio, project.duration ?? 5, resumeModel);
    } else if (project.phase === 'completed') {
      setPhase('all_videos_ready');
    } else {
      setPhase(project.phase);
    }
  };

  // 作品库「继续」→ 恢复对应项目。列表已独立成 LibraryPanel，这里只接收 id 指令。
  handleResumeRef.current = handleResume;
  useEffect(() => subscribeStudioResume((projectId) => {
    const project = loadProjects().find((p) => p.id === projectId);
    if (project) handleResumeRef.current(project);
  }), []);

  const handleNewProject = () => {
    abortRef.current?.abort();
    setPhase('idle'); setErrorMsg(''); setScenes([]); setFinalVideoUrl('');
    setFfmpegProgress(0); setFfmpegLoaded(false); setCurrentProjectId(null);
    libraryItemIdRef.current = '';
    submitLimiter.reset();
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    flushPersist();
    studioLogger.warn('system', 'User cancelled generation');
    // onSceneUpdate now ignores callbacks from an aborted run, so mark the still-running
    // scenes here explicitly (UI only -- no failure telemetry for a deliberate cancel).
    setScenes((prev) => prev.map((s) => (
      s.status === 'completed' ? s : { ...s, status: 'error', error: 'aborted' }
    )));
    metaRef.current.phase = 'error';
    setPhase('error');
    setErrorMsg('aborted');
    updateLibraryItem(libraryItemIdRef.current, { status: 'error', errorCode: 'aborted' });
    // 主动取消也算任务未完成；GA 里可按 code=aborted 单独过滤，不影响失败率分析
    trackDemoError({
      code: 'aborted',
      model,
      tab: 'creative',
      elapsed_s: genStartedAtRef.current
        ? Math.max(0, Math.floor((Date.now() - genStartedAtRef.current) / 1000))
        : 0,
      retry_count: userRetryRef.current,
    });
  };

  /** 阶段3：ffmpeg 拼接 */
  const handleConcatenate = async () => {
    setPhase('ffmpeg_loading');
    setErrorMsg('');
    setFfmpegProgress(0);
    studioLogger.info('ffmpeg', 'Starting concatenation');
    try {
      if (!ffmpegLoaded) {
        studioLogger.info('ffmpeg', 'Loading ffmpeg.wasm engine...');
        await loadFFmpeg();
        setFfmpegLoaded(true);
        studioLogger.success('ffmpeg', 'ffmpeg.wasm loaded');
      }
      setPhase('concatenating');
      const [width, height] = STUDIO_RATIO_DIMS[ratio];

      const scaledNames = await scaleScenesSequentially(scenes, width, height, setFfmpegProgress);

      setFfmpegProgress(0);
      studioLogger.info('ffmpeg', `Concatenating ${scaledNames.length} segments...`);
      await concatVideos(scaledNames, 'output.mp4', (p) => setFfmpegProgress(p));
      const url = await readFileAsBlobURL('output.mp4');
      setFinalVideoUrl(url);
      metaRef.current.finalVideoUrl = url;
      studioLogger.success('ffmpeg', 'Concatenation complete');

      // 各段虚拟文件互相独立，删文件可以并行
      await Promise.all(scaledNames.map((name) => deleteFile(name)));
      await deleteFile('output.mp4');

      metaRef.current.phase = 'completed';
      setPhase('completed');
      trackGenerationSuccess({
        tab: 'creative',
        model,
        elapsed_s: genStartedAtRef.current
          ? Math.max(0, Math.floor((Date.now() - genStartedAtRef.current) / 1000))
          : 0,
        retry_count: userRetryRef.current,
      });
      updateLibraryItem(libraryItemIdRef.current, { status: 'completed', progress: `${scenes.length}/${scenes.length}` });
      flushPersist();
    } catch (e) {
      const msg = (e as Error).message;
      const raw = e instanceof Error ? e.stack || e.message : String(e);
      studioLogger.error('ffmpeg', `Concatenation failed: ${msg}`, raw);
      setErrorMsg('concatFailed');
      updateLibraryItem(libraryItemIdRef.current, { status: 'error', errorCode: 'concatFailed' });
      metaRef.current.phase = 'error';
      setPhase('error');
      trackDemoError({
        code: 'concatFailed',
        model,
        tab: 'creative',
        elapsed_s: genStartedAtRef.current
          ? Math.max(0, Math.floor((Date.now() - genStartedAtRef.current) / 1000))
          : 0,
        retry_count: userRetryRef.current,
      });
    }
  };

  const hasFailedScenes = scenes.some((s) => s.status === 'error');
  const allCompleted = scenes.length > 0 && scenes.every((s) => s.status === 'completed');

  /** 当前错误码（用于匹配提示文案） */
  const errCode = errorMsg || (hasFailedScenes ? 'sceneFailed' : '');
  const errHintKey = errCode ? `errorHint_${errCode}` : null;
  const hasErrHint = errHintKey && errCode && extractErrorCode(errCode) !== null;

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl sm:text-3xl font-semibold text-ink tracking-tight">
          {t('title')}
        </h2>
        <p className="mt-2 text-muted text-sm">{t('subtitle')}</p>
      </div>

      {/* 等待期：明确告知浏览器依赖与关闭标签页的后果，并给出自托管入口 */}
      {(phase === 'script_generating' || phase === 'videos_generating'
        || phase === 'ffmpeg_loading' || phase === 'concatenating') && (
        <WaitingNotice />
      )}

      {!embedded && (
        <ApiKeyPanel
          apiKey={apiKey} hasKey={hasKey} saveKey={localApiKey.saveKey} clearKey={localApiKey.clearKey}
          domain={domain} onDomainChange={handleDomainChange}
        />
      )}

      {(phase === 'idle' || phase === 'script_generating') && (
        <>
          {/* 没填 Key 时按钮只是静默禁用，必须给出可操作的下一步（与图像/单镜 tab 一致） */}
          {!hasKey && (
            <div className="rounded-xl border border-accent/25 bg-accent/5 p-3 space-y-2 text-center">
              <p className="text-sm text-ink-2">{t('apiKey.noKeyTitle')}</p>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                <button
                  type="button"
                  onClick={() => {
                    trackApiKeyPanelFocus({ tab: 'creative' });
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
          <IdeaInput
            idea={idea} setIdea={setIdea}
            sceneCount={sceneCount} setSceneCount={setSceneCount}
            ratio={ratio} setRatio={setRatio}
            duration={duration} setDuration={setDuration}
            style={style} setStyle={setStyle}
            enableWatermark={enableWatermark} setEnableWatermark={setEnableWatermark}
            model={model} setModel={handleModelChange}
            loading={phase === 'script_generating'}
            canSubmit={hasKey}
            onGenerate={handleSplitScenes}
          />
        </>
      )}

          {(phase === 'script_ready' || phase === 'videos_generating' || phase === 'all_videos_ready') && (
            <SceneList
              scenes={scenes} phase={phase}
              hasFailedScenes={hasFailedScenes} allCompleted={allCompleted}
              onGenerateVideos={handleGenerateVideos}
              onRetryFailed={handleRetryFailed}
              onConcatenate={handleConcatenate}
              onReset={handleNewProject}
              onCancel={handleCancel}
            />
          )}

          {(phase === 'ffmpeg_loading' || phase === 'concatenating') && (
            <FFmpegLoader phase={phase} progress={ffmpegProgress} loaded={ffmpegLoaded} />
          )}

          {phase === 'completed' && finalVideoUrl && (
            <VideoPreview url={finalVideoUrl} onReset={handleNewProject} />
          )}

          {/* 错误展示（明确报错 + 可操作建议） */}
          {phase === 'error' && errCode && (
            <div className="p-5 rounded-xl bg-danger/10 border border-danger/30">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-danger mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-danger">
                    {t(`errors.${errCode}`)}
                  </p>
                  {hasErrHint && errHintKey && (
                    <p className="text-xs text-danger/80 mt-1.5 leading-relaxed">
                      {t(errHintKey)}
                    </p>
                  )}
                  <DemoErrorLinks code={errCode} />
                  {hasFailedScenes && phase !== 'error' && (
                    <p className="text-xs text-warning/80 mt-1.5">{t('partialFailedHint')}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                {hasFailedScenes && (
                  <button
                    onClick={handleRetryFailed}
                    className="px-4 py-2 text-sm font-medium bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 rounded-lg transition"
                  >
                    {t('retryFailed')}
                  </button>
                )}
                <button
                  onClick={handleNewProject}
                  className="px-4 py-2 text-sm text-muted hover:text-ink-2 bg-paper-3 border border-rule rounded-lg transition"
                >
                  {t('reset')}
                </button>
              </div>
            </div>
          )}

          {/* 部分失败提示（非 error 阶段） */}
          {phase === 'all_videos_ready' && hasFailedScenes && (
            <div className="p-4 rounded-xl bg-warning/10 border border-warning/30">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-warning mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
                </svg>
                <p className="text-xs text-warning/90 leading-relaxed">{t('partialFailedHint')}</p>
              </div>
            </div>
          )}

          {/* 日志面板：除 idle 外常驻展示 */}
          {phase !== 'idle' && <LogPanel />}
    </div>
  );
}
