/**
 * 从 URL 的 `?prompt=` 读取预填提示词。
 *
 * 用途：首页「Try it free」输入框、Showcase 详情页的「在 Demo 中试用」按钮，
 * 都把提示词原文带进 /demo?tab=simple&prompt=...，用户进入工作台即可直接生成。
 *
 * 必须在 useEffect 里调用（不能放进 useState 初始值）：静态导出下服务端渲染时
 * 没有 window，若客户端首帧就带值会造成 hydration 不一致。
 */
export function readPrefillPrompt(maxLength = 4000): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = new URLSearchParams(window.location.search).get('prompt');
    return raw ? raw.slice(0, maxLength) : '';
  } catch {
    return '';
  }
}
