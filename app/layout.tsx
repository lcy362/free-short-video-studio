import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FreeShortVideoStudio — Free AI Short Video Generator',
  description:
    'FreeShortVideoStudio: AI-powered free online short video generator. Type an idea, the AI splits it into 2-5 scenes, generates each with text-to-video and stitches them into a complete video in your browser. No install, no GPU, no credit card — just a free Agnes API key.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body className="min-h-screen bg-gray-950 text-gray-100">{children}</body>
    </html>
  );
}
