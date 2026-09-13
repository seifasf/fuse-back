import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const signToken = (userId) =>
  jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

export const auth = asyncHandler(async (req, res, next) => {
  const token =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : null);

  if (!token) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');

  const decoded = jwt.verify(token, env.jwtSecret);
  const user = await User.findOne({ _id: decoded.sub, deletedAt: null, isActive: true });
  if (!user) throw new AppError('User not found', 401, 'UNAUTHORIZED');

  req.user = user;
  next();
});

export const optionalAuth = asyncHandler(async (req, res, next) => {
  const token =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : null);

  if (token) {
    try {
      const decoded = jwt.verify(token, env.jwtSecret);
      req.user = await User.findById(decoded.sub).select('-passwordHash');
    } catch {
      req.user = null;
    }
  }
  next();
});

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new AppError('Forbidden', 403, 'FORBIDDEN'));
  }
  next();
};
