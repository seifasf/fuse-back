import multer from 'multer';
import { Media } from '../models/Media.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { env } from '../config/env.js';
import {
  getCachedMedia,
  optimizeUploadBuffer,
  resizeMediaBuffer,
  setCachedMedia,
} from '../utils/imageOptimize.js';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED.has(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, WebP, or GIF images are allowed'));
    }
    cb(null, true);
  },
});

export const uploadMiddleware = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('Image must be under 5MB', 400, 'FILE_TOO_LARGE'));
      }
      return next(new AppError(err.message, 400, 'UPLOAD_ERROR'));
    }
    if (err) {
      return next(new AppError(err.message, 400, 'INVALID_FILE'));
    }
    next();
  });
};

function publicBase(req) {
  if (env.apiPublicUrl) return env.apiPublicUrl.replace(/\/$/, '');
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${proto}://${host}`;
}

export const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('No image file provided', 400, 'VALIDATION_ERROR');

  const optimized = await optimizeUploadBuffer(req.file.buffer, req.file.mimetype);

  const media = await Media.create({
    filename: req.file.originalname?.slice(0, 200) || 'upload.jpg',
    mimeType: optimized.mimeType,
    size: optimized.buffer.length,
    data: optimized.buffer,
    uploadedBy: req.user?._id,
  });

  const url = `${publicBase(req)}/api/v1/media/${media._id}`;

  res.status(201).json({
    id: media._id,
    url,
    mimeType: media.mimeType,
    size: media.size,
    filename: media.filename,
  });
});

/** Public: serve image bytes for <img src>  -  supports ?w=900 for mobile-sized WebP */
export const getMedia = asyncHandler(async (req, res) => {
  const widthRaw = req.query.w;
  const width = widthRaw ? Math.min(2000, Math.max(80, parseInt(String(widthRaw), 10) || 0)) : 0;
  const cacheHit = getCachedMedia(req.params.id, width || 'full');
  if (cacheHit) {
    res.set({
      'Content-Type': cacheHit.mimeType,
      'Content-Length': String(cacheHit.buffer.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Image-Cache': 'HIT',
    });
    return res.send(cacheHit.buffer);
  }

  const media = await Media.findById(req.params.id).select('mimeType size data').lean();
  if (!media) throw new AppError('Image not found', 404, 'NOT_FOUND');

  let buffer = Buffer.isBuffer(media.data)
    ? media.data
    : Buffer.from(media.data?.buffer || media.data);
  let mimeType = media.mimeType;

  if (width) {
    const resized = await resizeMediaBuffer(buffer, mimeType, width);
    buffer = resized.buffer;
    mimeType = resized.mimeType;
  }

  setCachedMedia(req.params.id, width || 'full', { buffer, mimeType });

  res.set({
    'Content-Type': mimeType,
    'Content-Length': String(buffer.length),
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Image-Cache': 'MISS',
  });
  res.send(buffer);
});

export const deleteMedia = asyncHandler(async (req, res) => {
  const deleted = await Media.findByIdAndDelete(req.params.id);
  if (!deleted) throw new AppError('Image not found', 404, 'NOT_FOUND');
  res.json({ deleted: true });
});
