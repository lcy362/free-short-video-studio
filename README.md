# 🎬 FreeShortVideoStudio — Free AI Short Video Generator (In-Browser)

[![中文](https://img.shields.io/badge/CN-中文-red)](/README_ZH.md)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Website](https://img.shields.io/badge/website-video.lichuanyang.top-8A2BE2)](https://video.lichuanyang.top/en/studio)

> **Fully online, completely free AI short video generator** — no install, no GPU, no credit card. Type in an idea, AI automatically splits it into 2-5 scenes, generates each scene with text-to-video, and stitches them into a complete short video right in your browser.

## 🚀 Try It Now — No Install Needed

**▶ [video.lichuanyang.top/en/studio](https://video.lichuanyang.top/en/studio)**

> Just paste a free [Agnes AI](https://platform.agnes-ai.com) API key (stored in your browser's localStorage, never uploaded to any server) and start creating AI videos at zero cost.

## ✨ Features

- **Fully in-browser** — everything runs on your device: FFmpeg.js wasm stitching, localStorage-only API key, no backend server for video generation.
- **Creative → Scenes → Video** — AI splits your idea into 2-5 scenes, generates each scene, then stitches the final video with optional audio.
- **Multi-scene editing** — edit scene prompts, re-generate individual scenes, swap scene order before rendering.
- **13 languages** — Chinese, English, Russian, Japanese, Korean, Malay, Indonesian, German, French, Dutch, Spanish, Portuguese, Italian.

> ⚠️ **Status: under active construction** — core generation & stitching work; more features are being built continuously.

## 🛠 Quick Start

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # static export to out/ (Cloudflare Pages)
```

## 💡 How to Use

1. Open the site and click the **API Key** panel.
2. Get a free Agnes API key at [platform.agnes-ai.com](https://platform.agnes-ai.com) (no credit card required).
3. Paste the key — it is saved only in your browser's `localStorage` and never uploaded anywhere.
4. Enter your video idea → AI splits scenes → generate each scene → stitch & export in the browser.

## 🧱 Tech Stack

- Next.js 14 (App Router) + TypeScript + Tailwind CSS + next-intl
- `@ffmpeg/ffmpeg` (ffmpeg.wasm) — in-browser video stitching, loaded from CDN
- Cloudflare Pages — static export + `functions/` video-download CORS proxy

## 📦 Deploy

- Platform: Cloudflare Pages, build command `npm run build`, output directory `out/`.
- The `functions/` directory is automatically recognized by Cloudflare Pages as a Pages Function (video-download CORS proxy) — no extra config needed.
- User-provided API keys stay in the browser's `localStorage`; nothing is uploaded to any server.

## 📁 Project Structure

```
free-short-video-studio/
├── app/                    # Page shell (Hero/Footer/locale switcher)
├── components/             # Shell components (StudioLanding)
├── studio-core/            # Studio core (StudioClient + components/ + lib/ + types.ts)
│   └── messages/<locale>.json   # next-intl messages
└── functions/api/video-download/[[path]].ts   # Video-download CORS proxy
```

## 🔗 Related Projects

Both projects are **completely free**. Pick whichever fits your workflow:

| Project | Run Where | Features | Links |
|---------|-----------|----------|-------|
| **[FreeShortVideoStudio](https://github.com/lcy362/free-short-video-studio)** (this project) | Fully online, in the browser | Lightweight, zero install — **features under construction** | [Website](https://video.lichuanyang.top/en/studio) · [GitHub](https://github.com/lcy362/free-short-video-studio) |
| **[Agnes Video Generator](https://github.com/lcy362/agnes-video-generator)** | Download & run locally | **More powerful** — TTS narration, auto subtitles, digital anchor, image-to-video, keyframes, manuscript-to-video, checkpoint resume & more | [GitHub](https://github.com/lcy362/agnes-video-generator) |

## 📄 License

MIT
