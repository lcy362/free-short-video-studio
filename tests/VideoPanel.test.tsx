import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useMessages: () => ({
    demo: { image: { samplePrompts: ['i1'] }, video: { samplePrompts: ['v1'] } },
  }),
  useLocale: () => 'zh',
}));

const refInputSpy = vi.hoisted(() => vi.fn());
vi.mock('@/studio-core/components/RefImagesInput', () => ({
  default: (props: unknown) => {
    refInputSpy(props);
    return null;
  },
}));

import VideoPanel from '@/studio-core/components/VideoPanel';

type RefProps = {
  max: number;
  slotLabels?: string[];
  onAdd: (items: { dataUrl: string; name: string }[]) => void;
  onRemove: (index: number) => void;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function apiFetch(
  submit: (call: number) => Response,
  poll: (call: number) => Response = () => json({ status: 'pending', progress: 0 }),
) {
  let submits = 0;
  let polls = 0;
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input);
    if (url.includes('/v1/videos')) return Promise.resolve(submit(++submits));
    if (url.includes('/agnesapi')) return Promise.resolve(poll(++polls));
    return Promise.resolve(new Response(new Blob(['media']), { status: 200 }));
  });
}

function typePrompt(value: string) {
  fireEvent.change(screen.getByLabelText('promptLabel'), { target: { value } });
}

function generate() {
  fireEvent.click(screen.getByRole('button', { name: 'video.generate' }));
}

function submitBody(spy: ReturnType<typeof apiFetch>): Record<string, unknown> {
  const call = spy.mock.calls.find((c) => String(c[0]).includes('/v1/videos'));
  return JSON.parse(String(call?.[1]?.body));
}

function lastRefProps(): RefProps {
  const calls = refInputSpy.mock.calls;
  return calls[calls.length - 1][0] as RefProps;
}

async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  window.history.replaceState(null, '', '/');
  refInputSpy.mockClear();
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window.navigator, 'clipboard');
  window.history.replaceState(null, '', '/');
});

