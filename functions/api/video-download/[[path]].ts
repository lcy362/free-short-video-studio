// Cloudflare Pages Function：视频下载代理
// 解决 Agnes 视频产出域名（platform-outputs.agnes-ai.space）不返回 CORS 头的问题。
// 前端调用 /api/video-download?url=<远端视频URL>，本函数服务端 fetch 后流式返回，
// 并附带 CORS 头，使前端能正常读取 blob。
//
// 部署：Cloudflare Pages 自动识别 functions/ 目录，无需额外配置。
// 本文件由 Cloudflare 边缘运行时编译执行，不经过 Next.js 构建。

// 内联类型定义（避免引入 @cloudflare/workers-types）
type PageContext = { request: Request; env: Record<string, unknown> };
type PageHandler = (ctx: PageContext) => Promise<Response> | Response;

const ALLOWED_HOSTS = [
  'platform-outputs.agnes-ai.space',
  'platform-outputs.agnes-ai.com',
];

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

export const onRequestGet: PageHandler = async (context) => {
  const { request } = context;
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid url' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return new Response(JSON.stringify({ error: 'Host not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const resp = await fetch(targetUrl, {
      headers: { 'User-Agent': 'free-short-video-studio/1.0' },
    });

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `Upstream ${resp.status}` }), {
        status: resp.status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    const headers = new Headers(CORS_HEADERS);
    headers.set('Cache-Control', 'public, max-age=86400');
    const contentType = resp.headers.get('Content-Type');
    if (contentType) headers.set('Content-Type', contentType);
    const contentLength = resp.headers.get('Content-Length');
    if (contentLength) headers.set('Content-Length', contentLength);

    return new Response(resp.body, { status: 200, headers });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Fetch failed', detail: (e as Error).message }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      },
    );
  }
};

export const onRequestOptions: PageHandler = async () => {
  return new Response(null, {
    status: 204,
    headers: { ...CORS_HEADERS, 'Access-Control-Max-Age': '86400' },
  });
};
