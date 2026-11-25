# 🎬 FreeShortVideoStudio — 免费 AI 短视频生成器（纯网页版）

[![English](https://img.shields.io/badge/EN-English-blue)](/README.md)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Website](https://img.shields.io/badge/website-video.lichuanyang.top-8A2BE2)](https://video.lichuanyang.top/studio)
[![下载版](https://img.shields.io/badge/下载版-自托管完整版-orange)](https://github.com/lcy362/agnes-video-generator)

> **完全在线、完全免费的 AI 短视频生成器** —— 无需安装、无需显卡、无需信用卡。输入一个创意，AI 自动拆分为 2-5 个场景、逐段文生视频，并在浏览器内拼接成完整短视频。

> 🔗 **本项目是 [Agnes Video Generator](https://github.com/lcy362/agnes-video-generator) 的网页版。** 想要自托管的完整版？**[直接下载完整版 →](https://github.com/lcy362/agnes-video-generator)** —— 一条命令即可安装（`npx free-short-video` / Docker / `start.sh`），装完是图形界面，不需要命令行经验。

## 🚀 立即体验 — 免安装

**▶ [video.lichuanyang.top/studio](https://video.lichuanyang.top/studio)**

> 填入免费 [Agnes AI](https://platform.agnes-ai.com) API Key（仅保存在浏览器 localStorage，不会上传任何服务器）即可零成本开始创作 AI 视频。

## 🔗 Agnes Video Generator 的两种独立方式

**本项目是网页版，[Agnes Video Generator](https://github.com/lcy362/agnes-video-generator) 是可下载的自托管完整版。** 两种方式都已正式上线、均完全免费，是并列选择，不是「体验版 → 完整版」的升级阶梯。下方的 Agent 技能是补充渠道，不是官网第三个并列入口。

| 方式 | 运行方式 | 你实际要做什么 | 链接 |
|------|---------|--------------|------|
| **① 网页版**（在线创作台，本项目） | 完全在线、浏览器内运行 | **零安装、无需注册、零配置**——打开页面就能出片，已正式上线 | **[在线使用](https://video.lichuanyang.top/studio)** · [GitHub](https://github.com/lcy362/free-short-video-studio) |
| **② 下载版**（源产品 · 自托管完整版） | 部署在自己的机器上 | 自托管，但**一条命令即可安装**（`npx free-short-video` / Docker / `start.sh`），之后是图形界面操作，不需要强动手能力或命令行经验 | **[Agnes Video Generator](https://github.com/lcy362/agnes-video-generator)** |
| **③ `agnes-video` Agent 技能**（补充渠道） | 交给 AI 编程 Agent 运行 | 装一个技能、描述想要的结果，Agent 跑完**全流程**（装服务 / 生成 / 交付 / 排障） | **[技能库仓库](https://github.com/lcy362/agnes-video-generator-skills)** |

## ✨ 功能特性

- **纯浏览器运行** —— 视频拼接用 ffmpeg.wasm，API Key 只存 localStorage，无需任何后端生成服务。
- **创意 → 场景 → 成片** —— AI 把你的创意拆成 2-5 个场景，逐段生成后再拼接成片，可带音频。
- **多场景编辑** —— 编辑场景提示词、单独重新生成某个场景、渲染前调整场景顺序。
- **13 种语言** —— 中文、英文、俄文、日文、韩文、马来文、印尼文、德文、法文、荷兰文、西班牙文、葡萄牙文、意大利文。

> ✅ **状态：已正式上线，可直接使用** —— 在线创作台是成品，不是 Beta 也不是在建项目。打开浏览器、填入免费 API Key 即可导出 MP4：零安装、无需注册、零配置。它是 [Agnes Video Generator](https://github.com/lcy362/agnes-video-generator) 的**网页版**，两种独立方式之一（见上方方式对比表）。

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

## 📄 License

MIT
