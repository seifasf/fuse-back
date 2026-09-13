import mongoose from 'mongoose';
import { COUNTRIES } from './constants.js';

const characterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 140,
    },
    bio: { type: String, default: '', maxlength: 5000 },
    image: { type: String, default: '' },
    tags: {
      type: [{ type: String, trim: true, lowercase: true, maxlength: 40 }],
      default: [],
      validate: [(arr) => arr.length <= 20, 'Max 20 tags'],
    },
    country: { type: String, enum: COUNTRIES },
    socials: {
      instagram: { type: String, default: '' },
      soundcloud: { type: String, default: '' },
      spotify: { type: String, default: '' },
    },
    relatedEventIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Event' }],
      default: [],
      validate: [(arr) => arr.length <= 100, 'Max 100 related events'],
    },
    featured: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

characterSchema.index({ featured: 1, sortOrder: 1, name: 1 });
characterSchema.index({ deletedAt: 1 });

export const Character = mongoose.model('Character', characterSchema);
