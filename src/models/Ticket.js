import mongoose from 'mongoose';
import { TICKET_STATUSES } from './constants.js';

const ticketSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
    },
    tierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TicketTier',
      required: true,
    },
    /** Short human-readable code shown on ticket / gate fallback */
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    /** HMAC-signed QR payload  -  unique, never reused */
    qrPayload: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: TICKET_STATUSES,
      default: 'valid',
    },
    /** Denormalized for gate scan (no populate required on hot path) */
    holderName: { type: String, required: true, trim: true, maxlength: 120 },
    holderEmail: { type: String, lowercase: true, trim: true, default: '' },
    holderPhone: { type: String, trim: true, default: '' },
    /** People covered by this QR (same tier). Length should match admitCount. */
    members: {
      type: [
        {
          name: { type: String, required: true, trim: true, maxlength: 120 },
          phone: { type: String, trim: true, maxlength: 32, default: '' },
          checkedIn: { type: Boolean, default: false },
          checkedInAt: { type: Date },
        },
      ],
      default: [],
      validate: [(arr) => arr.length <= 50, 'Max 50 members per ticket'],
    },
    /** How many people this QR admits (one QR per tier line in an order). */
    admitCount: { type: Number, default: 1, min: 1, max: 50 },
    /** Running count of members who have entered (denormalized). */
    checkedInCount: { type: Number, default: 0, min: 0, max: 50 },
    tierName: { type: String, required: true },
    tierColor: { type: String, default: '#64748B', maxlength: 7 },
    eventTitle: { type: String, required: true },
    scannedAt: { type: Date },
    scannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    scanAttempts: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

ticketSchema.index({ eventId: 1, status: 1 });
ticketSchema.index({ bookingId: 1, status: 1 });

export const Ticket = mongoose.model('Ticket', ticketSchema);
