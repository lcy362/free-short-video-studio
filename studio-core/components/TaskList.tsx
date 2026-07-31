'use client';

import { useTranslations } from 'next-intl';
import type { StudioProject } from '../types';
import { isResumable } from '../lib/task-store';

interface Props {
  projects: StudioProject[];
  currentProjectId: string | null;
  onResume: (p: StudioProject) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
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
    <div className="bg-gray-800/40 backdrop-blur-xl border border-gray-700/60 rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          {t('taskListTitle')}
        </h3>
        <button onClick={onNew} className="text-xs text-blue-400 hover:underline">
          + {t('newProject')}
        </button>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
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
                  ? 'bg-blue-500/10 border-blue-500/30'
                  : 'bg-gray-800/50 border-gray-700/50 hover:border-gray-600/60'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-200 truncate">
                  {p.idea || t('untitled')}
                </p>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                  <span>{new Date(p.createdAt).toLocaleString()}</span>
                  <span>·</span>
                  <span>
                    {done}/{total} {t('scenesUnit')}
                  </span>
                  <span>·</span>
                  <span className={resumable ? 'text-amber-400' : ''}>
                    {t(`phase_${p.phase}`)}
                  </span>
                </div>
                {/* 进度条 */}
                <div className="mt-1.5 h-1 bg-gray-700/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${resumable ? 'bg-amber-500' : 'bg-blue-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1 shrink-0">
                {resumable ? (
                  <button
                    onClick={() => onResume(p)}
                    className="text-xs px-2.5 py-1 bg-amber-600/20 text-amber-300 rounded hover:bg-amber-600/30 transition"
                  >
                    {t('resume')}
                  </button>
                ) : (
                  <button
                    onClick={() => onResume(p)}
                    className="text-xs px-2.5 py-1 bg-gray-700/50 text-gray-300 rounded hover:bg-gray-700 transition"
                  >
                    {t('view')}
                  </button>
                )}
                <button
                  onClick={() => onDelete(p.id)}
                  className="text-xs px-2.5 py-1 text-red-400 hover:bg-red-500/10 rounded transition"
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
