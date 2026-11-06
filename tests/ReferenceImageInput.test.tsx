import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import ReferenceImageInput, {
  fileToResizedDataUrl,
} from '@/studio-core/components/ReferenceImageInput';

const RAW = 'data:image/png;base64,AAA';
const RESIZED = 'data:image/png;base64,RESIZED';

let imageSize = { width: 800, height: 600 };
let imageFails = false;
let readerResults: Array<'ok' | 'error'> = ['ok'];
let readerCalls = 0;

class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 0;
  height = 0;
  private _src = '';

  set src(v: string) {
    this._src = v;
    this.width = imageSize.width;
    this.height = imageSize.height;
    Promise.resolve().then(() => (imageFails ? this.onerror?.() : this.onload?.()));
  }

  get src() {
    return this._src;
  }
}

class MockFileReader {
  result: string | null = null;
  error: unknown = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  readAsDataURL(_file: File) {
    const behavior = readerResults[Math.min(readerCalls++, readerResults.length - 1)];
    Promise.resolve().then(() => {
      if (behavior === 'error') {
        this.error = new Error('read failed');
        this.onerror?.();
      } else {
        this.result = RAW;
        this.onload?.();
      }
    });
  }
}

function pngFile(name = 'photo.png'): File {
  return new File(['pixels'], name, { type: 'image/png' });
}

function mockCanvas(ctx: unknown = { drawImage: vi.fn() }) {
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(ctx as CanvasRenderingContext2D);
  const toDataURL = vi
    .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
    .mockReturnValue(RESIZED);
  return { getContext, toDataURL };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('Image', MockImage);
  vi.stubGlobal('FileReader', MockFileReader);
  imageSize = { width: 800, height: 600 };
  imageFails = false;
  readerResults = ['ok'];
  readerCalls = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fileToResizedDataUrl', () => {
  it('长边未超过上限时原样返回 dataURL，不创建 canvas', async () => {
    const { getContext } = mockCanvas();
    await expect(fileToResizedDataUrl(pngFile())).resolves.toBe(RAW);
    expect(getContext).not.toHaveBeenCalled();
  });

  it('大图按长边等比缩小，PNG 保留 alpha 通道', async () => {
    imageSize = { width: 2000, height: 1000 };
    const drawImage = vi.fn();
    const { toDataURL } = mockCanvas({ drawImage });

    await expect(fileToResizedDataUrl(pngFile())).resolves.toBe(RESIZED);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1024, 512);
    expect(toDataURL).toHaveBeenCalledWith('image/png');
  });

  it('JPEG 走有损编码，webp / gif 同样保留 alpha', async () => {
    imageSize = { width: 1200, height: 1200 };
    const { toDataURL } = mockCanvas();

    await fileToResizedDataUrl(new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
    expect(toDataURL).toHaveBeenLastCalledWith('image/jpeg', 0.9);

    for (const type of ['image/webp', 'image/gif']) {
      await fileToResizedDataUrl(new File(['x'], 'a', { type }));
      expect(toDataURL).toHaveBeenLastCalledWith('image/png');
    }
  });

  it('自定义 maxDim 生效，画布最小边不会为 0', async () => {
    imageSize = { width: 4000, height: 10 };
    const drawImage = vi.fn();
    mockCanvas({ drawImage });
    await fileToResizedDataUrl(pngFile(), 100);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 100, 1);
  });

  it('canvas 不可用时退回原始 dataURL', async () => {
    imageSize = { width: 2000, height: 1000 };
    const { toDataURL } = mockCanvas(null);
    await expect(fileToResizedDataUrl(pngFile())).resolves.toBe(RAW);
    expect(toDataURL).not.toHaveBeenCalled();
  });

  it('图片解码失败时抛错', async () => {
    imageFails = true;
    await expect(fileToResizedDataUrl(pngFile())).rejects.toThrow('image load failed');
  });

  it('文件读取失败时抛错', async () => {
    readerResults = ['error'];
    await expect(fileToResizedDataUrl(pngFile())).rejects.toThrow('read failed');
  });
});

describe('ReferenceImageInput · 渲染', () => {
  const base = {
    dataUrl: '',
    fileName: '',
    onSelect: vi.fn(),
    onClear: vi.fn(),
    disabled: false,
  };

  it('未选图时显示占位块与文案，无清除按钮', () => {
    render(<ReferenceImageInput {...base} />);
    expect(screen.getByText('video.refImage')).toBeInTheDocument();
    expect(screen.getByText('video.noImage')).toBeInTheDocument();
    expect(screen.queryByAltText('Reference')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'video.clearImage' })).not.toBeInTheDocument();
  });

  it('已选图时显示缩略图、文件名与清除按钮，并渲染 hint', async () => {
    const onClear = vi.fn();
    render(
      <ReferenceImageInput
        {...base}
        dataUrl={RAW}
        fileName="photo.png"
        onClear={onClear}
        hint="建议 16:9"
      />,
    );
    expect(screen.getByAltText('Reference')).toHaveAttribute('src', RAW);
    expect(screen.getByText('video.imageSelected')).toBeInTheDocument();
    expect(screen.getByText('建议 16:9')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'video.clearImage' }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('禁用时 file input 不可操作且不显示清除按钮', () => {
    const { container } = render(
      <ReferenceImageInput {...base} dataUrl={RAW} fileName="photo.png" disabled />,
    );
    expect(container.querySelector('input[type="file"]')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'video.clearImage' })).not.toBeInTheDocument();
  });
});

describe('ReferenceImageInput · 选图', () => {
  const base = {
    dataUrl: '',
    fileName: '',
    onSelect: vi.fn(),
    onClear: vi.fn(),
    disabled: false,
  };

  it('选图成功后回调缩放后的 dataURL 与文件名，并清空 input', async () => {
    imageSize = { width: 2000, height: 1000 };
    mockCanvas();
    const onSelect = vi.fn();
    const { container } = render(<ReferenceImageInput {...base} onSelect={onSelect} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    await userEvent.upload(input, pngFile());
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(RESIZED, 'photo.png'));
    expect(input.value).toBe('');
  });

  it('缩放失败时回退到原始 dataURL', async () => {
    imageFails = true;
    const onSelect = vi.fn();
    const { container } = render(<ReferenceImageInput {...base} onSelect={onSelect} />);
    await userEvent.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      pngFile(),
    );
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(RAW, 'photo.png'));
  });

  it('缩放与回退读取都失败时清空选择', async () => {
    imageFails = true;
    readerResults = ['ok', 'error'];
    const onSelect = vi.fn();
    const onClear = vi.fn();
    const { container } = render(
      <ReferenceImageInput {...base} onSelect={onSelect} onClear={onClear} />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    await userEvent.upload(input, pngFile());
    await waitFor(() => expect(onClear).toHaveBeenCalledOnce());
    expect(onSelect).not.toHaveBeenCalled();
    expect(input.value).toBe('');
  });

  it('change 事件没有文件时不做任何处理', () => {
    const onSelect = vi.fn();
    const { container } = render(<ReferenceImageInput {...base} onSelect={onSelect} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
