'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import ApiKeyPanel, { useApiKey } from './ApiKeyPanel';
import IdeaInput from './components/IdeaInput';
import SceneList from './components/SceneList';
import FFmpegLoader from './components/FFmpegLoader';
import VideoPreview from './components/VideoPreview';
import TaskList from './components/TaskList';
import LogPanel from './components/LogPanel';
import { splitScenes, ChatApiError } from './lib/chat-api';
import { VideoOrchestrator } from './lib/orchestrator';
import { submitLimiter } from './lib/rate-limiter';
import { studioLogger } from './lib/logger';
import {
  loadProjects,
  saveProject,
  deleteProject,
  genProjectId,
  isResumable,
} from './lib/task-store';
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

/** 从 errorMsg 或 scene.error 提取错误 code，用于匹配提示文案 */
function extractErrorCode(errorMsg: string): string | null {
  // 单场景错误码（精确匹配）
  const codes = [
    'scriptFailed', 'videoFailed', 'pollTimeout',
    'concatFailed', 'network', 'invalidApiKey', 'rateLimited',
    'aborted', 'maxConsecutiveFailures', 'submitFailed', 'downloadFailed',
  ];
  for (const c of codes) {
    if (errorMsg === c) return c;
  }
  // sceneFailed 是聚合码（多个场景失败时设置）
  if (errorMsg === 'sceneFailed') return 'sceneFailed';
  return null;
}

