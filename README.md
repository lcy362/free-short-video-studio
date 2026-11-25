# 🎬 FreeShortVideoStudio — Free AI Short Video Generator (In-Browser)

[![中文](https://img.shields.io/badge/CN-中文-red)](/README_ZH.md)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Website](https://img.shields.io/badge/website-video.lichuanyang.top-8A2BE2)](https://video.lichuanyang.top/studio)
[![Downloadable Version](https://img.shields.io/badge/downloadable-agnes--video--generator-orange)](https://github.com/lcy362/agnes-video-generator)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=lcy362_free-short-video-studio&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=lcy362_free-short-video-studio)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=lcy362_free-short-video-studio&metric=coverage)](https://sonarcloud.io/summary/new_code?id=lcy362_free-short-video-studio)
[![Reliability](https://sonarcloud.io/api/project_badges/measure?project=lcy362_free-short-video-studio&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=lcy362_free-short-video-studio)
[![Security](https://sonarcloud.io/api/project_badges/measure?project=lcy362_free-short-video-studio&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=lcy362_free-short-video-studio)
[![Maintainability](https://sonarcloud.io/api/project_badges/measure?project=lcy362_free-short-video-studio&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=lcy362_free-short-video-studio)

> **Fully online, completely free AI short video generator** — no install, no GPU, no credit card. Type in an idea, AI automatically splits it into 2-5 scenes, generates each scene with text-to-video, and stitches them into a complete short video right in your browser.

> 🔗 **This is the Web Version of [Agnes Video Generator](https://github.com/lcy362/agnes-video-generator).** Want the full self-hosted app instead? **[Grab the downloadable version →](https://github.com/lcy362/agnes-video-generator)** — one command to install (`npx free-short-video`, Docker or `start.sh`), then a full Web UI, no command-line skills needed.

## 🚀 Try It Now — No Install Needed

**▶ [video.lichuanyang.top/studio](https://video.lichuanyang.top/studio)**

> Just paste a free [Agnes AI](https://platform.agnes-ai.com) API key (stored in your browser's localStorage, never uploaded to any server) and start creating AI videos at zero cost.

## 🔗 Two Independent Editions of Agnes Video Generator

**This project is the Web Version; [Agnes Video Generator](https://github.com/lcy362/agnes-video-generator) is the downloadable, self-hosted full app.** Both editions are production-ready and completely free — pick whichever fits your workflow; they are alternatives, not an upgrade path. The agent skill below is a supplementary channel, not a third button on the site.

| Way | Run Where | What you need to do | Links |
|-----|-----------|---------------------|-------|
| **① Web Version** (browser workspace, this project) | Fully online, in the browser | **No install, no signup, no setup** — open the page and generate. This is the finished public product | **[Website](https://video.lichuanyang.top/studio)** · [GitHub](https://github.com/lcy362/free-short-video-studio) |
| **② Downloadable Version** (self-hosted full app) | On your own machine | Self-hosted, but **one-command install** (`npx free-short-video`, Docker or `start.sh`) and then a Web UI — no technical background or command-line experience needed | **[Agnes Video Generator](https://github.com/lcy362/agnes-video-generator)** |
| **③ `agnes-video` agent skill** (supplementary channel) | Driven by an AI coding agent | Install one skill, describe the outcome — the agent runs the **entire pipeline** (install, generate, deliver, diagnose) | **[Skill repository](https://github.com/lcy362/agnes-video-generator-skills)** |

## ✨ Features

- **Fully in-browser** — everything runs on your device: FFmpeg.js wasm stitching, localStorage-only API key, no backend server for video generation.
- **Creative → Scenes → Video** — AI splits your idea into 2-5 scenes, generates each scene, then stitches the final video with optional audio.
- **Multi-scene editing** — edit scene prompts, re-generate individual scenes, swap scene order before rendering.
- **13 languages** — Chinese, English, Russian, Japanese, Korean, Malay, Indonesian, German, French, Dutch, Spanish, Portuguese, Italian.

> ✅ **Status: production-ready and publicly available** — the online creator is a finished product, not a beta or a work in progress. Open it in a browser, paste a free API key and export an MP4: no install, no signup, no setup. It is the **Web Version**, one of the two independent editions of [Agnes Video Generator](https://github.com/lcy362/agnes-video-generator) (see the editions table above).

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

## 📄 License

MIT
