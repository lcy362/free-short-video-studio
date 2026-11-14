'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { readImageFile } from '../lib/image-file';

export interface RefImageItem {
  dataUrl: string;
  name: string;
}

/**
 * 多图输入（v8.1 对齐）
 * ─────────────────────────────────────────────────────────────
 * 一套组件同时服务两种上游用法：
 * - 参考图（`mode: 'reference'` + `images[]`，Flash ≤5 张）：只给 count 上限；
 * - 原生首尾帧（`mode: 'keyframe'` + `first_frame` / `last_frame`）：
 *   槽位固定 2 个，传 `slotLabels` 显示「首帧 / 尾帧」。
 *
 * 单图时代的 `ReferenceImageInput` 已删除（旧版只能 1 张，与接口能力不符）。
 */
export default function RefImagesInput({
  label,
  items,
  max,
  onAdd,
  onRemove,
  disabled,
  hint,
  slotLabels,
}: Readonly<{
  label: string;
  items: RefImageItem[];
  max: number;
  onAdd: (items: RefImageItem[]) => void;
  onRemove: (index: number) => void;
  disabled: boolean;
  hint?: string;
  slotLabels?: string[];
}>) {
  const t = useTranslations('demo');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (inputRef.current) inputRef.current.value = '';
    if (!files.length) return;

    const room = Math.max(0, max - items.length);
    const picked = files.slice(0, room);
    const loaded: RefImageItem[] = [];
    for (const file of picked) {
      const dataUrl = await readImageFile(file);
      if (dataUrl) loaded.push({ dataUrl, name: file.name });
    }
    if (loaded.length) onAdd(loaded);
  };

  const canAdd = !disabled && items.length < max;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="block text-sm font-medium text-ink-2">{label}</span>
        <span className="text-xs text-muted font-mono tabular-nums">
          {items.length}/{max}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {items.map((item, index) => (
          <div
            key={`${item.name}::${item.dataUrl.slice(-24)}`}
            className="relative group"
          >
            <img
              src={item.dataUrl}
              alt={slotLabels?.[index] ?? item.name}
              className="w-16 h-16 rounded-lg object-cover border border-rule"
            />
            <span className="absolute -top-1.5 -left-1.5 min-w-5 h-5 px-1 rounded-full bg-accent text-accent-ink text-[10px] font-mono flex items-center justify-center">
              {index + 1}
            </span>
            {slotLabels?.[index] && (
              <span className="absolute bottom-0 inset-x-0 rounded-b-lg bg-ink/70 text-paper text-[10px] text-center leading-4 truncate">
                {slotLabels[index]}
              </span>
            )}
            {!disabled && (
              <button
                type="button"
                onClick={() => onRemove(index)}
                aria-label={`${t('video.clearImage')} ${index + 1}`}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-danger text-paper text-xs leading-none flex items-center justify-center hover:opacity-90 transition"
              >
                ×
              </button>
            )}
          </div>
        ))}

        {canAdd && (
          <label className="w-16 h-16 rounded-lg border border-dashed border-rule bg-paper-2 flex items-center justify-center text-muted hover:text-ink hover:border-rule/80 cursor-pointer transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="sr-only">{t('video.chooseImage')}</span>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple={max - items.length > 1}
              className="hidden"
              disabled={disabled}
              onChange={handleFiles}
            />
          </label>
        )}
      </div>

      {hint && <p className="text-xs text-muted leading-relaxed">{hint}</p>}
    </div>
  );
}
