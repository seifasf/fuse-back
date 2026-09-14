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
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  adminSecurityKey,
  clientUrl: cleanUrl(
    requiredInProd('CLIENT_URL', process.env.CLIENT_URL, {
      rejectDefaults: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    }) || 'http://localhost:5173'
  ),
  qrSecret: requiredInProd('QR_SECRET', process.env.QR_SECRET, {
    rejectDefaults: ['dev-qr-secret', 'change-me-qr-secret'],
  }) || 'dev-qr-secret',
  emailFrom: process.env.EMAIL_FROM || 'fuse.contact@fuseevents.net',
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
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
