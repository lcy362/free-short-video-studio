// Studio 网页版类型定义
// 轮询/重试/限速参数对齐原项目 agnes-video-generator（Python/FastAPI）

/** Studio 整体流程状态机 */
export type StudioPhase =
  | 'idle' // 初始状态
  | 'script_generating' // LLM 场景拆分中
  | 'script_ready' // 场景列表就绪，可编辑
  | 'videos_generating' // 逐场景提交+轮询中
  | 'all_videos_ready' // 所有片段下载完成
  | 'ffmpeg_loading' // 加载 ffmpeg.wasm
  | 'concatenating' // 拼接中
  | 'completed' // 最终视频就绪
  | 'error'; // 任一阶段失败

/** 单个场景的生成状态 */
export type SceneStatus =
  | 'pending' // 待生成
  | 'submitting' // 提交中
  | 'queued' // 已排队等待提交（受提交限速器约束）
  | 'generating' // 轮询中
  | 'completed' // 已完成
  | 'error'; // 失败

/** 视频画面比例 */
export type StudioRatio = '16:9' | '9:16' | '1:1';

/** 单场景视频时长（秒）。帧数上限：720p 档 409 帧（≈17s）、1080p 档 169 帧（≈7s）。 */
export type StudioDuration = 5 | 8 | 10 | 12;

/** 单个场景定义（LLM 拆分结果） */
export interface Scene {
  /** 场景序号（从 1 开始） */
  index: number;
  /** 场景标题（简短描述） */
  title: string;
  /** 视觉提示词（用于文生视频） */
  visualPrompt: string;
  /** 旁白文案（一期不用于 TTS，仅展示） */
  narration?: string;
  /** 生成状态 */
  status: SceneStatus;
  /** 提交后的 video_id（持久化，用于断点续传恢复轮询） */
  videoId?: string;
  /** 生成进度（0-100） */
  progress?: number;
  /** 远端视频 URL（持久化；blob 刷新失效后可据此重新下载） */
  remoteVideoUrl?: string;
  /** 已下载的视频 Blob URL（内存态，刷新失效） */
  videoUrl?: string;
  /** 错误信息 */
  error?: string;
  /** 已等待秒数 */
  elapsedSeconds?: number;
  /** 轮询次数 */
  pollCount?: number;
  /** 连续轮询失败次数（达到上限则放弃） */
  consecutiveFailures?: number;
  /** 提交尝试次数（含首次） */
  submitAttempts?: number;
  /** 提交/轮询起始时间戳 */
  startedAt?: number;
}

/** LLM 场景拆分请求参数 */
export interface SceneSplitRequest {
  idea: string;
  sceneCount: number;
  style?: string;
  locale: string;
}

/** LLM 场景拆分响应（单场景） */
export interface SceneSplitItem {
  title: string;
  visualPrompt: string;
  narration: string;
}

/**
 * 视频画面比例对应的分辨率（取 720p 档位内的最大尺寸，帧数上限 409 ≈ 17s）。
 * 注意：像素一旦超过 1280×720（921600）即落入 1080p 档，帧数上限骤降至 169 ≈ 7s，
 * 因此 9:16 / 1:1 选择恰好不超阈值的 720×1280 / 960×960。
 */
export const STUDIO_RATIO_DIMS: Record<StudioRatio, [number, number]> = {
  '16:9': [1152, 768],
  '9:16': [720, 1280],
  '1:1': [960, 960],
};

/** 画面比例选项 */
export const STUDIO_RATIO_OPTIONS: { value: StudioRatio; labelKey: string }[] = [
  { value: '16:9', labelKey: 'landscape' },
  { value: '9:16', labelKey: 'portrait' },
  { value: '1:1', labelKey: 'square' },
];

/** 场景时长选项 */
export const STUDIO_DURATION_OPTIONS: { value: StudioDuration; labelKey: string }[] = [
  { value: 5, labelKey: 'duration5' },
  { value: 8, labelKey: 'duration8' },
  { value: 10, labelKey: 'duration10' },
  { value: 12, labelKey: 'duration12' },
];

/** 场景数量选项 */
export const SCENE_COUNT_OPTIONS = [2, 3, 4, 5] as const;

/** 视频风格选项的 key（label 走 i18n） */
export const STYLE_OPTIONS = [
  'cinematic',
  'realistic',
  'anime',
  'documentary',
  'fantasy',
] as const;

export type StudioStyle = (typeof STYLE_OPTIONS)[number];

// ─── 轮询 / 重试 / 限速参数（对齐原项目 agnes-video-generator） ───────────────

/** 轮询间隔：60 秒（原项目 D14 决策，从 30s 提升到 60s 以减少限速配额消耗） */
export const POLL_INTERVAL = 60_000;

/** 单场景最大轮询时长：30 分钟（原项目 max_poll_duration=1800） */
export const MAX_POLL_TIME = 1_800_000;

/** 轮询连续失败上限：10 次（原项目 max_consecutive_failures=10） */
export const MAX_CONSECUTIVE_FAILURES = 10;

/** 视频提交最大重试次数：5 次（原项目 max_retries=5） */
export const MAX_SUBMIT_RETRIES = 5;

/** 提交重试退避基数：30 秒（原项目 retry_base_delay=30，线性递增 delay=30*(attempt+1)） */
export const RETRY_BASE_DELAY = 30_000;

/**
 * 视频提交接口最小间隔：60 秒。
 * 视频提交接口并发度现为「每分钟 1 次」，两次提交间至少间隔 60s。
 */
export const MIN_SUBMIT_INTERVAL = 60_000;

/** localStorage 中持久化的创作项目（用于断点续传与任务列表） */
export interface StudioProject {
  /** 唯一 ID */
  id: string;
  /** 创意描述 */
  idea: string;
  /** 场景数量 */
  sceneCount: number;
  /** 画面比例 */
  ratio: StudioRatio;
  /** 单场景视频时长（秒） */
  duration: StudioDuration;
  /** 视觉风格 */
  style: StudioStyle;
  /** 是否启用水印 */
  enableWatermark: boolean;
  /** 场景列表（含 videoId/状态/进度，用于续传） */
  scenes: Scene[];
  /** 当前流程阶段 */
  phase: StudioPhase;
  /** 错误信息（若有） */
  errorMsg?: string;
  /** 创建时间戳 */
  createdAt: number;
  /** 最后更新时间戳 */
  updatedAt: number;
  /**
   * 最终拼接视频 Blob URL。
   * 仅内存态有效，刷新后失效（拼接产物无法续传，需重新拼接）。
   */
  finalVideoUrl?: string;
}
