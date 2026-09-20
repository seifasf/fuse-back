import sharp from 'sharp';
import { cacheGet, cacheSet } from './memoryCache.js';

const MAX_UPLOAD_EDGE = 1600;
const MAX_SERVE_EDGE = 2000;

/**
 * Compress uploads for the public site (WebP when possible, max edge 1600).
 * Falls back to the original buffer on failure.
 */
export async function optimizeUploadBuffer(buffer, mimeType) {
  try {
    const img = sharp(buffer, { failOn: 'none' }).rotate();
    const meta = await img.metadata();
    const edge = Math.max(meta.width || 0, meta.height || 0);
    let pipeline = img;
    if (edge > MAX_UPLOAD_EDGE) {
      pipeline = pipeline.resize({
        width: meta.width >= meta.height ? MAX_UPLOAD_EDGE : undefined,
        height: meta.height > meta.width ? MAX_UPLOAD_EDGE : undefined,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // Prefer WebP for photos; keep PNG for graphics with alpha
    if (mimeType === 'image/png' && meta.hasAlpha) {
      const out = await pipeline.png({ compressionLevel: 8 }).toBuffer();
      return { buffer: out, mimeType: 'image/png' };
    }

    const out = await pipeline.webp({ quality: 72, effort: 4 }).toBuffer();
    return { buffer: out, mimeType: 'image/webp' };
  } catch {
    return { buffer, mimeType };
  }
}

/**
 * On-the-fly resize for public media GETs (?w=900).
 * Cached in memory so hot hero images stay fast.
 */
export async function resizeMediaBuffer(buffer, mimeType, width) {
  const w = Math.min(MAX_SERVE_EDGE, Math.max(80, Number(width) || 0));
  if (!w) return { buffer, mimeType };

  try {
    const out = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: w, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 70, effort: 4 })
      .toBuffer();
    return { buffer: out, mimeType: 'image/webp' };
  } catch {
    return { buffer, mimeType };
  }
}

export function mediaCacheKey(id, width) {
  return `media:${id}:w${width || 'full'}`;
}

export function getCachedMedia(id, width) {
  return cacheGet(mediaCacheKey(id, width));
}

export function setCachedMedia(id, width, value, ttlMs = 10 * 60_000) {
  return cacheSet(mediaCacheKey(id, width), value, ttlMs);
}
