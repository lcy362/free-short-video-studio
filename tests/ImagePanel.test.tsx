import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useMessages: () => ({ demo: { image: { samplePrompts: ['示例提示词'] } } }),
  useLocale: () => 'zh',
}));

import ImagePanel from '@/studio-core/components/ImagePanel';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function typePrompt(value: string) {
  fireEvent.change(screen.getByLabelText('promptLabel'), { target: { value } });
}

function generate() {
  return userEvent.click(screen.getByRole('button', { name: 'image.generate' }));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ImagePanel · 表单', () => {
  it('初始渲染提示词框、三档尺寸与禁用的生成按钮', () => {
    render(<ImagePanel apiKey="sk-1" />);
    expect(screen.getByLabelText('promptLabel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'square' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'landscape' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'portrait' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'image.generate' })).toBeDisabled();
  });

  it('未填 API Key 时即使有提示词也禁用生成，且不发请求', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ data: [] }));
    render(<ImagePanel apiKey="" />);
    typePrompt('一只柴犬');
    await userEvent.click(screen.getByRole('button', { name: 'image.generate' }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('ImagePanel · 生成请求', () => {
  it('成功时按 2.1-flash 协议提交并展示图片，可重新生成', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(json({ data: [{ url: 'https://cdn.example/a.png' }] }));

    render(<ImagePanel apiKey="sk-1" />);
    typePrompt('一只柴犬');
    await generate();

    await waitFor(() =>
      expect(screen.getByAltText('Generated')).toHaveAttribute('src', 'https://cdn.example/a.png'),
    );
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain('/v1/images/generations');
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'agnes-image-2.1-flash',
      prompt: '一只柴犬',
      size: '1024x1024',
      n: 1,
    });
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-1');

    await userEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(screen.getByRole('button', { name: 'image.generate' })).toBeInTheDocument();
    expect(screen.queryByAltText('Generated')).not.toBeInTheDocument();
  });

  it('切换尺寸后请求体带上新尺寸', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(json({ data: [{ url: 'https://cdn.example/b.png' }] }));

    render(<ImagePanel apiKey="sk-1" />);
    typePrompt('雨夜街道');
    await userEvent.click(screen.getByRole('button', { name: 'landscape' }));
    await generate();

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)).size).toBe('1152x768');
  });

  it('点击示例提示词可回填', async () => {
    render(<ImagePanel apiKey="sk-1" />);
    await userEvent.click(screen.getByRole('button', { name: /示例提示词/ }));
    expect(screen.getByLabelText('promptLabel')).toHaveValue('示例提示词');
  });
});

describe('ImagePanel · 错误分支', () => {
  it('401 显示 Key 无效提示与检查 Key 的补充文案', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: 'unauthorized' }, 401));
    render(<ImagePanel apiKey="bad" />);
    typePrompt('测试');
    await generate();
    await waitFor(() => expect(screen.getByText('errors.invalidApiKey')).toBeInTheDocument());
    expect(screen.getByText('errors.checkApiKey')).toBeInTheDocument();
  });

  it('429 显示限流提示，且不显示 Key 补充文案', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: 'slow down' }, 429));
    render(<ImagePanel apiKey="sk-1" />);
    typePrompt('测试');
    await generate();
    await waitFor(() => expect(screen.getByText('errors.rateLimited')).toBeInTheDocument());
    expect(screen.queryByText('errors.checkApiKey')).not.toBeInTheDocument();
  });

  it('上游 HTTP 错误优先展示 error.message 详情', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ error: { code: 'upstream', message: '上游炸了' } }, 500),
    );
    render(<ImagePanel apiKey="sk-1" />);
    typePrompt('测试');
    await generate();
    await waitFor(() => expect(screen.getByText('errors.upstream')).toBeInTheDocument());
    expect(screen.getByText('上游炸了')).toBeInTheDocument();
  });

  it('error 为字符串时直接展示该字符串', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: 'quota exceeded' }, 502));
    render(<ImagePanel apiKey="sk-1" />);
    typePrompt('测试');
    await generate();
    await waitFor(() => expect(screen.getByText('quota exceeded')).toBeInTheDocument());
  });

  it('error 为空时退回整个响应的 JSON 片段', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ detail: 'no quota' }, 503));
    render(<ImagePanel apiKey="sk-1" />);
    typePrompt('测试');
    await generate();
    await waitFor(() => expect(screen.getByText('{"detail":"no quota"}')).toBeInTheDocument());
  });

  it('200 但缺少图片地址时提示无结果', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ data: [] }));
    render(<ImagePanel apiKey="sk-1" />);
    typePrompt('测试');
    await generate();
    await waitFor(() => expect(screen.getByText('errors.noResult')).toBeInTheDocument());
  });

  it('主备域名都网络失败时提示网络错误', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('network'));
    render(<ImagePanel apiKey="sk-1" />);
    typePrompt('测试');
    await generate();
    await waitFor(() => expect(screen.getByText('errors.network')).toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('错误面板点击重试后清空错误并回到表单', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ data: [] }));
    render(<ImagePanel apiKey="sk-1" />);
    typePrompt('测试');
    await generate();
    await waitFor(() => expect(screen.getByText('errors.noResult')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(screen.queryByText('errors.noResult')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'image.generate' })).toBeInTheDocument();
  });
});
