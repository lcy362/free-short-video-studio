/**
 * 作品库：三个 tab（图片 / 单镜短片 / 多镜成片）共用的本地任务记录。
 * ─────────────────────────────────────────────────────────────
 * 与 task-store.ts 的分工：
 * - task-store 存多镜成片的场景细节（videoId / 状态 / 远端 URL），服务于断点续传；
 * - library-store 只存「展示 + 回访」需要的元信息，服务于独立作品库模块。
 *
 * 只保存远端 URL：blob: / object URL 刷新后即失效，写入前会被过滤掉。
 * 旧版多镜任务列表的数据会在首次读取时自动迁移进来，不删除原数据。
 *
 * ⚠️ studio-core/ 同步约束：仅相对路径 import，不含任何密钥 / 私有 ID。
 */

export type LibraryKind = 'image' | 'simple' | 'creative';
export type LibraryStatus = 'running' | 'completed' | 'error';

export interface LibraryItem {
  id: string;
  kind: LibraryKind;
  status: LibraryStatus;
  /** 列表标题：提示词摘要或创意描述（本地保存，不上报埋点） */
  title: string;
  /** 完整提示词，仅留在浏览器本地，用于「再来一个」时回填 */
  prompt?: string;
  model?: string;
  ratio?: string;
  duration_s?: number;
  createdAt: number;
  updatedAt: number;
  /** 仅远端可访问地址；blob URL 会被丢弃 */
  mediaUrl?: string;
  /** 单镜短片：失败或超时后可用 ?video_id= 回查终态 */
  videoId?: string;
  errorCode?: string;
  favorite?: boolean;
  /** 多镜成片：对应 task-store 里的项目 id，用于「继续」 */
  projectRef?: string;
  /** 多镜成片进度，如 "2/3" */
  progress?: string;
}

export const LIBRARY_STORAGE_KEY = 'agnes-studio-library';
export const LIBRARY_CHANGE_EVENT = 'agnes-library-change';
/** 多镜成片「继续」：作品库 → StudioClient 的跨组件指令（避免层层透传 props） */
export const STUDIO_RESUME_EVENT = 'agnes-studio-resume';

const LEGACY_PROJECTS_KEY = 'agnes-studio-projects';
const MIGRATED_KEY = 'agnes-studio-library-migrated';
const MAX_ITEMS = 30;

function isClient(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

/** 只持久化可跨刷新访问的地址 */
function safeMediaUrl(url: string | undefined): string | undefined {
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) return undefined;
  return url;
}

function readRaw(): LibraryItem[] {
  if (!isClient()) return [];
  try {
    const arr = JSON.parse(localStorage.getItem(LIBRARY_STORAGE_KEY) || '[]');
    return Array.isArray(arr) ? (arr as LibraryItem[]) : [];
  } catch {
    return [];
  }
}

function notify(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(LIBRARY_CHANGE_EVENT));
  } catch {
    /* 事件不可用（老浏览器）时静默降级：下次挂载会重新读取 */
  }
}

function write(list: LibraryItem[]): void {
  if (!isClient()) return;
  const sorted = [...list]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_ITEMS);
  try {
    localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(sorted));
  } catch {
    // 配额超限：截断到 8 条再试一次
    try {
      localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(sorted.slice(0, 8)));
    } catch {
      /* ignore */
    }
  }
  notify();
}

/**
 * 旧版「任务列表」迁移：把 agnes-studio-projects 的项目映射成 creative 记录。
 * 用固定前缀 legacy_ + 原 id，重复执行也不会产生副本。
 */
