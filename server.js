import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { connectDB } from './src/config/db.js';
import { env } from './src/config/env.js';
import { errorHandler, notFound } from './src/middleware/errorHandler.js';
import authRoutes from './src/routes/authRoutes.js';
import publicRoutes from './src/routes/publicRoutes.js';
import bookingRoutes from './src/routes/bookingRoutes.js';
import paymentRoutes from './src/routes/paymentRoutes.js';
import ticketRoutes from './src/routes/ticketRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';
import analyticsRoutes from './src/routes/analyticsRoutes.js';

const app = express();

// Render terminates TLS and forwards via proxy — required for rate limits + secure cookies
app.set('trust proxy', 1);

// Security HTTP Headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    frameguard: { action: 'deny' }, // Prevent clickjacking
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

// Strict CORS with whitelist validation
const allowedOrigins = [
  env.clientUrl,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Allow Vercel preview deployments when CLIENT_URL is a production Vercel host
      if (
        origin.endsWith('.vercel.app') &&
        (env.clientUrl?.includes('vercel.app') || env.nodeEnv !== 'production')
      ) {
        return callback(null, true);
      }
      return callback(new Error('CORS access denied: origin not allowed'));
    },
    credentials: true,
  })
);

app.use(morgan('dev'));

// Payload size limits to mitigate DoS
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Global API rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1', publicRoutes);
app.use('/api/v1/bookings', bookingRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/tickets', ticketRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/analytics', analyticsRoutes);

app.use(notFound);
app.use(errorHandler);

await connectDB();

app.listen(env.port, '0.0.0.0', () => {
  console.log(`FUSE API running securely on port ${env.port}`);
});
