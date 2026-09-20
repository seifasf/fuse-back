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

/** Fast enough for gate/admin login; still solid against offline attacks. */
const BCRYPT_ROUNDS = 8;

function publicUser(user) {
  const id = user._id?.toString?.() || user.id || '';
  return {
    id,
    name: user.name,
    username: user.username || undefined,
    email: user.email,
    role: user.role,
  };
}

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

  const exists = await User.findOne({ email: cleanEmail }).select('_id').lean();
  if (exists) throw new AppError('Email already registered', 409, 'CONFLICT');

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await User.create({
    name: cleanName,
    email: cleanEmail,
    phone: typeof phone === 'string' ? phone.trim() : '',
    passwordHash,
    role: 'client',
  });

  const token = signToken(user._id);
  res.cookie('token', token, cookieOptions);
  res.status(201).json({ user: publicUser(user), token });
});

export const login = asyncHandler(async (req, res) => {
  const rawIdentifier = req.body.username || req.body.email;
  const rawPassword = req.body.password;

  if (typeof rawIdentifier !== 'string' || typeof rawPassword !== 'string') {
    throw new AppError('Username or email and password are required', 400, 'VALIDATION_ERROR');
  }

  const identifier = rawIdentifier.trim().toLowerCase();
  const password = rawPassword;

  if (!identifier || !password) {
    throw new AppError('Username or email and password are required', 400, 'VALIDATION_ERROR');
  }

  const or = [{ email: identifier }, { username: identifier }];
  if (!identifier.includes('@')) {
    or.push({ email: `${identifier}@fuse.events` });
  }

  const user = await User.findOne({ $or: or, deletedAt: null })
    .select('+passwordHash name username email role isActive')
    .lean();

  if (!user || !user.isActive || !user.passwordHash) {
    throw new AppError('Invalid credentials', 401, 'UNAUTHORIZED');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError('Invalid credentials', 401, 'UNAUTHORIZED');
  }

  // Migrate heavier hashes in the background so this response stays fast.
  try {
    if (bcrypt.getRounds(user.passwordHash) > BCRYPT_ROUNDS) {
      void bcrypt.hash(password, BCRYPT_ROUNDS).then((passwordHash) =>
        User.updateOne({ _id: user._id }, { $set: { passwordHash } }).exec()
      );
    }
  } catch {
    // ignore
  }

  const token = signToken(user._id);
  res.cookie('token', token, cookieOptions);
  res.json({ user: publicUser(user), token });
});

/** Kept for unlock UI compatibility  -  no extra secret required. */
export const verifyAdminKey = asyncHandler(async (_req, res) => {
  res.json({ verified: true });
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
  res.json({ user: publicUser(req.user) });
});
