# 🎬 FreeShortVideoStudio — 免费 AI 短视频生成器（纯网页版）

[![English](https://img.shields.io/badge/EN-English-blue)](/README.md)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Website](https://img.shields.io/badge/website-video.lichuanyang.top-8A2BE2)](https://video.lichuanyang.top/zh/studio)

> **完全在线、完全免费的 AI 短视频生成器** —— 无需安装、无需显卡、无需信用卡。输入一个创意，AI 自动拆分为 2-5 个场景、逐段文生视频，并在浏览器内拼接成完整短视频。

## 🚀 立即体验 — 免安装

**▶ [video.lichuanyang.top/zh/studio](https://video.lichuanyang.top/zh/studio)**

> 填入免费 [Agnes AI](https://platform.agnes-ai.com) API Key（仅保存在浏览器 localStorage，不会上传任何服务器）即可零成本开始创作 AI 视频。

## ✨ 功能特性

- **纯浏览器运行** —— 视频拼接用 ffmpeg.wasm，API Key 只存 localStorage，无需任何后端生成服务。
- **创意 → 场景 → 成片** —— AI 把你的创意拆成 2-5 个场景，逐段生成后再拼接成片，可带音频。
- **多场景编辑** —— 编辑场景提示词、单独重新生成某个场景、渲染前调整场景顺序。
- **13 种语言** —— 中文、英文、俄文、日文、韩文、马来文、印尼文、德文、法文、荷兰文、西班牙文、葡萄牙文、意大利文。

> ⚠️ **状态：功能建设中** —— 核心生成与拼接已可用，更多功能正在持续开发。

## 🛠 本地开发

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # 静态导出到 out/（Cloudflare Pages）
```

## 💡 使用方式

1. 打开站点，点击「API Key」面板。
2. 到 [platform.agnes-ai.com](https://platform.agnes-ai.com) 获取免费 Agnes API Key（无需信用卡）。
3. 粘贴 Key —— 仅保存在浏览器 localStorage，不会上传任何服务器。
4. 输入视频创意 → AI 拆分场景 → 逐段生成 → 浏览器内拼接导出。

## 🧱 技术栈

- Next.js 14 (App Router) + TypeScript + Tailwind CSS + next-intl
- `@ffmpeg/ffmpeg`：浏览器内拼接视频（ffmpeg.wasm，从 CDN 加载）
- Cloudflare Pages：静态导出 + `functions/` 视频下载 CORS 代理

## 📦 部署

- 平台：Cloudflare Pages，构建命令 `npm run build`，输出目录 `out/`。
- `functions/` 目录由 Cloudflare Pages 自动识别为 Pages Function（视频下载 CORS 代理），无需额外配置。
- 用户填入的 API Key 只存浏览器 localStorage，不上传任何服务器。

## 📁 目录结构

```
free-short-video-studio/
├── app/                    # 页面外壳（Hero/Footer/语言切换）
├── components/             # 外壳组件（StudioLanding）
├── studio-core/            # Studio 核心（StudioClient + components/ + lib/ + types.ts）
│   └── messages/<locale>.json   # next-intl 文案
└── functions/api/video-download/[[path]].ts   # 视频下载 CORS 代理
```

## 🔗 关联项目

两个项目**均完全免费**，按需选择：

| 项目 | 运行方式 | 功能定位 | 链接 |
|------|---------|---------|------|
| **[FreeShortVideoStudio](https://github.com/lcy362/free-short-video-studio)**（本项目） | 完全在线、浏览器内运行 | 轻量免安装，**功能建设中** | [在线体验](https://video.lichuanyang.top/zh/studio) · [GitHub](https://github.com/lcy362/free-short-video-studio) |
| **[Agnes Video Generator](https://github.com/lcy362/agnes-video-generator)** | 下载后本地运行 | **功能更强大** —— TTS 配音、自动字幕、数字人、图生视频、关键帧动画、文章成片、断点续传等 | [GitHub](https://github.com/lcy362/agnes-video-generator) |

## 📄 License

MIT
