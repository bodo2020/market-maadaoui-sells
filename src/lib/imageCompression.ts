export type ImageCompressionOptions = {
  maxDimension?: number;
  targetBytes?: number;
  initialQuality?: number;
  minQuality?: number;
};

export type CompressedImage = {
  file: File;
  originalBytes: number;
  compressedBytes: number;
  width: number;
  height: number;
  mimeType: string;
};

const DEFAULT_MAX_DIMENSION = 800;
const DEFAULT_TARGET_BYTES = 140 * 1024;
const DEFAULT_INITIAL_QUALITY = 0.72;
const DEFAULT_MIN_QUALITY = 0.46;

function fitWithin(width: number, height: number, maxDimension: number) {
  const longest = Math.max(width, height);
  if (longest <= maxDimension) return { width, height };
  const ratio = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error("IMAGE_COMPRESSION_FAILED"));
        return;
      }
      resolve(blob);
    }, mimeType, quality);
  });
}

async function loadImage(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("IMAGE_DECODE_FAILED"));
    });
    return image;
  } finally {
    // The decoded image remains usable after the object URL is released.
    URL.revokeObjectURL(objectUrl);
  }
}

export async function compressCatalogImage(
  file: File,
  options: ImageCompressionOptions = {},
): Promise<CompressedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("IMAGE_REQUIRED");
  }

  const maxDimension = Math.max(320, options.maxDimension ?? DEFAULT_MAX_DIMENSION);
  const targetBytes = Math.max(40 * 1024, options.targetBytes ?? DEFAULT_TARGET_BYTES);
  const initialQuality = Math.min(0.9, Math.max(0.5, options.initialQuality ?? DEFAULT_INITIAL_QUALITY));
  const minQuality = Math.min(initialQuality, Math.max(0.35, options.minQuality ?? DEFAULT_MIN_QUALITY));

  const image = await loadImage(file);
  let dimensions = fitWithin(image.naturalWidth || image.width, image.naturalHeight || image.height, maxDimension);
  let quality = initialQuality;
  let bestBlob: Blob | null = null;
  let bestWidth = dimensions.width;
  let bestHeight = dimensions.height;

  // Canvas re-encoding strips unnecessary EXIF/metadata and gives us a compact catalogue image.
  for (let resizePass = 0; resizePass < 4; resizePass += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("IMAGE_CANVAS_UNAVAILABLE");

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, dimensions.width, dimensions.height);

    quality = initialQuality;
    while (quality >= minQuality - 0.001) {
      const webpBlob = await canvasToBlob(canvas, "image/webp", quality);
      if (!bestBlob || webpBlob.size < bestBlob.size) {
        bestBlob = webpBlob;
        bestWidth = dimensions.width;
        bestHeight = dimensions.height;
      }
      if (webpBlob.size <= targetBytes) break;
      quality = Number((quality - 0.08).toFixed(2));
    }

    if (bestBlob && bestBlob.size <= targetBytes) break;
    dimensions = {
      width: Math.max(320, Math.round(dimensions.width * 0.82)),
      height: Math.max(320, Math.round(dimensions.height * 0.82)),
    };
  }

  if (!bestBlob) throw new Error("IMAGE_COMPRESSION_FAILED");

  const safeStem = file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "image";
  const compressedFile = new File(
    [bestBlob],
    `${safeStem}-${crypto.randomUUID()}.webp`,
    { type: bestBlob.type || "image/webp", lastModified: Date.now() },
  );

  return {
    file: compressedFile,
    originalBytes: file.size,
    compressedBytes: compressedFile.size,
    width: bestWidth,
    height: bestHeight,
    mimeType: compressedFile.type,
  };
}

export function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
