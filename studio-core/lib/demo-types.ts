// Demo 功能类型定义

export type DemoMode = 'video' | 'image';

export type ImageSize = '1024x1024' | '1152x768' | '768x1360';
export type VideoRatio = '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16';
export type VideoDuration = 4 | 5 | 6 | 8 | 10 | 12;

export type GenerationStatus =
  | 'idle'
  | 'submitting'
  | 'generating'
  | 'completed'
  | 'error';

// ─────────────────────────────────────────────────────────────
// 视频模型（旧版 agnes-video-v2.0 已下线，仅保留 2.5 系列）
// ─────────────────────────────────────────────────────────────

export type VideoModelId = 'agnes-video-2.5-flash';

/**
 * 生成模式（对齐上游 2.5 协议）：
 * - text      → `mode: 'text'`（文生视频）
 * - image     → `mode: 'reference'` + `images[]`（多图参考，≤maxRefImages）
 * - keyframe  → `mode: 'keyframe'` + `first_frame` / `last_frame`（原生首尾帧）
 */
export type VideoMode = 'text' | 'image' | 'keyframe';

export interface VideoModelMode {
  id: VideoMode;
  labelKey: string;
}

export interface VideoModelCap {
  id: VideoModelId;
  labelKey: string;
  descKey: string;
  modes: VideoModelMode[];
  /** 参考图张数上限（对齐 core.config.get_max_ref_images：Flash 5 / 2.5 8） */
  maxRefImages: number;
  /** 参考音频段数上限（上游 ≤3 段公开 URL） */
  maxRefAudios: number;
  /** 时长（字符串；2.5 系列 seconds 按字符串传输） */
  durations: string[];
  ratios: { value: VideoRatio; dims: [number, number]; labelKey: string }[];
  /** 是否为 2.5 系列（新协议：mode/seconds/size/aspect_ratio，轮询带 model_name） */
  isV25: boolean;
  /**
   * 档位像素是否为「上游保真输出」。
   * - false（2.5 系列）：比例保真、绝对像素由上游归一（如 3:4 实际 834x1112）
   *   → UI 只展示比例 + 720P，避免把示意值当承诺值（见 docs/plans/demo-video-reliability-plan.md W5）。
   */
  exactPixels: boolean;
  /** 自托管（agnes-video-generator）从该版本起才与 demo 的档位/模型一致（W9） */
  minVersion: string;
}

export const DEFAULT_VIDEO_MODEL: VideoModelId = 'agnes-video-2.5-flash';

export const VIDEO_MODELS: VideoModelCap[] = [
  {
    id: 'agnes-video-2.5-flash',
    labelKey: 'video.modelV25Flash',
    descKey: 'video.modelV25FlashDesc',
    modes: [
      { id: 'text', labelKey: 'video.modeText' },
      { id: 'image', labelKey: 'video.modeImage' },
      { id: 'keyframe', labelKey: 'video.modeKeyframe' },
    ],
    maxRefImages: 5,
    maxRefAudios: 3,
    durations: ['4', '5', '6', '8', '10', '12'],
    ratios: [
      { value: '21:9', dims: [1680, 720], labelKey: 'ratio_21_9' },
      { value: '16:9', dims: [1280, 720], labelKey: 'landscape' },
      { value: '4:3', dims: [960, 720], labelKey: 'ratio_4_3' },
      { value: '1:1', dims: [720, 720], labelKey: 'square' },
      { value: '3:4', dims: [720, 960], labelKey: 'ratio_3_4' },
      { value: '9:16', dims: [720, 1280], labelKey: 'portrait' },
    ],
    isV25: true,
    // 比例保真、绝对像素由上游归一 → UI 只承诺比例与 720P
    exactPixels: false,
    // 2.5 / 2.5-flash 自 v6.2.0 引入
    minVersion: 'v6.2.0',
  },
];

/** 档位展示文案：2.5 系列只给比例 + 720P（W5） */
export function formatRatioLabel(
  cap: VideoModelCap,
  ratio: { labelKey: string },
  translate: (key: string) => string,
): string {
  return cap.exactPixels ? translate(ratio.labelKey) : `${translate(ratio.labelKey)} · 720P`;
}

export function getModelCap(model: VideoModelId): VideoModelCap {
  return VIDEO_MODELS.find((m) => m.id === model) || VIDEO_MODELS[0];
}

export function isV25VideoModel(model: VideoModelId): boolean {
  return getModelCap(model).isV25;
}

// ─────────────────────────────────────────────────────────────
// 图片
// ─────────────────────────────────────────────────────────────

export interface ImageGenerateRequest {
  prompt: string;
  size: ImageSize;
}

export interface ImageGenerateResponse {
  url: string;
  size: string;
}

export interface ApiError {
  error: string;
  detail?: string;
  message?: string;
}

export const SIZE_OPTIONS: { value: ImageSize; labelKey: string }[] = [
  { value: '1024x1024', labelKey: 'square' },
  { value: '1152x768', labelKey: 'landscape' },
  { value: '768x1360', labelKey: 'portrait' },
];
