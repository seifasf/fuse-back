import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB() {
  mongoose.set('strictQuery', true);

  try {
    // Atlas / long-running Node API: modest pool, fail fast on bad network
    await mongoose.connect(env.mongoUri, {
      maxPoolSize: 20,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('MongoDB connected to primary database');
  } catch (err) {
    console.warn(`Primary MongoDB connection failed (${err.message}). Falling back to local MongoDB...`);
    try {
      await mongoose.connect('mongodb://localhost:27017/fuse', {
        maxPoolSize: 20,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      console.log('MongoDB connected to local database (localhost:27017/fuse)');
    } catch (localErr) {
      console.error('Local MongoDB fallback also failed:', localErr.message);
      throw err;
    }
  }
}
