import mongoose from 'mongoose';
import { CURRENCIES } from './constants.js';

const ticketTierSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    /** Hex color for UI + ticket badge (e.g. #D4AF37) */
    color: { type: String, default: '#64748B', trim: true, maxlength: 7 },
    description: { type: String, default: '', maxlength: 500 },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: CURRENCIES, required: true },
    quantity: { type: Number, required: true, min: 0 },
    sold: { type: Number, default: 0, min: 0 },
    maxPerOrder: { type: Number, default: 10, min: 1, max: 50 },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    salesStartAt: { type: Date },
    salesEndAt: { type: Date },
  },
  { timestamps: true }
);

ticketTierSchema.virtual('remaining').get(function remaining() {
  return Math.max(0, this.quantity - this.sold);
});

ticketTierSchema.virtual('isSoldOut').get(function isSoldOut() {
  return this.sold >= this.quantity;
});

ticketTierSchema.set('toJSON', { virtuals: true });
ticketTierSchema.set('toObject', { virtuals: true });

ticketTierSchema.pre('validate', function ensureSoldCap() {
  if (this.sold > this.quantity) {
    throw new Error('sold cannot exceed quantity');
  }
});

/** One tier name per event */
ticketTierSchema.index({ eventId: 1, name: 1 }, { unique: true });
ticketTierSchema.index({ eventId: 1, isActive: 1, sortOrder: 1 });

export const TicketTier = mongoose.model('TicketTier', ticketTierSchema);
