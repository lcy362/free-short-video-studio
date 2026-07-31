'use client';

import { useTranslations } from 'next-intl';

interface Props {
  url: string;
  onReset: () => void;
}

export default function VideoPreview({ url, onReset }: Props) {
  const t = useTranslations('studio');

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `agnes-studio-${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-800/40 backdrop-blur-xl border border-gray-700/60 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2 h-2 bg-green-400 rounded-full" />
          <h3 className="text-base font-semibold text-white">{t('completedTitle')}</h3>
        </div>

        <video
          src={url}
          controls
          autoPlay
          loop
          className="w-full rounded-xl bg-black"
          preload="auto"
        />

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 rounded-lg transition-all text-white shadow-lg shadow-green-600/20"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {t('download')}
          </button>
          <button
            onClick={onReset}
            className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200 bg-gray-800/50 border border-gray-700/50 rounded-lg transition"
          >
            {t('createAnother')}
          </button>
        </div>
      </div>

      <div className="bg-blue-500/5 border border-blue-500/15 rounded-xl p-4">
        <p className="text-xs text-blue-300/80 leading-relaxed">
          {t('completedNote')}
        </p>
      </div>
    </div>
  );
}
