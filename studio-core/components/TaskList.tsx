'use client';

import { useTranslations } from 'next-intl';
import type { StudioProject } from '../types';
import { isResumable } from '../lib/task-store';

interface Props {
  readonly projects: StudioProject[];
  readonly currentProjectId: string | null;
  readonly onResume: (p: StudioProject) => void;
  readonly onDelete: (id: string) => void;
  readonly onNew: () => void;
}

export default function TaskList({
  projects,
  currentProjectId,
  onResume,
  onDelete,
  onNew,
}: Props) {
  const t = useTranslations('studio');

  return (
    <div className="card-surface rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-ink flex items-center gap-2">
          <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          {t('taskListTitle')}
        </h3>
        <button onClick={onNew} className="text-xs text-accent hover:text-ink transition-colors">
          + {t('newProject')}
        </button>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto pe-1">
        {projects.map((p) => {
          const total = p.scenes.length;
          const done = p.scenes.filter((s) => s.status === 'completed').length;
          const resumable = isResumable(p);
          const isActive = p.id === currentProjectId;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;

          return (
            <div
              key={p.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition ${
                isActive
                  ? 'bg-accent/8 border-accent/30'
                  : 'bg-paper border-rule hover:border-rule/80 hover:bg-paper-3'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ink-2 truncate">
                  {p.idea || t('untitled')}
                </p>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted">
                  <span>{new Date(p.createdAt).toLocaleString()}</span>
                  <span>·</span>
                  <span>
                    {done}/{total} {t('scenesUnit')}
                  </span>
                  <span>·</span>
                  <span className={resumable ? 'text-accent' : ''}>
                    {t(`phase_${p.phase}`)}
                  </span>
                </div>
                {/* 进度条 */}
                <div className="mt-1.5 h-1 bg-paper-3 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${resumable ? 'bg-accent' : 'bg-accent/50'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1 shrink-0">
                {resumable ? (
                  <button
                    onClick={() => onResume(p)}
                    className="text-xs px-2.5 py-1 bg-accent/15 text-accent rounded hover:bg-accent/25 transition"
                  >
                    {t('resume')}
                  </button>
                ) : (
                  <button
                    onClick={() => onResume(p)}
                    className="text-xs px-2.5 py-1 bg-paper-3 text-ink-2 rounded hover:bg-paper-2 transition"
                  >
                    {t('view')}
                  </button>
                )}
                <button
                  onClick={() => onDelete(p.id)}
                  className="text-xs px-2.5 py-1 text-danger hover:bg-danger/10 rounded transition"
                >
                  {t('delete')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
