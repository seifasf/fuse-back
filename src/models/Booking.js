import mongoose from 'mongoose';
import { CURRENCIES, BOOKING_STATUSES, PAYMENT_PROVIDERS } from './constants.js';

const bookingItemSchema = new mongoose.Schema(
  {
    tierId: { type: mongoose.Schema.Types.ObjectId, ref: 'TicketTier', required: true },
    /** Snapshot at purchase time — survives tier renames/price changes */
    tierName: { type: String, required: true },
    qty: { type: Number, required: true, min: 1, max: 50 },
    unitPrice: { type: Number, required: true, min: 0 },
    tierColor: { type: String, default: '#64748B', maxlength: 7 },
    /** One entry per admit — length must match qty (name + phone for each person). */
    members: {
      type: [
        {
          name: { type: String, required: true, trim: true, maxlength: 120 },
          phone: { type: String, required: true, trim: true, maxlength: 32 },
        },
      ],
      default: [],
      validate: [(arr) => arr.length <= 50, 'Max 50 members per line'],
    },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    guest: {
      name: { type: String, required: true, trim: true, maxlength: 120 },
      email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        maxlength: 254,
      },
      phone: { type: String, default: '', trim: true, maxlength: 32 },
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
    },
    /** Extended reference — avoid join on admin booking lists */
    eventSnapshot: {
      title: { type: String, default: '' },
      country: { type: String, default: '' },
      startsAt: { type: Date },
      venue: { type: String, default: '' },
    },
    items: {
      type: [bookingItemSchema],
      validate: [(arr) => arr.length >= 1 && arr.length <= 10, '1–10 line items required'],
    },
    ticketCount: { type: Number, required: true, min: 1 },
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: CURRENCIES, required: true },
    status: {
      type: String,
      enum: BOOKING_STATUSES,
      default: 'pending',
    },
    paymentProvider: {
      type: String,
      enum: PAYMENT_PROVIDERS,
      default: 'mock',
    },
    paymentRef: { type: String, default: '' },
    paidAt: { type: Date },
    cancelledAt: { type: Date },
    refundedAt: { type: Date },
    /** Delivery tracking */
    emailSentAt: { type: Date },
    whatsappSentAt: { type: Date },
    /** Pending bookings expire after TTL window (set by app) */
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

bookingSchema.index({ 'guest.email': 1, createdAt: -1 });
bookingSchema.index({ eventId: 1, status: 1, createdAt: -1 });
bookingSchema.index({ clientId: 1, status: 1 });
bookingSchema.index({ paymentRef: 1 });
bookingSchema.index({ status: 1, expiresAt: 1 });
bookingSchema.index({ status: 1, 'eventSnapshot.country': 1, eventId: 1 });
bookingSchema.index({ status: 1, 'items.tierName': 1 });

export const Booking = mongoose.model('Booking', bookingSchema);
