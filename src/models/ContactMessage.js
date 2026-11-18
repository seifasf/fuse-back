import mongoose from 'mongoose';
import { CONTACT_TOPICS } from './constants.js';

const contactMessageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    phone: { type: String, default: '', trim: true, maxlength: 40 },
    topic: {
      type: String,
      enum: CONTACT_TOPICS,
      default: 'other',
      index: true,
    },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    status: {
      type: String,
      enum: ['new', 'read', 'archived'],
      default: 'new',
      index: true,
    },
    source: { type: String, default: 'website', maxlength: 40 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

contactMessageSchema.index({ createdAt: -1 });
contactMessageSchema.index({ status: 1, createdAt: -1 });
contactMessageSchema.index({ topic: 1, createdAt: -1 });
contactMessageSchema.index({ email: 1, createdAt: -1 });

export const ContactMessage = mongoose.model('ContactMessage', contactMessageSchema);
