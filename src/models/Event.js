import mongoose from 'mongoose';
import {
  COUNTRIES,
  EVENT_STATUSES,
  EVENT_CATEGORIES,
  currencyForCountry,
} from './constants.js';

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 220,
    },
    description: { type: String, default: '', maxlength: 10000 },
    country: { type: String, enum: COUNTRIES, required: true },
    city: { type: String, trim: true, default: '', maxlength: 100 },
    venue: { type: String, required: true, trim: true, maxlength: 200 },
    address: { type: String, trim: true, default: '', maxlength: 300 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date },
    timezone: { type: String, default: 'Africa/Cairo' },
    category: {
      type: String,
      enum: EVENT_CATEGORIES,
      default: 'club night',
    },
    /** Cover / hero image (first display). `images` holds the rest of the gallery for the event page. */
    coverImage: { type: String, default: '' },
    images: {
      type: [{ type: String }],
      default: [],
      validate: [(arr) => arr.length <= 30, 'Max 30 images'],
    },
    /** Past-event photo recap (bounded) */
    gallery: {
      type: [{ type: String }],
      default: [],
      validate: [(arr) => arr.length <= 50, 'Max 50 gallery images'],
    },
    recap: { type: String, default: '', maxlength: 5000 },
    status: {
      type: String,
      enum: EVENT_STATUSES,
      default: 'draft',
    },
    capacity: { type: Number, default: 500, min: 0, max: 500000 },
    featured: { type: Boolean, default: false },
    /** Cached counters — updated on booking confirm / gate scan */
    ticketsSold: { type: Number, default: 0, min: 0 },
    checkInCount: { type: Number, default: 0, min: 0 },
    attendanceCount: { type: Number, default: 0, min: 0 },
    characterIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Character' }],
      default: [],
      validate: [(arr) => arr.length <= 40, 'Max 40 characters per event'],
    },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

eventSchema.virtual('currency').get(function currency() {
  return currencyForCountry(this.country);
});

eventSchema.set('toJSON', { virtuals: true });
eventSchema.set('toObject', { virtuals: true });

/** Public listing: country + status + date */
eventSchema.index({ country: 1, status: 1, startsAt: 1 });
/** Homepage featured */
eventSchema.index({ featured: 1, status: 1, startsAt: 1 });
/** Soft-delete filter */
eventSchema.index({ deletedAt: 1, status: 1 });
eventSchema.index({ category: 1, status: 1 });

export const Event = mongoose.model('Event', eventSchema);
