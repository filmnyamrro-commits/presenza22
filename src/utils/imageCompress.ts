const MAX_DIMENSION = 600;
const MAX_DATA_URL_LENGTH = 220_000;

function encodeCanvasUnderLimit(canvas: HTMLCanvasElement): string {
  const qualities = [0.78, 0.65, 0.52, 0.4, 0.3];
  for (const quality of qualities) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= MAX_DATA_URL_LENGTH) {
      return dataUrl;
    }
  }
  // Final smaller resize fallback if image is unusually dense
  const smallCanvas = document.createElement('canvas');
  const scale = 0.65;
  smallCanvas.width = Math.max(160, Math.round(canvas.width * scale));
  smallCanvas.height = Math.max(160, Math.round(canvas.height * scale));
  const ctx = smallCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize image compression context.');
  }
  ctx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
  return smallCanvas.toDataURL('image/jpeg', 0.45);
}

export function captureVideoFrame(
  video: HTMLVideoElement,
  mirror = false
): string {
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const ratio = Math.min(1, MAX_DIMENSION / Math.max(vw, vh));
  const width = Math.round(vw * ratio);
  const height = Math.round(vh * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to capture frame from camera.');
  }

  if (mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, width, height);
  return encodeCanvasUnderLimit(canvas);
}

export async function compressImageFile(file: File): Promise<string> {
  const isImageByType = file.type.startsWith('image/');
  const isImageByExt = /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(file.name || '');
  if (!isImageByType && !isImageByExt) {
    throw new Error('Please select a valid image file (JPG, PNG, or WebP).');
  }

  let objectUrl: string | null = null;
  const loadImage = async (): Promise<HTMLImageElement> => {
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      try {
        objectUrl = URL.createObjectURL(file);
        return await new Promise<HTMLImageElement>((resolve, reject) => {
          const element = new Image();
          element.onload = () => resolve(element);
          element.onerror = () => reject(new Error('objecturl-load-failed'));
          element.src = objectUrl!;
        });
      } catch {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
        }
      }
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read selected image.'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read selected image.'));
      reader.readAsDataURL(file);
    });

    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () =>
        reject(
          new Error(
            'This photo format could not be processed. Please use JPG, PNG, or WebP, or take a picture with the live camera.'
          )
        );
      element.src = dataUrl;
    });
  };

  try {
    const img = await loadImage();
    const srcW = img.naturalWidth || img.width || 640;
    const srcH = img.naturalHeight || img.height || 480;
    const ratio = Math.min(1, MAX_DIMENSION / Math.max(srcW, srcH));
    const width = Math.max(1, Math.round(srcW * ratio));
    const height = Math.max(1, Math.round(srcH * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to process image.');
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    return encodeCanvasUnderLimit(canvas);
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

const MAX_BG_DIMENSION = 1400;
const MAX_BG_DATA_URL_LENGTH = 420_000;

export async function compressJpegBackground(file: File): Promise<string> {
  const isJpeg =
    file.type === 'image/jpeg' || /\.(jpe?g)$/i.test(file.name);
  if (!isJpeg) {
    throw new Error('Please upload a JPEG image (.jpg or .jpeg).');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read selected JPEG file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read selected JPEG file.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Selected file is not a valid JPEG image.'));
    element.src = dataUrl;
  });

  const ratio = Math.min(1, MAX_BG_DIMENSION / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * ratio));
  const height = Math.max(1, Math.round(img.height * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to process background image.');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const qualities = [0.85, 0.74, 0.62, 0.5, 0.38];
  for (const quality of qualities) {
    const encoded = canvas.toDataURL('image/jpeg', quality);
    if (encoded.length <= MAX_BG_DATA_URL_LENGTH) {
      return encoded;
    }
  }

  const fallbackCanvas = document.createElement('canvas');
  fallbackCanvas.width = Math.max(320, Math.round(width * 0.7));
  fallbackCanvas.height = Math.max(320, Math.round(height * 0.7));
  const fbCtx = fallbackCanvas.getContext('2d');
  if (!fbCtx) {
    throw new Error('Unable to resize background image.');
  }
  fbCtx.fillStyle = '#ffffff';
  fbCtx.fillRect(0, 0, fallbackCanvas.width, fallbackCanvas.height);
  fbCtx.drawImage(canvas, 0, 0, fallbackCanvas.width, fallbackCanvas.height);
  return fallbackCanvas.toDataURL('image/jpeg', 0.55);
}

const MAX_LOGO_DIMENSION = 400;
const MAX_LOGO_DATA_URL_LENGTH = 320_000;

export async function compressLogoFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please upload a valid logo image (PNG, JPG, WebP, or SVG).');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read selected logo file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read selected logo file.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Selected file is not a supported logo image.'));
    element.src = dataUrl;
  });

  const sourceW = img.width || 400;
  const sourceH = img.height || 400;
  const ratio = Math.min(1, MAX_LOGO_DIMENSION / Math.max(sourceW, sourceH));
  const width = Math.max(1, Math.round(sourceW * ratio));
  const height = Math.max(1, Math.round(sourceH * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to process logo image.');
  }

  ctx.drawImage(img, 0, 0, width, height);
  const pngUrl = canvas.toDataURL('image/png');
  if (pngUrl.length <= MAX_LOGO_DATA_URL_LENGTH) {
    return pngUrl;
  }

  // Downscale PNG once to retain transparency if original was dense
  const smallerCanvas = document.createElement('canvas');
  smallerCanvas.width = Math.max(64, Math.round(width * 0.65));
  smallerCanvas.height = Math.max(64, Math.round(height * 0.65));
  const sCtx = smallerCanvas.getContext('2d');
  if (!sCtx) {
    throw new Error('Unable to resize logo image.');
  }
  sCtx.drawImage(canvas, 0, 0, smallerCanvas.width, smallerCanvas.height);
  const smallerPng = smallerCanvas.toDataURL('image/png');
  if (smallerPng.length <= MAX_LOGO_DATA_URL_LENGTH) {
    return smallerPng;
  }

  // Final JPEG fallback under size limit
  const jpgCtx = smallerCanvas.getContext('2d');
  if (jpgCtx) {
    jpgCtx.globalCompositeOperation = 'destination-over';
    jpgCtx.fillStyle = '#ffffff';
    jpgCtx.fillRect(0, 0, smallerCanvas.width, smallerCanvas.height);
  }
  return smallerCanvas.toDataURL('image/jpeg', 0.85);
}

