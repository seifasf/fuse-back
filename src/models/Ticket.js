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
    /** HMAC-signed QR payload — unique, never reused */
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
