import { AppError } from '../utils/AppError.js';

export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';

  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
  }

  res.status(statusCode).json({
    code,
    message: err.message || 'Internal server error',
    details: err.details || undefined,
  });
}

export function notFound(req, res, next) {
  next(new AppError(`Route not found: ${req.originalUrl}`, 404, 'NOT_FOUND'));
}
