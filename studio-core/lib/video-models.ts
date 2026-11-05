// Studio 视频模型定义（2026-09 从 demo 迁移，对齐 types/demo.ts 的 VIDEO_MODELS）
// 旧版 agnes-video-v2.0 已下线，只保留 2.5 系列：
// 提交协议用 mode/seconds/size/aspect_ratio（轮询需带 model_name）。

export type StudioVideoModelId = 'agnes-video-2.5-flash';

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

export const DEFAULT_STUDIO_VIDEO_MODEL: StudioVideoModelId = 'agnes-video-2.5-flash';

export const STUDIO_VIDEO_MODELS: StudioVideoModelCap[] = [
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
  // 旧版 v2.0 的存储值不再有效，回退到默认模型
  return saved === 'agnes-video-2.5-flash' ? saved : DEFAULT_STUDIO_VIDEO_MODEL;
}

export function saveStudioModel(id: StudioVideoModelId): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MODEL_STORAGE_KEY, id);
}