export default function StudioClient() {
  const t = useTranslations('studio');
  const locale = useLocale();
  const { apiKey, hasKey, saveKey, clearKey } = useApiKey();

  const [phase, setPhase] = useState<StudioPhase>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [idea, setIdea] = useState('');
  const [sceneCount, setSceneCount] = useState(3);
  const [ratio, setRatio] = useState<StudioRatio>('16:9');
  const [duration, setDuration] = useState<StudioDuration>(5);
  const [style, setStyle] = useState<StudioStyle>('cinematic');
  const [enableWatermark, setEnableWatermark] = useState(false);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [ffmpegProgress, setFFmpegProgress] = useState(0);
  const [ffmpegLoaded, setFFmpegLoaded] = useState(false);
  const [finalVideoUrl, setFinalVideoUrl] = useState('');
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // 持久化相关 ref
  const currentProjectIdRef = useRef<string | null>(null);
  const createdAtRef = useRef<number>(Date.now());
  const metaRef = useRef({
    idea, sceneCount, ratio, duration, style, enableWatermark, phase, errorMsg, finalVideoUrl,
  });
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProjectRef = useRef<StudioProject | null>(null);

  useEffect(() => { currentProjectIdRef.current = currentProjectId; }, [currentProjectId]);
  useEffect(() => {
    metaRef.current = { idea, sceneCount, ratio, duration, style, enableWatermark, phase, errorMsg, finalVideoUrl };
  }, [idea, sceneCount, ratio, duration, style, enableWatermark, phase, errorMsg, finalVideoUrl]);

  useEffect(() => { setProjects(loadProjects()); }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (persistTimerRef.current) { clearTimeout(persistTimerRef.current); persistTimerRef.current = null; }
      if (pendingProjectRef.current) saveProject(pendingProjectRef.current);
    };
  }, []);

  const flushPersist = () => {
    if (persistTimerRef.current) { clearTimeout(persistTimerRef.current); persistTimerRef.current = null; }
    if (pendingProjectRef.current) {
      saveProject(pendingProjectRef.current);
      pendingProjectRef.current = null;
      setProjects(loadProjects());
    }
  };

  const persist = (upcomingScenes: Scene[]) => {
    const id = currentProjectIdRef.current;
    if (!id) return;
    const m = metaRef.current;
    pendingProjectRef.current = {
      id, idea: m.idea, sceneCount: m.sceneCount, ratio: m.ratio, duration: m.duration,
      style: m.style,
      enableWatermark: m.enableWatermark, scenes: upcomingScenes, phase: m.phase,
      errorMsg: m.errorMsg || undefined, createdAt: createdAtRef.current,
      updatedAt: Date.now(), finalVideoUrl: m.finalVideoUrl || undefined,
    };
    if (!persistTimerRef.current) {
      persistTimerRef.current = setTimeout(() => {
        persistTimerRef.current = null;
        if (pendingProjectRef.current) {
          saveProject(pendingProjectRef.current);
          pendingProjectRef.current = null;
          setProjects(loadProjects());
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

      pendingProjectRef.current = {
        id, idea: idea.trim(), sceneCount, ratio, duration, style, enableWatermark,
        scenes: newScenes, phase: 'script_ready', createdAt: createdAtRef.current, updatedAt: Date.now(),
      };
      flushPersist();
    } catch (e) {
      const msg = e instanceof ChatApiError ? e.message : (e as Error).message;
      const raw = e instanceof Error ? e.stack || e.message : String(e);
      studioLogger.error('system', `Scene split failed: ${msg}`, raw);
      setErrorMsg('scriptFailed');
      setPhase('error');
    }
  };

  /** 启动编排器 */
  const startOrchestrator = async (
    initialScenes: Scene[],
    ratioOverride?: StudioRatio,
    durationOverride?: StudioDuration,
  ) => {
    if (!apiKey) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const useRatio = ratioOverride ?? ratio;
    const useDuration = durationOverride ?? duration;
    const orch = new VideoOrchestrator(
      apiKey, useRatio,
      {
        onSceneUpdate: (i, patch) => {
          setScenes((prev) => {
            const next = [...prev];
            if (next[i]) next[i] = { ...next[i], ...patch };
            return next;
          });
        },
        onPhaseChange: (p) => { metaRef.current.phase = p; setPhase(p); },
        onPersist: (sc) => persist(sc),
      },
      ac.signal,
      useDuration,
    );
    metaRef.current.phase = 'videos_generating';
    setPhase('videos_generating');
    setErrorMsg('');

    const { ok, failedIndices } = await orch.runAll(initialScenes);
    flushPersist();

    if (ok) {
      metaRef.current.phase = 'all_videos_ready';
      setPhase('all_videos_ready');
    } else if (failedIndices.length === initialScenes.length) {
      metaRef.current.phase = 'error';
      setPhase('error');
      setErrorMsg('sceneFailed');
    } else {
      metaRef.current.phase = 'all_videos_ready';
      setPhase('all_videos_ready');
    }
  };

  const handleGenerateVideos = () => startOrchestrator(scenes);
  const handleRetryFailed = () => startOrchestrator(scenes);

  const handleResume = (project: StudioProject) => {
    abortRef.current?.abort();
    const restored = project.scenes.map((s) => ({ ...s, videoUrl: undefined }));
    setIdea(project.idea); setSceneCount(project.sceneCount); setRatio(project.ratio);
    setDuration(project.duration ?? 5); setStyle(project.style); setEnableWatermark(project.enableWatermark);
    setScenes(restored); setCurrentProjectId(project.id);
    createdAtRef.current = project.createdAt;
    setFinalVideoUrl(''); setErrorMsg(project.errorMsg ?? '');
    metaRef.current = {
      idea: project.idea, sceneCount: project.sceneCount, ratio: project.ratio,
      duration: project.duration ?? 5,
      style: project.style, enableWatermark: project.enableWatermark,
      phase: 'videos_generating', errorMsg: project.errorMsg ?? '', finalVideoUrl: '',
    };
    studioLogger.info('system', `Resuming project: ${project.idea.slice(0, 40)}`);

    if (isResumable(project)) {
      startOrchestrator(restored, project.ratio, project.duration ?? 5);
    } else if (project.phase === 'completed') {
      setPhase('all_videos_ready');
    } else {
      setPhase(project.phase);
    }
  };

  const handleDeleteProject = (id: string) => {
    deleteProject(id);
    setProjects(loadProjects());
    if (currentProjectId === id) handleNewProject();
  };

  const handleNewProject = () => {
    abortRef.current?.abort();
    setPhase('idle'); setErrorMsg(''); setScenes([]); setFinalVideoUrl('');
    setFFmpegProgress(0); setFFmpegLoaded(false); setCurrentProjectId(null);
    submitLimiter.reset(); setProjects(loadProjects());
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    flushPersist();
    studioLogger.warn('system', 'User cancelled generation');
    metaRef.current.phase = 'error';
    setPhase('error');
    setErrorMsg('aborted');
  };

  /** 阶段3：ffmpeg 拼接 */
  const handleConcatenate = async () => {
    setPhase('ffmpeg_loading');
    setErrorMsg('');
    setFFmpegProgress(0);
    studioLogger.info('ffmpeg', 'Starting concatenation');
    try {
      if (!ffmpegLoaded) {
        studioLogger.info('ffmpeg', 'Loading ffmpeg.wasm engine...');
        await loadFFmpeg();
        setFFmpegLoaded(true);
        studioLogger.success('ffmpeg', 'ffmpeg.wasm loaded');
      }
      setPhase('concatenating');
      const [width, height] = STUDIO_RATIO_DIMS[ratio];

      const scaledNames: string[] = [];
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        if (!scene.videoUrl) continue;
        studioLogger.info('ffmpeg', `Scaling scene ${i + 1}/${scenes.length}`);
        // 根据 blob 类型决定输入扩展名（录制下载的是 webm，直接下载的是 mp4）
        const blob = await fetch(scene.videoUrl).then((r) => r.blob());
        const ext = blob.type.includes('webm') ? 'webm' : 'mp4';
        const inputName = `input_${i}.${ext}`;
        const scaledName = `scaled_${i}.mp4`; // 缩放后统一为 mp4
        await writeBlobToFile(blob, inputName);
        await scaleVideo(inputName, scaledName, width, height, (p) => {
          setFFmpegProgress(i / scenes.length + p / scenes.length);
        });
        await deleteFile(inputName);
        scaledNames.push(scaledName);
      }

      setFFmpegProgress(0);
      studioLogger.info('ffmpeg', `Concatenating ${scaledNames.length} segments...`);
      await concatVideos(scaledNames, 'output.mp4', (p) => setFFmpegProgress(p));
      const url = await readFileAsBlobURL('output.mp4');
      setFinalVideoUrl(url);
      metaRef.current.finalVideoUrl = url;
      studioLogger.success('ffmpeg', 'Concatenation complete');

      for (const name of scaledNames) await deleteFile(name);
      await deleteFile('output.mp4');

      metaRef.current.phase = 'completed';
      setPhase('completed');
      flushPersist();
    } catch (e) {
      const msg = (e as Error).message;
      const raw = e instanceof Error ? e.stack || e.message : String(e);
      studioLogger.error('ffmpeg', `Concatenation failed: ${msg}`, raw);
      setErrorMsg('concatFailed');
      metaRef.current.phase = 'error';
      setPhase('error');
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
        <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          {t('title')}
        </h2>
        <p className="mt-2 text-gray-400 text-sm">{t('subtitle')}</p>
      </div>

      {projects.length > 0 && phase === 'idle' && (
        <TaskList
          projects={projects}
          currentProjectId={currentProjectId}
          onResume={handleResume}
          onDelete={handleDeleteProject}
          onNew={handleNewProject}
        />
      )}

      <ApiKeyPanel apiKey={apiKey} hasKey={hasKey} saveKey={saveKey} clearKey={clearKey} />

      {!hasKey ? (
        <div className="text-center py-12 bg-gray-800/40 backdrop-blur-xl border border-gray-700/60 rounded-2xl">
          <div className="text-4xl mb-4">🔑</div>
          <h3 className="text-lg font-medium text-gray-200 mb-2">{t('apiKeyRequired')}</h3>
          <p className="text-sm text-gray-400 max-w-sm mx-auto">{t('apiKeyHint')}</p>
        </div>
      ) : (
        <>
          {(phase === 'idle' || phase === 'script_generating') && (
            <IdeaInput
              idea={idea} setIdea={setIdea}
              sceneCount={sceneCount} setSceneCount={setSceneCount}
              ratio={ratio} setRatio={setRatio}
              duration={duration} setDuration={setDuration}
              style={style} setStyle={setStyle}
              enableWatermark={enableWatermark} setEnableWatermark={setEnableWatermark}
              loading={phase === 'script_generating'}
              onGenerate={handleSplitScenes}
            />
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
            <div className="p-5 rounded-xl bg-red-500/10 border border-red-500/30">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-red-300">
                    {t(`errors.${errCode}`)}
                  </p>
                  {hasErrHint && errHintKey && (
                    <p className="text-xs text-red-400/80 mt-1.5 leading-relaxed">
                      {t(errHintKey)}
                    </p>
                  )}
                  {hasFailedScenes && phase !== 'error' && (
                    <p className="text-xs text-amber-400/80 mt-1.5">{t('partialFailedHint')}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                {hasFailedScenes && (
                  <button
                    onClick={handleRetryFailed}
                    className="px-4 py-2 text-sm font-medium bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded-lg transition"
                  >
                    {t('retryFailed')}
                  </button>
                )}
                <button
                  onClick={handleNewProject}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 bg-gray-800/50 border border-gray-700/50 rounded-lg transition"
                >
                  {t('reset')}
                </button>
              </div>
            </div>
          )}

          {/* 部分失败提示（非 error 阶段） */}
          {phase === 'all_videos_ready' && hasFailedScenes && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
                </svg>
                <p className="text-xs text-amber-300/90 leading-relaxed">{t('partialFailedHint')}</p>
              </div>
            </div>
          )}

          {/* 日志面板：除 idle 外常驻展示 */}
          {phase !== 'idle' && <LogPanel />}
        </>
      )}
    </div>
  );
}