function migrateLegacyProjects(): void {
  if (!isClient()) return;
  if (localStorage.getItem(MIGRATED_KEY)) return;
  try {
    const raw = localStorage.getItem(LEGACY_PROJECTS_KEY);
    const legacy = raw ? JSON.parse(raw) : [];
    const list = readRaw();
    if (Array.isArray(legacy)) {
      for (const p of legacy) {
        if (!p || !p.id || list.some((i) => i.id === `legacy_${p.id}`)) continue;
        const scenes = Array.isArray(p.scenes) ? p.scenes : [];
        const done = scenes.filter((s: { status?: string }) => s.status === 'completed').length;
        const status: LibraryStatus =
          p.phase === 'completed' ? 'completed' : p.phase === 'error' ? 'error' : 'running';
        list.push({
          id: `legacy_${p.id}`,
          kind: 'creative',
          status,
          title: p.idea || '',
          projectRef: p.id,
          model: p.model,
          ratio: p.ratio,
          duration_s: p.duration,
          progress: `${done}/${scenes.length}`,
          createdAt: p.createdAt || Date.now(),
          updatedAt: p.updatedAt || p.createdAt || Date.now(),
          errorCode: p.errorMsg,
        });
      }
    }
    write(list);
    localStorage.setItem(MIGRATED_KEY, '1');
  } catch {
    // 旧数据损坏：只打标记，不让作品库整体不可用
    try {
      localStorage.setItem(MIGRATED_KEY, '1');
    } catch {
      /* ignore */
    }
  }
}

/** 读取全部作品（含旧任务迁移，按更新时间降序） */
export function loadLibraryItems(): LibraryItem[] {
  migrateLegacyProjects();
  return readRaw().sort((a, b) => b.updatedAt - a.updatedAt);
}

let idSeq = 0;

/** 生成 ID（不依赖 Math.random，避免 Sonar S2245） */
export function genLibraryId(): string {
  const bytes = new Uint8Array(4);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  }
  const rnd = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 6);
  idSeq = (idSeq + 1) % 36;
  return `lib_${Date.now()}_${rnd}${idSeq.toString(36)}`;
}

export type NewLibraryItem = Omit<LibraryItem, 'id' | 'createdAt' | 'updatedAt'>;

/** 新建一条记录并返回带 id 的完整对象（调用方把 id 存进 ref，后续 update 用） */
export function createLibraryItem(input: NewLibraryItem): LibraryItem {
  const now = Date.now();
  const item: LibraryItem = {
    ...input,
    id: genLibraryId(),
    createdAt: now,
    updatedAt: now,
    mediaUrl: safeMediaUrl(input.mediaUrl),
  };
  const list = readRaw().filter((i) => i.id !== item.id);
  list.unshift(item);
  write(list);
  return item;
}

/** 局部更新一条记录；不存在则忽略（不制造幽灵记录） */
export function updateLibraryItem(id: string, patch: Partial<Omit<LibraryItem, 'id' | 'createdAt'>>): void {
  if (!id) return;
  const list = readRaw();
  const idx = list.findIndex((i) => i.id === id);
  if (idx < 0) return;
  const merged: LibraryItem = { ...list[idx], ...patch, updatedAt: Date.now() };
  merged.mediaUrl = safeMediaUrl(patch.mediaUrl ?? list[idx].mediaUrl);
  list[idx] = merged;
  write(list);
}

export function deleteLibraryItem(id: string): void {
  write(readRaw().filter((i) => i.id !== id));
}

export function clearLibraryItems(): void {
  write([]);
}

/** 切换收藏标记，返回切换后的值 */
export function toggleLibraryFavorite(id: string): boolean {
  const list = readRaw();
  const idx = list.findIndex((i) => i.id === id);
  if (idx < 0) return false;
  const next = !list[idx].favorite;
  list[idx] = { ...list[idx], favorite: next, updatedAt: Date.now() };
  write(list);
  return next;
}

/** 订阅作品库变化（本页写入 + 其他标签页 storage 事件），返回取消订阅函数 */
export function subscribeLibrary(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === LIBRARY_STORAGE_KEY) cb();
  };
  window.addEventListener(LIBRARY_CHANGE_EVENT, cb);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(LIBRARY_CHANGE_EVENT, cb);
    window.removeEventListener('storage', onStorage);
  };
}

/** 作品库请求恢复某个多镜项目 */
export function requestStudioResume(projectId: string): void {
  if (typeof window === 'undefined' || !projectId) return;
  window.dispatchEvent(new CustomEvent(STUDIO_RESUME_EVENT, { detail: { projectId } }));
}

/** StudioClient 监听恢复指令 */
export function subscribeStudioResume(cb: (projectId: string) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const id = (e as CustomEvent<{ projectId?: string }>).detail?.projectId;
    if (id) cb(id);
  };
  window.addEventListener(STUDIO_RESUME_EVENT, handler);
  return () => window.removeEventListener(STUDIO_RESUME_EVENT, handler);
}
