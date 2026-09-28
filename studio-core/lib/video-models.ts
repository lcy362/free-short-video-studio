// Studio 视频模型定义（2026-09 从 demo 迁移，对齐 types/demo.ts 的 VIDEO_MODELS）
// 两个模型的场景时长（5/8/10/12s）与画面比例（16:9/9:16/1:1）一致，
// 差异在提交协议：v2.0 用 width/height/num_frames/frame_rate，
// 2.5 系列用 mode/seconds/size/aspect_ratio（轮询需带 model_name）。

export type StudioVideoModelId = 'agnes-video-v2.0' | 'agnes-video-2.5-flash';

export interface StudioVideoModelCap {
  id: StudioVideoModelId;
  /** i18n key（studio 命名空间） */
  labelKey: string;
  descKey: string;
  /** 免费标签 key：modelFree / modelFreeLimited */
  badgeKey: string;
  /** 是否为 2.5 系列（新协议） */
  isV25: boolean;
  /** 支持的场景时长（秒），与 StudioDuration 对齐 */
  durations: number[];
}

export const DEFAULT_STUDIO_VIDEO_MODEL: StudioVideoModelId = 'agnes-video-v2.0';

export const STUDIO_VIDEO_MODELS: StudioVideoModelCap[] = [
  {
    id: 'agnes-video-v2.0',
    labelKey: 'modelV2',
    descKey: 'modelV2Desc',
    badgeKey: 'modelFree',
    isV25: false,
    durations: [5, 8, 10, 12],
  },
  {
    id: 'agnes-video-2.5-flash',
    labelKey: 'modelV25Flash',
    descKey: 'modelV25FlashDesc',
    badgeKey: 'modelFreeLimited',
    isV25: true,
    durations: [5, 8, 10, 12],
  },
];

export function getStudioModelCap(id: StudioVideoModelId): StudioVideoModelCap {
  return STUDIO_VIDEO_MODELS.find((m) => m.id === id) || STUDIO_VIDEO_MODELS[0];
}

export function isV25StudioModel(id: StudioVideoModelId): boolean {
  return getStudioModelCap(id).isV25;
}

/** 模型选择的 localStorage 持久化（跨会话记忆） */
const MODEL_STORAGE_KEY = 'agnes_studio_model';

export function loadStudioModel(): StudioVideoModelId {
  if (typeof window === 'undefined') return DEFAULT_STUDIO_VIDEO_MODEL;
  const saved = localStorage.getItem(MODEL_STORAGE_KEY);
  return saved === 'agnes-video-2.5-flash' || saved === 'agnes-video-v2.0'
    ? saved
    : DEFAULT_STUDIO_VIDEO_MODEL;
}

export function saveStudioModel(id: StudioVideoModelId): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MODEL_STORAGE_KEY, id);
}
