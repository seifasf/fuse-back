import multer from 'multer';
import { Media } from '../models/Media.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { env } from '../config/env.js';

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

  const media = await Media.create({
    filename: req.file.originalname?.slice(0, 200) || 'upload.jpg',
    mimeType: req.file.mimetype,
    size: req.file.size,
    data: req.file.buffer,
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

/** Public: serve image bytes for <img src> */
export const getMedia = asyncHandler(async (req, res) => {
  const media = await Media.findById(req.params.id);
  if (!media) throw new AppError('Image not found', 404, 'NOT_FOUND');

  res.set({
    'Content-Type': media.mimeType,
    'Content-Length': String(media.size),
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  res.send(media.data);
});

export const deleteMedia = asyncHandler(async (req, res) => {
  const deleted = await Media.findByIdAndDelete(req.params.id);
  if (!deleted) throw new AppError('Image not found', 404, 'NOT_FOUND');
  res.json({ deleted: true });
});
