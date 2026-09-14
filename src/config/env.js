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
  adminSecurityKey: requiredInProd('ADMIN_SECURITY_KEY', process.env.ADMIN_SECURITY_KEY, {
    rejectDefaults: ['fuse2026', 'change-me-admin-key'],
  }) || 'fuse2026',
  clientUrl: requiredInProd('CLIENT_URL', process.env.CLIENT_URL, {
    rejectDefaults: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  }) || 'http://localhost:5173',
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
  /** Public base URL of this API (for uploaded image URLs). e.g. http://localhost:5001 */
  apiPublicUrl: process.env.API_PUBLIC_URL || '',
};

if (isProd && !env.apiPublicUrl) {
  console.warn(
    'API_PUBLIC_URL is not set — uploaded media URLs will use the request Host header (usually fine on Render).'
  );
}