const MAX_CERT_BG_DIMENSION = 1400;
const MAX_CERT_BG_DATA_URL_LENGTH = 310_000;

export async function compressCertificateBackground(
  file: File
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please upload a valid image file (JPG, PNG, or WebP).');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read selected background image.'));
      }
    };
    reader.onerror = () =>
      reject(new Error('Failed to read selected background image.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () =>
      reject(new Error('Selected file is not a valid image.'));
    element.src = dataUrl;
  });

  const ratio = Math.min(
    1,
    MAX_CERT_BG_DIMENSION / Math.max(img.width || 1200, img.height || 800)
  );
  const width = Math.max(1, Math.round((img.width || 1200) * ratio));
  const height = Math.max(1, Math.round((img.height || 800) * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to process certificate background image.');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const qualities = [0.82, 0.7, 0.58, 0.45, 0.34];
  for (const quality of qualities) {
    const encoded = canvas.toDataURL('image/jpeg', quality);
    if (encoded.length <= MAX_CERT_BG_DATA_URL_LENGTH) {
      return encoded;
    }
  }

  const fallbackCanvas = document.createElement('canvas');
  fallbackCanvas.width = Math.max(320, Math.round(width * 0.65));
  fallbackCanvas.height = Math.max(240, Math.round(height * 0.65));
  const fbCtx = fallbackCanvas.getContext('2d');
  if (!fbCtx) {
    throw new Error('Unable to resize certificate background image.');
  }
  fbCtx.fillStyle = '#ffffff';
  fbCtx.fillRect(0, 0, fallbackCanvas.width, fallbackCanvas.height);
  fbCtx.drawImage(canvas, 0, 0, fallbackCanvas.width, fallbackCanvas.height);
  return fallbackCanvas.toDataURL('image/jpeg', 0.5);
}

const MAX_SIGNATURE_DIMENSION = 420;
const MAX_SIGNATURE_DATA_URL_LENGTH = 135_000;

function encodeSignatureCanvas(canvas: HTMLCanvasElement): string {
  const pngUrl = canvas.toDataURL('image/png');
  if (pngUrl.length <= MAX_SIGNATURE_DATA_URL_LENGTH) {
    return pngUrl;
  }

  const smaller = document.createElement('canvas');
  smaller.width = Math.max(120, Math.round(canvas.width * 0.65));
  smaller.height = Math.max(48, Math.round(canvas.height * 0.65));
  const sCtx = smaller.getContext('2d');
  if (!sCtx) {
    throw new Error('Unable to resize signature image.');
  }
  sCtx.drawImage(canvas, 0, 0, smaller.width, smaller.height);
  const smallerPng = smaller.toDataURL('image/png');
  if (smallerPng.length <= MAX_SIGNATURE_DATA_URL_LENGTH) {
    return smallerPng;
  }

  sCtx.globalCompositeOperation = 'destination-over';
  sCtx.fillStyle = '#ffffff';
  sCtx.fillRect(0, 0, smaller.width, smaller.height);
  return smaller.toDataURL('image/jpeg', 0.8);
}

export async function compressSignatureFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error(
      'Please upload a valid signature image (PNG, JPG, WebP, or SVG).'
    );
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read selected signature file.'));
      }
    };
    reader.onerror = () =>
      reject(new Error('Failed to read selected signature file.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () =>
      reject(new Error('Selected file is not a supported signature image.'));
    element.src = dataUrl;
  });

  const sourceW = img.width || 360;
  const sourceH = img.height || 140;
  const ratio = Math.min(1, MAX_SIGNATURE_DIMENSION / Math.max(sourceW, sourceH));
  const width = Math.max(1, Math.round(sourceW * ratio));
  const height = Math.max(1, Math.round(sourceH * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to process signature image.');
  }

  ctx.drawImage(img, 0, 0, width, height);
  return encodeSignatureCanvas(canvas);
}

export function compressSignatureCanvas(
  sourceCanvas: HTMLCanvasElement
): string {
  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Signature pad context is unavailable.');
  }
  const { width, height } = sourceCanvas;
  const pixels = ctx.getImageData(0, 0, width, height).data;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = pixels[(y * width + x) * 4 + 3];
      if (alpha > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error('Please draw a signature before saving.');
  }

  const pad = 8;
  const cropX = Math.max(0, minX - pad);
  const cropY = Math.max(0, minY - pad);
  const cropW = Math.min(width - cropX, maxX - minX + 1 + pad * 2);
  const cropH = Math.min(height - cropY, maxY - minY + 1 + pad * 2);

  const ratio = Math.min(1, MAX_SIGNATURE_DIMENSION / Math.max(cropW, cropH));
  const outW = Math.max(1, Math.round(cropW * ratio));
  const outH = Math.max(1, Math.round(cropH * ratio));

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) {
    throw new Error('Unable to finalize drawn signature.');
  }
  outCtx.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
  return encodeSignatureCanvas(outCanvas);
}
