export type ResizeImageOptions = {
  maxSize?: number;
  quality?: number;
  maxLength?: number;
  minSize?: number;
  minQuality?: number;
};

const loadImageFile = (file: File) =>
  new Promise<{ image: HTMLImageElement; objectUrl: string }>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => resolve({ image, objectUrl });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('invalid_image'));
    };
    image.src = objectUrl;
  });

const encodeResizedImage = (image: HTMLImageElement, maxSize: number, quality: number) => {
  const ratio = Math.min(maxSize / image.width, maxSize / image.height, 1);
  const width = Math.max(1, Math.round(image.width * ratio));
  const height = Math.max(1, Math.round(image.height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
};

export const resizeImageToDataUrl = async (file: File, options: ResizeImageOptions = {}) => {
  const maxSize = Math.max(1, Math.round(options.maxSize ?? 520));
  const minSize = Math.max(1, Math.round(options.minSize ?? 180));
  const maxLength = options.maxLength;
  const minQuality = Math.min(1, Math.max(0.2, options.minQuality ?? 0.45));
  let quality = Math.min(1, Math.max(minQuality, options.quality ?? 0.72));

  const loaded = await loadImageFile(file);
  try {
    let currentSize = maxSize;
    let best = encodeResizedImage(loaded.image, currentSize, quality);

    if (!maxLength || best.length <= maxLength) return best;

    for (let step = 0; step < 10; step += 1) {
      if (quality > minQuality) {
        quality = Math.max(minQuality, Number((quality - 0.08).toFixed(2)));
      } else if (currentSize > minSize) {
        currentSize = Math.max(minSize, Math.floor(currentSize * 0.85));
      } else {
        break;
      }

      const encoded = encodeResizedImage(loaded.image, currentSize, quality);
      if (encoded.length < best.length) best = encoded;
      if (encoded.length <= maxLength) return encoded;
    }

    if (best.length <= maxLength) return best;
    throw new Error('image_too_large');
  } finally {
    URL.revokeObjectURL(loaded.objectUrl);
  }
};
