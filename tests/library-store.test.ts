import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LIBRARY_STORAGE_KEY,
  clearLibraryItems,
  createLibraryItem,
  deleteLibraryItem,
  loadLibraryItems,
  requestStudioResume,
  subscribeLibrary,
  subscribeStudioResume,
  toggleLibraryFavorite,
  updateLibraryItem,
} from '@/studio-core/lib/library-store';

describe('library-store（统一作品库）', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('三类任务记录合并保存，按更新时间倒序展示', () => {
    const image = createLibraryItem({ kind: 'image', status: 'running', title: 'a cat' });
    const clip = createLibraryItem({ kind: 'simple', status: 'running', title: 'waves' });
    const story = createLibraryItem({ kind: 'creative', status: 'running', title: 'a journey' });

    const items = loadLibraryItems();
    expect(items.map((i) => i.id)).toContain(image.id);
    expect(items.map((i) => i.kind)).toEqual(
      expect.arrayContaining(['image', 'simple', 'creative']),
    );
    expect([clip.id, story.id]).toHaveLength(2);
    expect(items[0].updatedAt).toBeGreaterThanOrEqual(items[1].updatedAt);
  });

  it('成功 / 失败状态与远端 URL 写回同一条记录，blob URL 不入库', () => {
    const item = createLibraryItem({ kind: 'image', status: 'running', title: 'a dog' });

    updateLibraryItem(item.id, { status: 'completed', mediaUrl: 'https://example.com/a.png' });
    expect(loadLibraryItems()[0]).toMatchObject({
      status: 'completed',
      mediaUrl: 'https://example.com/a.png',
    });

    updateLibraryItem(item.id, { status: 'error', errorCode: 'network' });
    expect(loadLibraryItems()[0]).toMatchObject({ status: 'error', errorCode: 'network' });

    updateLibraryItem(item.id, { mediaUrl: 'blob:http://localhost/xyz' });
    expect(loadLibraryItems()[0].mediaUrl).toBeUndefined();
    expect(loadLibraryItems()).toHaveLength(1);
  });

  it('单镜短片保存 videoId 供回查结果', () => {
    const item = createLibraryItem({ kind: 'simple', status: 'running', title: 'waves', videoId: 'vid_1' });
    expect(loadLibraryItems().find((i) => i.id === item.id)?.videoId).toBe('vid_1');
  });

  it('更新不存在的 id 不会制造幽灵记录', () => {
    updateLibraryItem('not-exist', { status: 'completed' });
    expect(loadLibraryItems()).toHaveLength(0);
  });

  it('收藏可切换，删除与清空生效', () => {
    const a = createLibraryItem({ kind: 'image', status: 'completed', title: 'a' });
    const b = createLibraryItem({ kind: 'simple', status: 'completed', title: 'b' });

    expect(toggleLibraryFavorite(a.id)).toBe(true);
    expect(loadLibraryItems().find((i) => i.id === a.id)?.favorite).toBe(true);
    expect(toggleLibraryFavorite(a.id)).toBe(false);

    deleteLibraryItem(a.id);
    expect(loadLibraryItems().map((i) => i.id)).toEqual([b.id]);

    clearLibraryItems();
    expect(loadLibraryItems()).toHaveLength(0);
  });

  it('旧版多镜任务自动迁移为 creative 记录，且只迁移一次', () => {
    const legacy = [{
      id: 'proj_1',
      idea: 'old story',
      phase: 'videos_generating',
      ratio: '16:9',
      duration: 5,
      scenes: [{ status: 'completed' }, { status: 'generating' }, { status: 'pending' }],
      createdAt: 1000,
      updatedAt: 2000,
    }];
    localStorage.setItem('agnes-studio-projects', JSON.stringify(legacy));

    expect(loadLibraryItems()).toMatchObject([{
      id: 'legacy_proj_1',
      kind: 'creative',
      status: 'running',
      title: 'old story',
      projectRef: 'proj_1',
      progress: '1/3',
    }]);

    // 迁移后再新增一条，重复读取不应产生副本
    createLibraryItem({ kind: 'image', status: 'completed', title: 'new' });
    expect(loadLibraryItems().filter((i) => i.id === 'legacy_proj_1')).toHaveLength(1);
  });

  it('订阅作品库变化：写入与 storage 事件都触发', () => {
    const cb = vi.fn();
    const unsubscribe = subscribeLibrary(cb);

    createLibraryItem({ kind: 'image', status: 'running', title: 'x' });
    expect(cb).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new StorageEvent('storage', { key: LIBRARY_STORAGE_KEY }));
    expect(cb).toHaveBeenCalledTimes(2);

    unsubscribe();
    createLibraryItem({ kind: 'image', status: 'running', title: 'y' });
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('作品库「继续」指令携带 projectId', () => {
    const cb = vi.fn();
    const unsubscribe = subscribeStudioResume(cb);
    requestStudioResume('proj_42');
    expect(cb).toHaveBeenCalledWith('proj_42');
    unsubscribe();
  });
});
