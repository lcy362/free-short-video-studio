import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FreeShortVideoStudio — Free AI Short Video Generator',
  description:
    'FreeShortVideoStudio: a free online AI creator with three modes — image generation, single-clip text-to-video, and multi-scene creative video. Everything runs in your browser: no install, no GPU, no credit card — just a free Agnes API key.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 品牌琥珀金（暗色 accent oklch(80% 0.14 75) 的 sRGB 近似），亮暗模式统一
  themeColor: '#e8b33e',
};

/** 防闪烁（FOUC）内联脚本：在 React hydration 前同步设置 <html data-theme>。
 *  逻辑与官网 video-website 一致：localStorage['theme'] ∈ system|light|dark → data-theme */
const THEME_SCRIPT = `(function(){try{var m=localStorage.getItem('theme');var mode=(m==='light'||m==='dark'||m==='system')?m:'system';var dark=mode==='dark'||(mode==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',dark?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh" data-theme="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-paper text-ink font-sans">
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