describe('VideoPanel · 表单', () => {
  it('初始渲染模型、模式、时长、比例与禁用的生成按钮', () => {
    render(<VideoPanel apiKey="sk-1" />);
    expect(screen.getByRole('button', { name: 'video.modelV25Flash' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'video.modeText' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '5s' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'landscape · 720P' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'video.generate' })).toBeDisabled();
    expect(screen.getByText('video.timeHint')).toBeInTheDocument();
  });

  it('点击示例提示词回填后生成按钮可用', () => {
    render(<VideoPanel apiKey="sk-1" />);
    fireEvent.click(screen.getByRole('button', { name: /v1/ }));
    expect(screen.getByLabelText('promptLabel')).toHaveValue('v1');
    expect(screen.getByRole('button', { name: 'video.generate' })).toBeEnabled();
  });

  it('切换到图生视频时出现参考图输入，未选图直接生成会报错', async () => {
    render(<VideoPanel apiKey="sk-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'video.modeImage' }));
    expect(refInputSpy).toHaveBeenCalled();
    typePrompt('一只猫');
    generate();
    await settle();
    expect(screen.getByText('video.refImageRequired')).toBeInTheDocument();
  });

  it('切换时长与比例后按新值提交', async () => {
    const spy = apiFetch(() => json({ video_id: 'vid-1' }));
    render(<VideoPanel apiKey="sk-1" />);
    fireEvent.click(screen.getByRole('button', { name: '8s' }));
    fireEvent.click(screen.getByRole('button', { name: 'portrait · 720P' }));
    typePrompt('竖屏视频');
    generate();
    await settle();
    expect(submitBody(spy)).toMatchObject({
      model: 'agnes-video-2.5-flash',
      mode: 'text',
      prompt: '竖屏视频',
      seconds: '8',
      size: '720P',
      aspect_ratio: '9:16',
    });
    expect(submitBody(spy)).not.toHaveProperty('width');
  });
});

describe('VideoPanel · 提交', () => {
  it('图生视频带参考图时使用 reference 协议并带上 images', async () => {
    const spy = apiFetch(() => json({ video_id: 'vid-1' }));
    render(<VideoPanel apiKey="sk-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'video.modeImage' }));
    typePrompt('一只猫');
    await act(async () => lastRefProps().onAdd([{ dataUrl: 'data:image/png;base64,REF', name: 'ref.png' }]));
    generate();
    await settle();

    expect(submitBody(spy)).toMatchObject({
      mode: 'reference',
      images: ['data:image/png;base64,REF'],
    });
  });

  it('提交成功后进入轮询，URL 带 video_id 与 model_name', async () => {
    const spy = apiFetch(
      () => json({ video_id: 'vid-1' }),
      () => json({ status: 'pending', progress: 25 }),
    );
    render(<VideoPanel apiKey="sk-1" />);
    typePrompt('海浪');
    generate();
    await settle();

    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('pending (25%)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'video.generate' })).not.toBeInTheDocument();
    const poll = spy.mock.calls.find((c) => String(c[0]).includes('/agnesapi'));
    expect(String(poll?.[0])).toContain('video_id=vid-1');
    expect(String(poll?.[0])).toContain('model_name=agnes-video-2.5-flash');
    expect((poll?.[1]?.headers as Record<string, string>).Authorization).toBe('Bearer sk-1');
  });

  it('支持 task_id / id 作为任务标识', async () => {
    apiFetch(() => json({ task_id: 'task-9' }));
    render(<VideoPanel apiKey="sk-1" />);
    typePrompt('测试');
    generate();
    await settle();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('401 与 429 分别给出 Key 无效和限流提示', async () => {
    apiFetch(() => json({ error: 'unauthorized' }, 401));
    const first = render(<VideoPanel apiKey="bad" />);
    typePrompt('测试');
    generate();
    await settle();
    expect(screen.getByText('errors.invalidApiKey')).toBeInTheDocument();
    expect(screen.getByText('errors.checkApiKey')).toBeInTheDocument();
    first.unmount();

    apiFetch(() => json({ error: 'slow down' }, 429));
    render(<VideoPanel apiKey="sk-1" />);
    typePrompt('测试');
    generate();
    await settle();
    expect(screen.getByText('errors.rateLimited')).toBeInTheDocument();
    expect(screen.queryByText('errors.checkApiKey')).not.toBeInTheDocument();
  });

  it('上游错误对象优先展示 message；字符串错误直接展示', async () => {
    apiFetch(() => json({ error: { code: 'bad', message: '上游拒绝' } }, 500));
    const first = render(<VideoPanel apiKey="sk-1" />);
    typePrompt('测试');
    generate();
    await settle();
    expect(screen.getByText('errors.upstream')).toBeInTheDocument();
    expect(screen.getByText('上游拒绝')).toBeInTheDocument();
    first.unmount();

    apiFetch(() => json({ error: 'quota exceeded' }, 500));
    render(<VideoPanel apiKey="sk-1" />);
    typePrompt('测试');
    generate();
    await settle();
    expect(screen.getByText('quota exceeded')).toBeInTheDocument();
  });

  it('上游错误为空时退回响应 JSON 片段', async () => {
    apiFetch(() => json({ detail: 'missing' }, 500));
    render(<VideoPanel apiKey="sk-1" />);
    typePrompt('测试');
    generate();
    await settle();
    expect(screen.getByText('{"detail":"missing"}')).toBeInTheDocument();
  });

  it('200 但没有任务 ID 时提示无结果', async () => {
    apiFetch(() => json({ data: {} }));
    render(<VideoPanel apiKey="sk-1" />);
    typePrompt('测试');
    generate();
    await settle();
    expect(screen.getByText('errors.noResult')).toBeInTheDocument();
  });

  it('主备域名都网络失败时提示网络错误', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('network'));
    render(<VideoPanel apiKey="sk-1" />);
    typePrompt('测试');
    generate();
    await settle();
    expect(screen.getByText('errors.network')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('503 免费队列满时自动重试，成功后继续轮询', async () => {
    let call = 0;
    const spy = apiFetch(
      () => (++call === 1 ? json({ error: { code: 'video_queue_full', message: 'full' } }, 503) : json({ video_id: 'vid-2' })),
    );
    render(<VideoPanel apiKey="sk-1" />);
    typePrompt('测试');
    generate();
    await settle();
    expect(screen.getByRole('button', { name: 'errors.queueFull' })).toBeInTheDocument();

    await settle(30_000);
    expect(spy.mock.calls.filter((c) => String(c[0]).includes('/v1/videos'))).toHaveLength(2);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('fail_to_fetch_task 同样触发队列重试', async () => {
    let call = 0;
    apiFetch(
      () => (++call === 1 ? json({ code: 'fail_to_fetch_task' }, 503) : json({ video_id: 'vid-3' })),
    );
    render(<VideoPanel apiKey="sk-1" />);
    typePrompt('测试');
    generate();
    await settle();
    await settle(30_000);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('重试次数耗尽后给出队列饱和提示', async () => {
    const spy = apiFetch(() => json({ error: { code: 'video_queue_full', message: 'full' } }, 503));
    render(<VideoPanel apiKey="sk-1" />);
    typePrompt('测试');
    generate();
    await settle();
    for (let i = 0; i < 5; i += 1) await settle(30_000);

    expect(screen.getByText('errors.queueFullExhausted')).toBeInTheDocument();
    expect(spy.mock.calls.filter((c) => String(c[0]).includes('/v1/videos'))).toHaveLength(6);
  });

  it('503 但错误码不属于队列饱和时不重试', async () => {
    const spy = apiFetch(() => json({ error: { code: 'other' } }, 503));
    render(<VideoPanel apiKey="sk-1" />);
    typePrompt('测试');
    generate();
    await settle();
    expect(screen.getByText('errors.upstream')).toBeInTheDocument();
    expect(spy.mock.calls.filter((c) => String(c[0]).includes('/v1/videos'))).toHaveLength(1);
  });
});

describe('VideoPanel · 轮询', () => {
  async function startGenerating(poll: (call: number) => Response) {
    apiFetch(() => json({ video_id: 'vid-1' }), poll);
    render(<VideoPanel apiKey="sk-1" />);
    typePrompt('测试');
    generate();
    await settle();
  }

  it('HTTP 错误会记录状态并在 30 秒后重试', async () => {
    let call = 0;
    await startGenerating(() =>
      ++call === 1 ? json({}, 500) : json({ status: 'completed', video_url: 'https://cdn.example/a.mp4' }),
    );
    expect(screen.getByText('HTTP 500 (retrying...)')).toBeInTheDocument();
    await settle(30_000);
    await settle();
    expect(document.querySelector('video')).toHaveAttribute('src', 'blob:mock');
  });

  it('completed 但缺少视频地址时记录字段并继续轮询', async () => {
    let call = 0;
    await startGenerating(() =>
      ++call === 1
        ? json({ status: 'completed', data: {} })
        : json({ status: 'completed', url: 'https://cdn.example/b.mp4' }),
    );
    expect(screen.getByText(/completed \(URL not found, fields:/)).toBeInTheDocument();
    await settle(30_000);
    await settle();
    expect(document.querySelector('video')).toBeInTheDocument();
  });

  it('failed 且 error 为对象时展示上游 message（W1 回归）', async () => {
    await startGenerating(() =>
      json({ status: 'failed', error: { code: 'moderation', message: '内容不合规' } }),
    );
    expect(screen.getByText('errors.videoFailed')).toBeInTheDocument();
    expect(screen.getByText('内容不合规')).toBeInTheDocument();
  });

  it('failed 且 error 为字符串时展示该字符串', async () => {
    await startGenerating(() => json({ status: 'failed', error: 'decode failed' }));
    expect(screen.getByText('decode failed')).toBeInTheDocument();
  });

  it('failed 且无 error 时只显示通用失败文案', async () => {
    await startGenerating(() => json({ status: 'failed' }));
    expect(screen.getByText('errors.videoFailed')).toBeInTheDocument();
    expect(screen.getByText('vid-1')).toBeInTheDocument();
  });

  it('轮询网络错误时记录状态并在 30 秒后重试', async () => {
    let call = 0;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/v1/videos')) return Promise.resolve(json({ video_id: 'vid-1' }));
      if (url.includes('/agnesapi')) {
        if (++call === 1) return Promise.reject(new TypeError('network'));
        // fetchWithFailback 只在网络错误时切备用域名，两次都失败才会抛
        return Promise.reject(new TypeError('network'));
      }
      return Promise.resolve(new Response(new Blob(['media']), { status: 200 }));
    });
    render(<VideoPanel apiKey="sk-1" />);
    typePrompt('测试');
    generate();
    await settle();
    expect(screen.getByText('network error (retrying...)')).toBeInTheDocument();
    expect(spy.mock.calls.length).toBeGreaterThan(1);
  });

  it('失败面板保留 video_id：可复制、可稍后回查、可重试', async () => {
    await startGenerating(() => json({ status: 'failed', error: 'oops' }));
    expect(screen.getByText('errors.checkLater')).toHaveAttribute('href', '?video_id=vid-1');

    const writeText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'errors.copyVideoId' }));
    });
    expect(writeText).toHaveBeenCalledWith('vid-1');
    await settle();
    expect(screen.getByRole('button', { name: 'copied' })).toBeInTheDocument();
    await settle(2000);
    expect(screen.getByRole('button', { name: 'errors.copyVideoId' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(screen.queryByText('errors.videoFailed')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'video.generate' })).toBeInTheDocument();
  });

  it('剪贴板不可用时静默忽略', async () => {
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    await startGenerating(() => json({ status: 'failed', error: 'oops' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'errors.copyVideoId' }));
    });
    expect(screen.getByRole('button', { name: 'errors.copyVideoId' })).toBeInTheDocument();
  });

  it('?video_id= 可在挂载时恢复轮询', async () => {
    window.history.replaceState(null, '', '/?video_id=resume-1');
    const spy = apiFetch(
      () => json({ video_id: 'unused' }),
      () => json({ status: 'completed', video_url: 'https://cdn.example/c.mp4' }),
    );
    render(<VideoPanel apiKey="sk-1" />);
    await settle();
    await settle();
    const poll = spy.mock.calls.find((c) => String(c[0]).includes('/agnesapi'));
    expect(String(poll?.[0])).toContain('video_id=resume-1');
    expect(document.querySelector('video')).toBeInTheDocument();
  });

  it('没有 API Key 时不恢复轮询', async () => {
    window.history.replaceState(null, '', '/?video_id=resume-1');
    const spy = apiFetch(() => json({ status: 'completed' }));
    render(<VideoPanel apiKey="" />);
    await settle();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('VideoPanel · 超时终查', () => {
  async function reachTimeout(
    final: (call: number) => Response,
    initial: (call: number) => Response = () => json({ status: 'pending', progress: 0 }),
  ) {
    apiFetch(() => json({ video_id: 'vid-timeout' }), (call) =>
      call === 1 ? initial(call) : final(call),
    );
    render(<VideoPanel apiKey="sk-1" />);
    typePrompt('测试');
    generate();
    await settle();
    vi.setSystemTime(Date.now() + 900_001);
    await settle(30_000);
    await settle();
  }

  it('终查命中 completed 且拿到 URL 时仍然出片', async () => {
    await reachTimeout(() => json({ status: 'completed', video_url: 'https://cdn.example/d.mp4' }));
    expect(document.querySelector('video')).toBeInTheDocument();
  });

  it('终查命中 failed 时展示上游真实原因', async () => {
    await reachTimeout(() => json({ status: 'failed', error: { message: '最终失败' } }));
    expect(screen.getByText('errors.upstreamStuck')).toBeInTheDocument();
    expect(screen.getByText('最终失败')).toBeInTheDocument();
  });

  it('进度一直为 0 时判定为上游仍在排队', async () => {
    await reachTimeout(() => json({ status: 'pending' }));
    expect(screen.getByText('errors.pollTimeoutQueued')).toBeInTheDocument();
  });

  it('已有渲染进度时判定为渲染超时', async () => {
    await reachTimeout(
      () => json({ status: 'pending' }),
      () => json({ status: 'rendering', progress: 60 }),
    );
    expect(screen.getByText('errors.pollTimeoutRendering')).toBeInTheDocument();
    expect(screen.getByText('errors.pollTimeout')).toBeInTheDocument();
  });
});

describe('VideoPanel · 首尾帧 / 参考音频（对齐 2.5 接口能力）', () => {
  it('首尾帧模式按 keyframe 协议提交 first_frame / last_frame', async () => {
    const spy = apiFetch(() => json({ video_id: 'vid-1' }));
    render(<VideoPanel apiKey="sk-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'video.modeKeyframe' }));
    typePrompt('首尾帧');
    await act(async () => lastRefProps().onAdd([
      { dataUrl: 'data:image/png;base64,F', name: 'f.png' },
      { dataUrl: 'data:image/png;base64,L', name: 'l.png' },
    ]));
    generate();
    await settle();

    expect(submitBody(spy)).toMatchObject({
      mode: 'keyframe',
      first_frame: 'data:image/png;base64,F',
      last_frame: 'data:image/png;base64,L',
    });
    expect(submitBody(spy)).not.toHaveProperty('images');
  });

  it('首尾帧模式未上传首帧时直接报错', async () => {
    render(<VideoPanel apiKey="sk-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'video.modeKeyframe' }));
    typePrompt('首尾帧');
    generate();
    await settle();
    expect(screen.getByText('video.keyframeRequired')).toBeInTheDocument();
  });

  it('合法参考音频写入 audios 字段', async () => {
    const spy = apiFetch(() => json({ video_id: 'vid-1' }));
    render(<VideoPanel apiKey="sk-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'video.modeImage' }));
    await act(async () => lastRefProps().onAdd([{ dataUrl: 'data:image/png;base64,REF', name: 'ref.png' }]));
    fireEvent.change(screen.getByLabelText('video.audioUrls 1'), {
      target: { value: 'https://cdn.example.com/a.mp3' },
    });
    typePrompt('音频');
    generate();
    await settle();

    expect(submitBody(spy)).toMatchObject({
      mode: 'reference',
      images: ['data:image/png;base64,REF'],
      audios: ['https://cdn.example.com/a.mp3'],
    });
  });

  it('非法参考音频链接即时拦截，不发起请求', async () => {
    const spy = apiFetch(() => json({ video_id: 'vid-1' }));
    render(<VideoPanel apiKey="sk-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'video.modeImage' }));
    await act(async () => lastRefProps().onAdd([{ dataUrl: 'data:image/png;base64,REF', name: 'ref.png' }]));
    fireEvent.change(screen.getByLabelText('video.audioUrls 1'), {
      target: { value: 'ftp://bad.example.com/a.mp3' },
    });
    typePrompt('音频');
    generate();
    await settle();

    expect(screen.getByText('video.audioUrlInvalid')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('VideoPanel · 快速重试模式', () => {
  it('未开自动时连续 2 次忙信号后出现一次性开启按钮', async () => {
    localStorage.clear();
    apiFetch(() => json({ error: { code: 'video_queue_full' } }, 503));
    render(<VideoPanel apiKey="sk-1" />);
    typePrompt('队列满');
    generate();
    await settle();
    await settle(30000);

    expect(screen.getByRole('button', { name: 'video.fastRetryStart' })).toBeInTheDocument();
  });

  it('已开自动时连续 2 次忙信号自动连打（间隔 = 60s / x）', async () => {
    localStorage.setItem('agnes_fast_retry', JSON.stringify({ auto: true, perMinute: 60, minutes: 1 }));
    const spy = apiFetch((n) =>
      (n < 3 ? json({ error: { code: 'video_queue_full' } }, 503) : json({ video_id: 'vid-1' })),
    );
    render(<VideoPanel apiKey="sk-1" />);
    typePrompt('队列满');
    generate();
    await settle();
    await settle(30000);
    await settle(1000);

    const submits = spy.mock.calls.filter((c) => String(c[0]).includes('/v1/videos'));
    expect(submits).toHaveLength(3);
  });
});
