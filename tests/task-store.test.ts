import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  loadProjects,
  saveProject,
  deleteProject,
  clearAllProjects,
  genProjectId,
  isResumable,
} from '../studio-core/lib/task-store';
import type { StudioProject, Scene } from '../studio-core/types';

function makeProject(overrides: Partial<StudioProject> = {}): StudioProject {
  const scene: Scene = {
    index: 1,
    title: 's1',
    visualPrompt: 'vp',
    narration: 'n',
    status: 'pending',
  };
  return {
    id: 'proj_1',
    idea: 'idea',
    sceneCount: 1,
    ratio: '16:9',
    duration: 5,
    style: 'cinematic',
    enableWatermark: false,
    scenes: [scene],
    phase: 'videos_generating',
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('task-store', () => {
  beforeEach(() => localStorage.clear());

  it('save + load round-trip, sorted by updatedAt desc', async () => {
    // saveProject 强制 updatedAt=Date.now()，用 fake timers 控制保存顺序
    vi.useFakeTimers();
    vi.setSystemTime(100);
    saveProject(makeProject({ id: 'a' }));
    vi.setSystemTime(300);
    saveProject(makeProject({ id: 'b' }));
    vi.setSystemTime(200);
    saveProject(makeProject({ id: 'c' }));
    vi.useRealTimers();
    const list = loadProjects();
    expect(list.map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });

  it('saveProject updates an existing project in place', () => {
    saveProject(makeProject({ id: 'a' }));
    saveProject(makeProject({ id: 'a', idea: 'updated', scenes: [] }));
    const list = loadProjects();
    expect(list).toHaveLength(1);
    expect(list[0].idea).toBe('updated');
  });

  it('caps stored projects at 20', () => {
    for (let i = 0; i < 25; i++) {
      saveProject(makeProject({ id: `p${i}`, updatedAt: i }));
    }
    expect(loadProjects()).toHaveLength(20);
    // 最旧的（updatedAt 最小）被截断
    expect(loadProjects().some((p) => p.id === 'p0')).toBe(false);
    expect(loadProjects().some((p) => p.id === 'p24')).toBe(true);
  });

  it('deleteProject removes only the target', () => {
    saveProject(makeProject({ id: 'a' }));
    saveProject(makeProject({ id: 'b' }));
    deleteProject('a');
    expect(loadProjects().map((p) => p.id)).toEqual(['b']);
  });

  it('clearAllProjects empties storage', () => {
    saveProject(makeProject());
    clearAllProjects();
    expect(loadProjects()).toHaveLength(0);
  });

  it('genProjectId has the expected shape and is unique', () => {
    const a = genProjectId();
    const b = genProjectId();
    expect(a).toMatch(/^proj_\d+_[a-z0-9]+$/);
    expect(a).not.toBe(b);
  });

  describe('isResumable', () => {
    const doneScene: Scene = { index: 1, title: 't', visualPrompt: 'v', status: 'completed' };

    it('false for completed / idle phase', () => {
      expect(isResumable(makeProject({ phase: 'completed' }))).toBe(false);
      expect(isResumable(makeProject({ phase: 'idle' }))).toBe(false);
    });

    it('true when normal phase has uncompleted scenes', () => {
      expect(isResumable(makeProject())).toBe(true);
    });

    it('false when all scenes completed', () => {
      expect(isResumable(makeProject({ scenes: [doneScene] }))).toBe(false);
    });

    it('error phase: resumable only with a submitted-but-unfinished scene', () => {
      expect(
        isResumable(
          makeProject({ phase: 'error', scenes: [{ ...doneScene, videoId: 'v1', status: 'generating' }] }),
        ),
      ).toBe(true);
      expect(isResumable(makeProject({ phase: 'error', scenes: [doneScene] }))).toBe(false);
      expect(
        isResumable(makeProject({ phase: 'error', scenes: [{ ...doneScene, status: 'error' }] })),
      ).toBe(false);
      expect(isResumable(makeProject({ phase: 'error', scenes: [] }))).toBe(false);
    });
  });
});
