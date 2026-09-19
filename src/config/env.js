import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = nodeEnv === 'production';

function requiredInProd(name, value, { rejectDefaults = [] } = {}) {
  if (!isProd) return value;
  if (!value || rejectDefaults.includes(value)) {
    throw new Error(`Missing or insecure required env var in production: ${name}`);
  }
  return value;
}

/** Trim + strip accidental wrapping quotes from dashboard-pasted env values. */
function cleanEnv(value) {
  if (value == null) return value;
  let v = String(value).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function cleanUrl(value) {
  const v = cleanEnv(value);
  if (!v) return v;
  return v.replace(/\/+$/, '');
}

/**
 * jsonwebtoken + `ms`: a bare numeric string like "7" is NOT "7 days" —
 * it yields a 0s lifetime (iat === exp), so every admin API 401s after login.
 * Accept "7d" / "12h" / "3600" (seconds as number-like with unit or large secs).
 */
function normalizeJwtExpiresIn(raw) {
  const fallback = '7d';
  const v = cleanEnv(raw);
  if (!v) return fallback;

  // Pure digits: treat small values as days, large as seconds
  if (/^\d+$/.test(v)) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    if (n < 60) return `${n}d`; // "7" → "7d"
    return n; // e.g. 604800 seconds
  }

  // Timespan strings: 7d, 12h, 30m, 60s
  if (/^\d+(\.\d+)?\s*[smhdw]$/i.test(v)) return v.replace(/\s+/g, '');

  // "7 days" style
  if (/^\d+(\.\d+)?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?)$/i.test(v)) {
    return v;
  }

  console.warn(`[fuse] Invalid JWT_EXPIRES_IN="${v}" — using ${fallback}`);
  return fallback;
}

const adminSecurityKey =
  cleanEnv(
    requiredInProd('ADMIN_SECURITY_KEY', process.env.ADMIN_SECURITY_KEY, {
      rejectDefaults: ['fuse2026', 'change-me-admin-key'],
    }) || 'fuse2026'
  ) || 'fuse2026';

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv,
  mongoUri: requiredInProd('MONGODB_URI', process.env.MONGODB_URI, {
    rejectDefaults: ['mongodb://127.0.0.1:27017/fuse', 'mongodb://localhost:27017/fuse'],
  }) || 'mongodb://127.0.0.1:27017/fuse',
  jwtSecret: requiredInProd('JWT_SECRET', process.env.JWT_SECRET, {
    rejectDefaults: ['dev-secret-change-me', 'change-me-in-production'],
  }) || 'dev-secret-change-me',
  jwtExpiresIn: normalizeJwtExpiresIn(process.env.JWT_EXPIRES_IN),
  adminSecurityKey,
  clientUrl: cleanUrl(
    requiredInProd('CLIENT_URL', process.env.CLIENT_URL, {
      rejectDefaults: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    }) || 'http://localhost:5173'
  ),
  qrSecret: requiredInProd('QR_SECRET', process.env.QR_SECRET, {
    rejectDefaults: ['dev-qr-secret', 'change-me-qr-secret'],
  }) || 'dev-qr-secret',
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN,
    phoneId: process.env.WHATSAPP_PHONE_ID,
  },
  paymob: {
    apiKey: process.env.PAYMOB_API_KEY,
    integrationId: process.env.PAYMOB_INTEGRATION_ID,
  },
  myfatoorah: {
    apiKey: process.env.MYFATOORAH_API_KEY,
  },
  /** Public base URL of this API (for uploaded image URLs). */
  apiPublicUrl: cleanUrl(process.env.API_PUBLIC_URL || ''),
};

if (isProd) {
  console.log(
    `[fuse] ADMIN_SECURITY_KEY loaded (length=${env.adminSecurityKey.length}). CLIENT_URL=${env.clientUrl}`
  );
}

if (isProd && !env.apiPublicUrl) {
  console.warn(
    'API_PUBLIC_URL is not set — uploaded media URLs will use the request Host header (usually fine on Render).'
  );
}
