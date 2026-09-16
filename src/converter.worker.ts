import { encodeBMP } from './bmp-encoder';
import type { ConvertRequestMsg, ConvertResultMsg, OutputFormat } from './types';

const ctx = self as unknown as Worker;

const MIME_BY_FORMAT: Record<Exclude<OutputFormat, 'bmp'>, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

ctx.onmessage = async (event: MessageEvent<ConvertRequestMsg>) => {
  const { id, fileData, sourceMimeType, targetFormat, quality } = event.data;
  try {
    const blob = await convert(fileData, sourceMimeType, targetFormat, quality);
    const result: ConvertResultMsg = { id, success: true, blob };
    ctx.postMessage(result);
  } catch (err) {
    const result: ConvertResultMsg = {
      id,
      success: false,
      error: err instanceof Error ? err.message : 'Nieznany błąd',
    };
    ctx.postMessage(result);
  }
};

async function convert(
  fileData: ArrayBuffer,
  sourceMimeType: string,
  targetFormat: OutputFormat,
  quality: number
): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([fileData], { type: sourceMimeType }));
  } catch {
    throw new Error('Nieobsługiwany lub uszkodzony plik');
  }

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const canvasCtx = canvas.getContext('2d');
  if (!canvasCtx) throw new Error('Brak kontekstu canvas');

  // JPEG i BMP nie wspierają przezroczystości — wypełniamy tło bielą zamiast
  // polegać na niejednoznacznym domyślnym zachowaniu przeglądarki.
  if (targetFormat === 'jpeg' || targetFormat === 'bmp') {
    canvasCtx.fillStyle = '#ffffff';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
  }

  canvasCtx.drawImage(bitmap, 0, 0);
  bitmap.close();

  if (targetFormat === 'bmp') {
    const imageData = canvasCtx.getImageData(0, 0, canvas.width, canvas.height);
    return new Blob([encodeBMP(imageData)], { type: 'image/bmp' });
  }

  const mimeType = MIME_BY_FORMAT[targetFormat];
  const supportsQuality = targetFormat === 'jpeg' || targetFormat === 'webp';
  return canvas.convertToBlob(
    supportsQuality ? { type: mimeType, quality: quality / 100 } : { type: mimeType }
  );
}
