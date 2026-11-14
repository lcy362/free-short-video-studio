/**
 * 本地图片 → data URL（上传前归一化）
 * ─────────────────────────────────────────────────────────────
 * 上游没有文件上传端点，但 `images[]` / `first_frame` / `last_frame` 字段
 * **接受 data URI**（源项目 `_resolve_image_ref` 对 `data:` 原样透传，
 * 并在托管失败时以 base64 兜底），所以浏览器端可直接把压缩后的 data URL
 * 放进请求体，无需经过任何服务器，Key 依然只在本地。
 *
 * 长边超过 maxDim 时用 canvas 等比缩小，避免多图时 base64 请求体过大。
 */

/** 把图片文件读成 dataURL，长边超过 maxDim 时等比缩小 */
export async function fileToResizedDataUrl(file: File, maxDim = 1024): Promise<string> {
  const raw = await readAsDataUrl(file);

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('image load failed'));
    el.src = raw;
  });

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  if (scale >= 1) return raw;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return raw;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const keepAlpha =
    file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/gif';
  return keepAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('file read failed'));
    reader.readAsDataURL(file);
  });
}

/** 单文件入口：读取失败时回退原始 dataURL，仍失败则返回 null */
export async function readImageFile(file: File, maxDim = 1024): Promise<string | null> {
  try {
    return await fileToResizedDataUrl(file, maxDim);
  } catch {
    try {
      return await readAsDataUrl(file);
    } catch {
      return null;
    }
  }
}
