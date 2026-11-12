// Reads the text in a photo on this device: Tesseract compiled to WebAssembly, so the picture never leaves the
// phone. Its worker, engine and language files (about 8 MB, Indonesian + English) are served from /ocr by this
// app (vite.config.ts) and fetched the first time a photo is read; the library is imported then too.

// A phone photo is 12 megapixels; text reads as well at this size and several times faster.
const MAX_SIDE = 2000;

async function shrink(photo: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(photo);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/** The text in the photo, line by line. `onProgress` gets 0..1 while it reads. */
export async function readPhoto(
  photo: Blob,
  onProgress?: (share: number) => void,
): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(['ind', 'eng'], 1, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr/',
    langPath: '/ocr/',
    logger: m => m.status === 'recognizing text' && onProgress?.(m.progress),
  });
  try {
    return (await worker.recognize(await shrink(photo))).data.text;
  } finally {
    await worker.terminate();
  }
}

/** The picture's SHA-256 in hex: the server knows the same picture when it comes again. */
export async function photoHash(photo: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await photo.arrayBuffer());
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
