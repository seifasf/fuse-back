import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB() {
  mongoose.set('strictQuery', true);

  const options = {
    maxPoolSize: 20,
    minPoolSize: env.nodeEnv === 'production' ? 1 : 2,
    // Cold starts + Atlas DNS can exceed 5s on free tiers
    serverSelectionTimeoutMS: env.nodeEnv === 'production' ? 15000 : 5000,
    socketTimeoutMS: 45000,
    // Avoid IPv6 TLS handshake failures on some hosts (Render → Atlas)
    family: 4,
  };

  try {
    await mongoose.connect(env.mongoUri, options);
    console.log('MongoDB connected');
  } catch (err) {
    // Never silently fall back to localhost in production (Render has no local Mongo)
    if (env.nodeEnv === 'production') {
      console.error('MongoDB connection failed:', err.message);
      throw err;
    }

    console.warn(`Primary MongoDB connection failed (${err.message}). Falling back to local MongoDB...`);
    try {
      await mongoose.connect('mongodb://127.0.0.1:27017/fuse', options);
      console.log('MongoDB connected to local database (127.0.0.1:27017/fuse)');
    } catch (localErr) {
      console.error('Local MongoDB fallback also failed:', localErr.message);
      throw err;
    }
  }
}
