import mongoose from 'mongoose';
import { SEAT_RESERVATION_STATUSES } from './constants.js';

/**
 * A held or sold seat. The unique (eventId, label) index is what prevents
 * double booking: two buyers can never both insert the same seat.
 * Holds carry expiresAt (TTL cleanup); sold seats have no expiresAt.
 */
const seatReservationSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
    },
    label: { type: String, required: true, trim: true, maxlength: 30 },
    tierKey: { type: String, required: true },
    tierId: { type: mongoose.Schema.Types.ObjectId, ref: 'TicketTier', default: null },
    status: { type: String, enum: SEAT_RESERVATION_STATUSES, required: true },
    /** Random token held by the browser during checkout. */
    holdToken: { type: String, default: '' },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

seatReservationSchema.index({ eventId: 1, label: 1 }, { unique: true });
seatReservationSchema.index({ eventId: 1, holdToken: 1 });
seatReservationSchema.index({ bookingId: 1 });
/** Mongo removes expired holds on its own (runs about once a minute). */
seatReservationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SeatReservation = mongoose.model('SeatReservation', seatReservationSchema);
