// ffmpeg.wasm 浏览器端视频处理服务
// 负责：加载 ffmpeg.wasm、统一缩放、拼接、水印叠加

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// ffmpeg core 从 CDN 加载（静态导出无法正确服务 WASM 多文件）
const CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

/**
 * 加载 ffmpeg.wasm（单例，重复调用返回同一实例）
 * @param onLog 日志回调（可选）
 */
export async function loadFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) {
    return ffmpegInstance;
  }
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();
    ffmpeg.on('log', ({ message }) => {
      onLog?.(message);
    });
    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  try {
    return await loadPromise;
  } catch (e) {
    loadPromise = null;
    throw e;
  }
}

/** 释放 ffmpeg 实例 */
export function terminateFFmpeg() {
  if (ffmpegInstance) {
    try {
      ffmpegInstance.terminate();
    } catch {
      // 忽略
    }
    ffmpegInstance = null;
    loadPromise = null;
  }
}

/**
 * 将视频统一缩放到目标分辨率（保持宽高比，黑边填充）
 * @param inputName 输入文件名（已写入 FS）
 * @param outputName 输出文件名
 * @param width 目标宽
 * @param height 目标高
 * @param onProgress 进度回调 0-1
 */
export async function scaleVideo(
  inputName: string,
  outputName: string,
  width: number,
  height: number,
  onProgress?: (ratio: number) => void,
): Promise<void> {
  const ffmpeg = await loadFFmpeg();

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(progress);
  };
  ffmpeg.on('progress', progressHandler);

  try {
    await ffmpeg.exec([
      '-i', inputName,
      '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
      '-r', '24',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-y',
      outputName,
    ]);
  } finally {
    ffmpeg.off('progress', progressHandler);
  }
}

/**
 * 拼接多段视频（concat demuxer，重新编码保证格式一致）
 * @param fileNames 已写入 FS 的视频文件名列表（统一分辨率后）
 * @param outputName 输出文件名
 * @param onProgress 进度回调 0-1
 */
export async function concatVideos(
  fileNames: string[],
  outputName: string,
  onProgress?: (ratio: number) => void,
): Promise<void> {
  const ffmpeg = await loadFFmpeg();

  // 写入 concat 列表文件
  const listContent = fileNames.map((f) => `file '${f}'`).join('\n');
  await ffmpeg.writeFile('concat_list.txt', new TextEncoder().encode(listContent));

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(progress);
  };
  ffmpeg.on('progress', progressHandler);

  try {
    await ffmpeg.exec([
      '-f', 'concat',
      '-safe', '0',
      '-i', 'concat_list.txt',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-y',
      outputName,
    ]);
  } finally {
    ffmpeg.off('progress', progressHandler);
    try {
      await ffmpeg.deleteFile('concat_list.txt');
    } catch {
      // 忽略
    }
  }
}

/**
 * 叠加水印（PNG 透明图片）
 * @param videoName 输入视频文件名
 * @param watermarkName 水印图片文件名
 * @param outputName 输出文件名
 * @param position 水印位置
 * @param onProgress 进度回调
 */
export async function addWatermark(
  videoName: string,
  watermarkName: string,
  outputName: string,
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' = 'bottom-right',
  onProgress?: (ratio: number) => void,
): Promise<void> {
  const ffmpeg = await loadFFmpeg();

  const posMap: Record<string, string> = {
    'top-left': '10:10',
    'top-right': 'main_w-overlay_w-10:10',
    'bottom-left': '10:main_h-overlay_h-10',
    'bottom-right': 'main_w-overlay_w-10:main_h-overlay_h-10',
  };

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(progress);
  };
  ffmpeg.on('progress', progressHandler);

  try {
    await ffmpeg.exec([
      '-i', videoName,
      '-i', watermarkName,
      '-filter_complex', `[0:v][1:v]overlay=${posMap[position]}`,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-c:a', 'copy',
      '-y',
      outputName,
    ]);
  } finally {
    ffmpeg.off('progress', progressHandler);
  }
}

/** 将 Blob 写入 ffmpeg FS */
export async function writeBlobToFile(
  blob: Blob,
  fileName: string,
): Promise<void> {
  const ffmpeg = await loadFFmpeg();
  await ffmpeg.writeFile(fileName, await fetchFile(blob));
}

/** 从 ffmpeg FS 读取文件为 Uint8Array */
export async function readFileAsBytes(fileName: string): Promise<Uint8Array> {
  const ffmpeg = await loadFFmpeg();
  const data = await ffmpeg.readFile(fileName);
  return data as Uint8Array;
}

/** 从 ffmpeg FS 读取文件为 Blob URL */
export async function readFileAsBlobURL(fileName: string, mimeType: string = 'video/mp4'): Promise<string> {
  const data = await readFileAsBytes(fileName);
  // 复制到普通 ArrayBuffer 以兼容 Blob 构造函数的 BlobPart 类型
  const bytes = new Uint8Array(data.byteLength);
  bytes.set(data);
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

/** 删除 FS 中的文件 */
export async function deleteFile(fileName: string): Promise<void> {
  const ffmpeg = await loadFFmpeg();
  try {
    await ffmpeg.deleteFile(fileName);
  } catch {
    // 忽略不存在的文件
  }
}
