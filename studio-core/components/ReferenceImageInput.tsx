'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';

/**
 * 将图片文件读取为 dataURL，并在长边超过 maxDim 时用 canvas 等比缩小，
 * 避免过大的 base64 请求体（参考源项目的参考图归一化思路）。
 */
export async function fileToResizedDataUrl(file: File, maxDim = 1024): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('image load failed'));
    el.src = raw;
  });

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  if (scale >= 1) return raw;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return raw;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const keepAlpha = file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/gif';
  return keepAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9);
}

export default function ReferenceImageInput({
  dataUrl,
  fileName,
  onSelect,
  onClear,
  disabled,
  hint,
}: {
  dataUrl: string;
  fileName: string;
  onSelect: (dataUrl: string, fileName: string) => void;
  onClear: () => void;
  disabled: boolean;
  hint?: string;
}) {
  const t = useTranslations('demo');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await fileToResizedDataUrl(file);
      onSelect(url, file.name);
    } catch {
      // 读取失败：回退原始 dataURL
      const reader = new FileReader();
      reader.onload = () => onSelect(reader.result as string, file.name);
      reader.onerror = () => onClear();
      reader.readAsDataURL(file);
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-ink-2">{t('video.refImage')}</span>
      <div className="flex items-center gap-3">
        {dataUrl ? (
          <img
            src={dataUrl}
            alt="Reference"
            className="w-16 h-16 rounded-lg object-cover border border-rule shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-lg border border-dashed border-rule bg-paper-2 flex items-center justify-center text-muted shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <label className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-paper border border-rule rounded-lg text-ink-2 hover:text-ink hover:border-rule/80 transition disabled:opacity-40 disabled:cursor-not-allowed">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {t('video.chooseImage')}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              disabled={disabled}
              onChange={handleFile}
            />
          </label>
          <p className="mt-1 text-xs text-muted truncate">
            {fileName ? t('video.imageSelected', { name: fileName }) : t('video.noImage')}
          </p>
        </div>
        {dataUrl && !disabled && (
          <button
            onClick={onClear}
            className="text-xs text-muted hover:text-danger transition-colors shrink-0"
          >
            {t('video.clearImage')}
          </button>
        )}
      </div>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
