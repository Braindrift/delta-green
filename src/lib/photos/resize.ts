/**
 * Client-side image resize + compression.
 *
 * Reads a `File`, scales the longest edge down to `MAX_EDGE_PX` (preserving
 * aspect ratio, never upscaling), and re-encodes as JPEG at `JPEG_QUALITY`.
 * Always JPEG output regardless of input format — keeps storage paths
 * predictable and the `Photo.path` extension uniform.
 *
 * Per DEL-12: max 1200px longest edge, JPEG quality ~80%.
 *
 * Pipeline:
 *   File -> createImageBitmap -> OffscreenCanvas (fall back to <canvas>) ->
 *   toBlob('image/jpeg', 0.8)
 *
 * `createImageBitmap` decodes off the main thread on browsers that support
 * it, and handles HEIC/HEIF on Safari/iOS. On browsers that can't decode the
 * source (HEIC on non-Safari), it throws — we surface that as a typed error
 * to the caller rather than crashing.
 *
 * No transparency: input PNG with alpha is composited onto an opaque
 * background. The card UI's polaroid styling expects opaque photos anyway.
 */

const MAX_EDGE_PX = 1200;
const JPEG_QUALITY = 0.8;
const JPEG_BACKGROUND = '#000000';

export type ResizedImage = {
  blob: Blob;
  /** Always `'jpg'` — input format is discarded. */
  ext: 'jpg';
  /** Final pixel dimensions after scaling. */
  width: number;
  height: number;
};

export class ImageResizeError extends Error {
  public readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ImageResizeError';
    this.cause = cause;
  }
}

/**
 * Decode `file`, resize, return a JPEG blob.
 *
 * Throws `ImageResizeError` on decode failure (unsupported format, corrupt
 * file) or encode failure (canvas tainted, browser quirk). Callers map this
 * to the photos module's `Result` envelope.
 */
export async function resizeImage(file: File): Promise<ResizedImage> {
  const bitmap = await decode(file);
  try {
    const { width, height } = computeTargetSize(bitmap.width, bitmap.height);
    const blob = await encode(bitmap, width, height);
    return { blob, ext: 'jpg', width, height };
  } finally {
    bitmap.close();
  }
}

/* -------------------------------------------------------------------------- */
/* Steps                                                                       */
/* -------------------------------------------------------------------------- */

async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch (err) {
    throw new ImageResizeError(
      `Could not decode image (${file.type || 'unknown type'}). The format may be unsupported by this browser.`,
      err,
    );
  }
}

/**
 * Returns the post-resize dimensions. Never upscales: if the source is
 * already within `MAX_EDGE_PX`, returns the source dimensions unchanged.
 *
 * Rounded to whole pixels via `Math.round` — fractional pixels would be
 * coerced anyway, but the rounding keeps debug output clean.
 */
export function computeTargetSize(
  sourceWidth: number,
  sourceHeight: number,
): { width: number; height: number } {
  const longest = Math.max(sourceWidth, sourceHeight);
  if (longest <= MAX_EDGE_PX) {
    return { width: sourceWidth, height: sourceHeight };
  }
  const scale = MAX_EDGE_PX / longest;
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

/**
 * Render the bitmap at the target dimensions onto an opaque background, then
 * encode as JPEG.
 *
 * Prefers `OffscreenCanvas` (off main thread, available in Chromium/Firefox).
 * Falls back to a detached `<canvas>` element for Safari and anywhere else
 * without `OffscreenCanvas.convertToBlob`.
 */
async function encode(bitmap: ImageBitmap, width: number, height: number): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new ImageResizeError('OffscreenCanvas 2D context unavailable.');
    }
    paint(ctx, bitmap, width, height);
    try {
      return await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
    } catch (err) {
      throw new ImageResizeError('Failed to encode JPEG via OffscreenCanvas.', err);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new ImageResizeError('Canvas 2D context unavailable.');
  }
  paint(ctx, bitmap, width, height);
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new ImageResizeError('canvas.toBlob produced no blob.'));
      },
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

function paint(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  bitmap: ImageBitmap,
  width: number,
  height: number,
): void {
  // Opaque background prevents PNG transparency from rendering as black
  // chunks in the JPEG output.
  ctx.fillStyle = JPEG_BACKGROUND;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
}
