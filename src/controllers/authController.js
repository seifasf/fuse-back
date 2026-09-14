import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { signToken } from '../middleware/auth.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { env } from '../config/env.js';

// Cross-site (Vercel front ↔ Render API) needs SameSite=None + Secure.
const cookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export const register = asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
    throw new AppError('Name, email, and password must be valid strings', 400, 'VALIDATION_ERROR');
  }

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanName || !cleanEmail || password.length < 6) {
    throw new AppError('Name, valid email, and password (min 6 characters) are required', 400, 'VALIDATION_ERROR');
  }

  const exists = await User.findOne({ email: cleanEmail });
  if (exists) throw new AppError('Email already registered', 409, 'CONFLICT');

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    name: cleanName,
    email: cleanEmail,
    phone: typeof phone === 'string' ? phone.trim() : '',
    passwordHash,
    role: 'client',
  });

  const token = signToken(user._id);
  res.cookie('token', token, cookieOptions);
  res.status(201).json({
    user: { id: user._id.toString(), name: user.name, email: user.email, role: user.role },
    token,
  });
});

export const login = asyncHandler(async (req, res) => {
  const rawIdentifier = req.body.username || req.body.email;
  const rawPassword = req.body.password;
  const rawAdminKey = req.body.adminKey;

  // Strict type verification against NoSQL injection
  if (typeof rawIdentifier !== 'string' || typeof rawPassword !== 'string') {
    throw new AppError('Username or email and password are required', 400, 'VALIDATION_ERROR');
  }

  const identifier = rawIdentifier.trim().toLowerCase();
  const password = rawPassword;

  if (!identifier || !password) {
    throw new AppError('Username or email and password are required', 400, 'VALIDATION_ERROR');
  }

  const user = await User.findOne({
    $or: [
      { username: identifier },
      { email: identifier },
      { email: `${identifier}@fuse.events` },
    ],
    deletedAt: null,
  }).select('+passwordHash');

  if (!user || !user.isActive) {
    // Artificial delay against timing attacks
    await new Promise((r) => setTimeout(r, 200));
    throw new AppError('Invalid credentials', 401, 'UNAUTHORIZED');
  }

  // Check if account is temporarily locked due to brute force
  if (user.lockUntil && user.lockUntil > new Date()) {
    const remainingMs = user.lockUntil.getTime() - Date.now();
    const remainingMins = Math.ceil(remainingMs / (60 * 1000));
    throw new AppError(
      `Account locked for security after multiple failed attempts. Please try again in ${remainingMins} minute(s).`,
      429,
      'ACCOUNT_LOCKED'
    );
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= 5) {
      user.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15-minute lockout
    }
    await user.save({ validateBeforeSave: false });
    throw new AppError('Invalid credentials', 401, 'UNAUTHORIZED');
  }

  // Admin access validation: Require the Admin Security Key for any admin account
  if (user.role === 'admin') {
    const providedKey = typeof rawAdminKey === 'string' ? rawAdminKey.trim() : '';
    if (!providedKey || providedKey !== env.adminSecurityKey) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      await user.save({ validateBeforeSave: false });
      throw new AppError(
        'Admin Security Key is missing or invalid. Security clearance required to open admin panel.',
        403,
        'ADMIN_KEY_REQUIRED'
      );
    }
  }

  // Successful login: reset failed counters
  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  const token = signToken(user._id);
  res.cookie('token', token, cookieOptions);
  res.json({
    user: {
      id: user._id.toString(),
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
    },
    token,
  });
});

export const verifyAdminKey = asyncHandler(async (req, res) => {
  const rawKey = req.body.key;
  if (typeof rawKey !== 'string') {
    throw new AppError('Security key must be a valid string', 400, 'VALIDATION_ERROR');
  }

  const cleanKey = rawKey.trim();
  if (!cleanKey || cleanKey !== env.adminSecurityKey) {
    // Artificial small delay to slow down brute force attempts
    await new Promise((r) => setTimeout(r, 400));
    throw new AppError('Invalid Admin Security Key', 403, 'INVALID_SECURITY_KEY');
  }

  res.json({ verified: true, message: 'Security clearance verified' });
});

export const logout = asyncHandler(async (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
  });
  res.json({ message: 'Logged out' });
});

export const me = asyncHandler(async (req, res) => {
  res.json({
    user: {
      id: req.user._id.toString(),
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
    },
  });
});
