// Studio 任务持久化（localStorage）
// 用于断点续传与任务列表展示。
// 持久化内容：项目元信息 + 场景列表（含 videoId / 状态 / 进度 / 远端 videoUrl）。
// 注意：Blob URL（scene.videoUrl / project.finalVideoUrl）刷新后失效，
//       续传时依据 remoteVideoUrl 重新下载、依据 videoId 恢复轮询。

import type { StudioProject } from '../types';

const STORAGE_KEY = 'agnes-studio-projects';
/** 最多保留的项目数（防止 localStorage 膨胀） */
const MAX_PROJECTS = 20;

function isClient(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function read(): StudioProject[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as StudioProject[]) : [];
  } catch {
    return [];
  }
}

function write(list: StudioProject[]): void {
  if (!isClient()) return;
  try {
    // 按 updatedAt 降序，截断到 MAX_PROJECTS
    const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_PROJECTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
  } catch {
    // 配额超限等：丢弃最旧的再试一次
    try {
      const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
    } catch {
      /* ignore */
    }
  }
}

/** 加载全部项目（按更新时间降序） */
export function loadProjects(): StudioProject[] {
  return read().sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 保存（新增或更新）一个项目 */
export function saveProject(project: StudioProject): void {
  const list = read();
  const idx = list.findIndex((p) => p.id === project.id);
  const updated: StudioProject = { ...project, updatedAt: Date.now() };
  if (idx >= 0) list[idx] = updated;
  else list.unshift(updated);
  write(list);
}

/** 删除一个项目 */
export function deleteProject(id: string): void {
  write(read().filter((p) => p.id !== id));
}

/** 清空全部项目 */
export function clearAllProjects(): void {
  if (!isClient()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** 生成项目 ID（Sonar S2245：不用 Math.random，伪随机可预测） */
let idSeq = 0;

export function genProjectId(): string {
  const bytes = new Uint8Array(4);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  }
  const rnd = Array.from(bytes, (b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 6);
  // 自增后缀：crypto 不可用（SSR）时仍保证同毫秒内唯一
  idSeq = (idSeq + 1) % 36;
  return `proj_${Date.now()}_${rnd}${idSeq.toString(36)}`;
}

/**
 * 判断项目是否处于「可续传」状态（有未完成的场景，且非最终完成态）。
 * 用于页面加载时自动提示恢复。
 */
export function isResumable(project: StudioProject): boolean {
  if (project.phase === 'completed' || project.phase === 'idle') return false;
  if (project.phase === 'error') {
    // error 态：若有已提交但未完成的场景，仍可续传
    return project.scenes.some(
      (s) => s.videoId && s.status !== 'completed' && s.status !== 'error',
    );
  }
  return project.scenes.some((s) => s.status !== 'completed');
}
