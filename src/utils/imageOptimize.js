import sharp from 'sharp';

const MAX_UPLOAD_EDGE = 1600;
const MAX_SERVE_EDGE = 2000;

/** Media bytes never change for an id, so keep them long - but cap memory (any ?w= makes a new entry). */
const MEDIA_CACHE_TTL_MS = 24 * 60 * 60_000;
const MEDIA_CACHE_MAX_BYTES = 64 * 1024 * 1024;
const mediaCache = new Map();
let mediaCacheBytes = 0;

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

function dropMediaEntry(key, entry) {
  mediaCache.delete(key);
  mediaCacheBytes -= entry.bytes;
}

export function getCachedMedia(id, width) {
  const key = mediaCacheKey(id, width);
  const entry = mediaCache.get(key);
  if (!entry) return undefined;
  if (entry.expires <= Date.now()) {
    dropMediaEntry(key, entry);
    return undefined;
  }
  // Re-insert so Map order doubles as least-recently-used order for eviction.
  mediaCache.delete(key);
  mediaCache.set(key, entry);
  return entry.value;
}

export function setCachedMedia(id, width, value, ttlMs = MEDIA_CACHE_TTL_MS) {
  const key = mediaCacheKey(id, width);
  const bytes = value?.buffer?.length || 0;
  if (bytes > MEDIA_CACHE_MAX_BYTES) return value;
  const previous = mediaCache.get(key);
  if (previous) dropMediaEntry(key, previous);
  mediaCache.set(key, { value, bytes, expires: Date.now() + ttlMs });
  mediaCacheBytes += bytes;
  for (const [oldKey, entry] of mediaCache) {
    if (mediaCacheBytes <= MEDIA_CACHE_MAX_BYTES) break;
    dropMediaEntry(oldKey, entry);
  }
  return value;
}

export function dropCachedMedia(id) {
  const prefix = `media:${id}:`;
  for (const [key, entry] of mediaCache) {
    if (key.startsWith(prefix)) dropMediaEntry(key, entry);
  }
}
