import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import MediaPreview from '@/studio-core/components/MediaPreview';

function blobResponse(data = 'fake-binary'): Response {
  return new Response(new Blob([data], { type: 'application/octet-stream' }), { status: 200 });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('MediaPreview · 图片', () => {
  it('渲染图片、下载按钮；无 regenerate / 无方向提示', () => {
    render(<MediaPreview type="image" url="https://cdn.example/a.png" />);
    expect(screen.getByAltText('Generated')).toHaveAttribute('src', 'https://cdn.example/a.png');
    expect(screen.getByRole('button', { name: 'download' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'retry' })).not.toBeInTheDocument();
    expect(screen.queryByText('video.portraitRotationHint')).not.toBeInTheDocument();
    expect(screen.queryByText('video.notSupported')).not.toBeInTheDocument();
  });

  it('传入 onRegenerate / orientationHint 时都渲染', async () => {
    const onRegenerate = vi.fn();
    render(
      <MediaPreview
        type="image"
        url="https://cdn.example/a.png"
        onRegenerate={onRegenerate}
        orientationHint
      />,
    );
    expect(screen.getByText('video.portraitRotationHint')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(onRegenerate).toHaveBeenCalledOnce();
  });

  it('下载成功：带 Authorization、生成 a 标签、释放 blob URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(blobResponse());
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    render(<MediaPreview type="image" url="https://cdn.example/a.png" apiKey="sk-1" />);
    await userEvent.click(screen.getByRole('button', { name: 'download' }));

    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    expect(fetchSpy).toHaveBeenCalledWith('https://cdn.example/a.png', {
      headers: { Authorization: 'Bearer sk-1' },
    });
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeSpy).toHaveBeenCalledWith('blob:download');
    await waitFor(() => expect(screen.getByRole('button', { name: 'download' })).toBeEnabled());
  });

  it('下载失败：回退到 window.open，按钮恢复可用', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<MediaPreview type="image" url="https://cdn.example/a.png" />);
    await userEvent.click(screen.getByRole('button', { name: 'download' }));

    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://cdn.example/a.png', '_blank'));
    expect(screen.getByRole('button', { name: 'download' })).toBeEnabled();
  });

  it('上游 HTTP 非 2xx 也走 window.open 回退', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 403 }));
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<MediaPreview type="image" url="https://cdn.example/a.png" />);
    await userEvent.click(screen.getByRole('button', { name: 'download' }));
    await waitFor(() => expect(openSpy).toHaveBeenCalled());
  });

  it('下载中按钮切换到 downloading 文案并禁用', async () => {
    let resolveFetch: ((r: Response) => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    );
    render(<MediaPreview type="image" url="https://cdn.example/a.png" />);
    await userEvent.click(screen.getByRole('button', { name: 'download' }));
    expect(screen.getByRole('button', { name: 'downloading' })).toBeDisabled();
    resolveFetch?.(blobResponse());
    await waitFor(() => expect(screen.getByRole('button', { name: 'download' })).toBeEnabled());
  });
});

describe('MediaPreview · 视频', () => {
  it('挂载后拉取视频（带 Bearer）并生成 blob 播放地址', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(blobResponse('video'));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:video');

    render(<MediaPreview type="video" url="https://cdn.example/a.mp4" apiKey="sk-2" />);

    await waitFor(() => expect(document.querySelector('video')).toHaveAttribute('src', 'blob:video'));
    expect(fetchSpy).toHaveBeenCalledWith('https://cdn.example/a.mp4', {
      headers: { Authorization: 'Bearer sk-2' },
    });
    expect(screen.getByText('video.notSupported')).toBeInTheDocument();
  });

  it('拉取失败时退回原始 URL 播放', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    render(<MediaPreview type="video" url="https://cdn.example/a.mp4" />);
    await waitFor(() => expect(document.querySelector('video')).toHaveAttribute('src', 'https://cdn.example/a.mp4'));
  });

  it('HTTP 非 2xx 时同样退回原始 URL', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
    render(<MediaPreview type="video" url="https://cdn.example/a.mp4" />);
    await waitFor(() => expect(document.querySelector('video')).toHaveAttribute('src', 'https://cdn.example/a.mp4'));
  });

  it('未拿到播放地址时先显示加载中，方向提示与重新生成按钮可用', async () => {
    let resolveFetch: ((r: Response) => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    );
    const onRegenerate = vi.fn();
    render(
      <MediaPreview type="video" url="https://cdn.example/a.mp4" onRegenerate={onRegenerate} orientationHint />,
    );
    expect(document.querySelector('video')).toBeNull();
    expect(screen.getByText('video.portraitRotationHint')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(onRegenerate).toHaveBeenCalledOnce();
    resolveFetch?.(blobResponse());
  });

  it('卸载时释放 blob 播放地址', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(blobResponse('video'));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:video-cleanup');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const { unmount } = render(<MediaPreview type="video" url="https://cdn.example/a.mp4" />);
    await waitFor(() => expect(document.querySelector('video')).toHaveAttribute('src', 'blob:video-cleanup'));
    unmount();
    expect(revokeSpy).toHaveBeenCalledWith('blob:video-cleanup');
  });

  it('url 为空时不发起视频请求', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<MediaPreview type="video" url="" />);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.querySelector('video')).toBeNull();
  });
});
