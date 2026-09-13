import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fuse',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  adminSecurityKey: process.env.ADMIN_SECURITY_KEY || 'fuse2026',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  qrSecret: process.env.QR_SECRET || 'dev-qr-secret',
  emailFrom: process.env.EMAIL_FROM || 'tickets@fuse.events',
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
