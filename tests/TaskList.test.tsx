import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { StudioProject } from '@/studio-core/types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import TaskList from '@/studio-core/components/TaskList';

function makeProject(over: Partial<StudioProject> = {}): StudioProject {
  return {
    id: 'p1',
    idea: 'cat video',
    sceneCount: 2,
    ratio: '16:9',
    duration: 5,
    style: 'cinematic',
    enableWatermark: false,
    model: 'agnes-video-v2.0',
    domain: 'com',
    phase: 'videos_generating',
    createdAt: Date.parse('2026-09-28T10:00:00Z'),
    updatedAt: Date.parse('2026-09-28T10:00:00Z'),
    scenes: [
      { index: 1, title: 'S1', visualPrompt: 'vp', narration: '', status: 'completed' },
      { index: 2, title: 'S2', visualPrompt: 'vp', narration: '', status: 'pending' },
    ],
    ...over,
  } as StudioProject;
}

describe('TaskList', () => {
  it('渲染项目行：创意、进度 1/2、操作按钮', () => {
    const onResume = vi.fn();
    const onDelete = vi.fn();
    render(
      <TaskList
        projects={[makeProject()]}
        currentProjectId={null}
        onResume={onResume}
        onDelete={onDelete}
        onNew={() => {}}
      />,
    );

    expect(screen.getByText('cat video')).toBeInTheDocument();
    // 1/2 场景完成
    expect(screen.getByText(/1\/2/)).toBeInTheDocument();
    // 有未完成场景 → 可续传 → resume 按钮
    expect(screen.getByText('resume')).toBeInTheDocument();
    expect(screen.getByText('delete')).toBeInTheDocument();
  });

  it('空创意回退为 untitled', () => {
    render(
      <TaskList
        projects={[makeProject({ idea: '' })]}
        currentProjectId={null}
        onResume={() => {}}
        onDelete={() => {}}
        onNew={() => {}}
      />,
    );
    expect(screen.getByText('untitled')).toBeInTheDocument();
  });

  it('已完成项目显示 view 而不是 resume', () => {
    render(
      <TaskList
        projects={[
          makeProject({
            phase: 'completed',
            scenes: [
              { index: 1, title: 'S1', visualPrompt: 'vp', narration: '', status: 'completed' },
              { index: 2, title: 'S2', visualPrompt: 'vp', narration: '', status: 'completed' },
            ],
          }),
        ]}
        currentProjectId={null}
        onResume={() => {}}
        onDelete={() => {}}
        onNew={() => {}}
      />,
    );
    expect(screen.queryByText('resume')).toBeNull();
    expect(screen.getByText('view')).toBeInTheDocument();
  });

  it('当前项目高亮（isActive 样式）', () => {
    const { container } = render(
      <TaskList
        projects={[makeProject()]}
        currentProjectId="p1"
        onResume={() => {}}
        onDelete={() => {}}
        onNew={() => {}}
      />,
    );
    expect(container.textContent).toContain('cat video');
    expect(container.querySelector('.bg-accent\\/8.border-accent\\/30')).not.toBeNull();
  });

  it('点击 resume / delete / new 触发对应回调', async () => {
    const user = userEvent.setup();
    const onResume = vi.fn();
    const onDelete = vi.fn();
    const onNew = vi.fn();
    render(
      <TaskList
        projects={[makeProject()]}
        currentProjectId={null}
        onResume={onResume}
        onDelete={onDelete}
        onNew={onNew}
      />,
    );

    await user.click(screen.getByText('resume'));
    expect(onResume).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));

    await user.click(screen.getByText('delete'));
    expect(onDelete).toHaveBeenCalledWith('p1');

    // 按钮文本为 "+ newProject"（前缀加号是独立文本节点）
    await user.click(screen.getByText(/newProject/));
    expect(onNew).toHaveBeenCalledTimes(1);
  });
});
