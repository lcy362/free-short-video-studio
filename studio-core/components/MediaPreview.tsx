'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

export default function MediaPreview({
  type,
  url,
  apiKey,
  onRegenerate,
  orientationHint,
}: Readonly<{
  type: 'image' | 'video';
  url: string;
  apiKey?: string;
  onRegenerate?: () => void;
  /**
   * W4：上游 2.5 系列 9:16 产物容器正确但画面躺倒 90°（无 rotation 元数据）。
   * 仅提示，不做播放侧自动旋转 —— 上游一旦修复，自动旋转会反向出错。
   */
  orientationHint?: boolean;
}>) {
  const t = useTranslations('demo');
  const [isDownloading, setIsDownloading] = useState(false);
  const [videoBlobUrl, setVideoBlobUrl] = useState<string>('');

  // For video: fetch with auth headers → blob URL for playback
  useEffect(() => {
    if (type !== 'video' || !url) return;

    let revoked = false;

    const loadVideo = async () => {
      try {
        const resp = await fetch(url, {
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        if (!revoked) setVideoBlobUrl(blobUrl);
        else URL.revokeObjectURL(blobUrl);
      } catch {
        // Fallback: use original URL directly (may work if no auth needed)
        if (!revoked) setVideoBlobUrl(url);
      }
    };

    // loadVideo 内部已 try/catch 兜底，这里只需显式忽略返回的 Promise（S9383）
    void loadVideo();
    return () => {
      revoked = true;
    };
  }, [type, url, apiKey]);

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (videoBlobUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(videoBlobUrl);
      }
    };
  }, [videoBlobUrl]);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const resp = await fetch(url, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = type === 'video' ? 'generated-video.mp4' : 'generated-image.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    } finally {
      setIsDownloading(false);
    }
  };

  const displayUrl = type === 'video' ? (videoBlobUrl || '') : url;

  // 三个互斥分支（图片 / 视频已就绪 / 视频加载中）用语句表达，避免嵌套三元（S3358）
  let media: JSX.Element;
  if (type === 'image') {
    media = <img src={displayUrl} alt="Generated" className="w-full" loading="lazy" />;
  } else if (displayUrl) {
    media = (
      <video src={displayUrl} controls className="w-full" preload="auto">
        {t('video.notSupported')}
      </video>
    );
  } else {
    media = (
      <div className="w-full aspect-video flex items-center justify-center">
        <svg className="animate-spin h-5 w-5 text-muted" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="card-surface rounded-2xl overflow-hidden">
      <div className="relative">{media}</div>

      {orientationHint && (
        <p className="px-4 pt-3 text-xs text-warning/90 leading-relaxed">
          {t('video.portraitRotationHint')}
        </p>
      )}

      <div className="p-4 flex items-center justify-between gap-3">
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            className="px-4 py-2 text-sm text-muted hover:text-ink-2 transition-colors"
          >
            {t('retry')}
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="px-4 py-2 text-sm font-medium bg-accent/15 hover:bg-accent/25 border border-accent/30 rounded-lg text-accent transition disabled:opacity-40"
        >
          {isDownloading ? (
            <span className="flex items-center gap-1.5">
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              {t('downloading')}
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {t('download')}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
