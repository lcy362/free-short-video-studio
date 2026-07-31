# FreeShortVideoStudio

AI 免费在线生成短视频 / Free AI Short Video Generator。

输入一个创意，AI 自动拆分为 2-5 个场景、逐段文生视频并在浏览器内拼接成完整短视频。
完全免费、纯网页运行：无需安装、无需 GPU、无需信用卡，填入免费 Agnes API Key 即可使用。

## 快速开始

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # 静态导出到 out/（Cloudflare Pages）
```

## 使用方式

1. 打开站点，点击「API Key」面板
2. 到 [platform.agnes-ai.com](https://platform.agnes-ai.com) 获取免费 Agnes API Key（无需信用卡）
3. 粘贴 Key（仅保存在浏览器 localStorage，不会上传任何服务器）
4. 输入视频创意 → AI 拆分场景 → 逐段生成视频 → 浏览器内拼接导出

## 技术栈

- Next.js 14 (App Router) + TypeScript + Tailwind CSS + next-intl
- `@ffmpeg/ffmpeg`：浏览器内拼接视频（ffmpeg.wasm，从 CDN 加载）
- Cloudflare Pages：静态导出 + `functions/` 视频下载 CORS 代理

## 部署

- 平台：Cloudflare Pages，构建命令 `npm run build`，输出目录 `out/`
- `functions/` 目录由 Cloudflare Pages 自动识别为 Pages Function（视频下载 CORS 代理），无需额外配置
- 用户填入的 API Key 只存浏览器 localStorage，不上传任何服务器

## 目录结构

```
free-short-video-studio/
├── app/                    # 页面外壳（Hero/Footer/语言切换）
├── components/             # 外壳组件（StudioLanding）
├── studio-core/            # Studio 核心（StudioClient + components/ + lib/ + types.ts）
│   └── messages/<locale>.json   # next-intl 文案
└── functions/api/video-download/[[path]].ts   # 视频下载 CORS 代理
```

## License

MIT
