import mongoose from 'mongoose';
import { SEAT_MAP_STATUSES } from './constants.js';

const rectSchema = new mongoose.Schema(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true, min: 1 },
    h: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const seatRowSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, maxlength: 4 },
    seats: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

/** Row name drawn at one end of a row. */
const rowLabelSchema = new mongoose.Schema(
  {
    tierKey: { type: String, required: true },
    text: { type: String, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    size: { type: Number, required: true },
  },
  { _id: false }
);

const seatMapTierSchema = new mongoose.Schema(
  {
    /** Client-generated stable id; seats reference their tier by this key. */
    key: { type: String, required: true, trim: true, maxlength: 40 },
    /** Linked TicketTier (created/updated on publish) - drives price, sold counts, checkout. */
    tierId: { type: mongoose.Schema.Types.ObjectId, ref: 'TicketTier', default: null },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    /** Seat label prefix derived from the name, e.g. VIP -> VIP-1 */
    prefix: { type: String, required: true, maxlength: 12 },
    color: { type: String, default: '#2563EB', maxlength: 7 },
    price: { type: Number, required: true, min: 0 },
    seatCount: { type: Number, required: true, min: 1 },
    /** Named rows, top to bottom (seats VIP-A-1...). Empty = auto grid (VIP-1...). */
    rows: { type: [seatRowSchema], default: [] },
    /** horizontal = rows run left to right; vertical = rows become columns (seat 1 at the top). */
    orientation: { type: String, enum: ['horizontal', 'vertical'], default: 'horizontal' },
    zone: { type: rectSchema, required: true },
  },
  { _id: false }
);

const seatSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    tierKey: { type: String, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    r: { type: Number, required: true },
  },
  { _id: false }
);

/**
 * One seat map per event. Seats are generated server-side from tier zones.
 * Live availability (held / sold) lives in SeatReservation, not here.
 */
const seatMapSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
      unique: true,
    },
    status: { type: String, enum: SEAT_MAP_STATUSES, default: 'draft' },
    canvas: {
      width: { type: Number, required: true },
      height: { type: Number, required: true },
      headerHeight: { type: Number, required: true },
    },
    stage: { type: rectSchema, required: true },
    maxSeatsPerOrder: { type: Number, default: 10, min: 1, max: 50 },
    tiers: {
      type: [seatMapTierSchema],
      default: [],
      validate: [(arr) => arr.length <= 12, 'Max 12 tiers per seat map'],
    },
    seats: {
      type: [seatSchema],
      default: [],
      validate: [(arr) => arr.length <= 5000, 'Max 5000 seats per seat map'],
    },
    rowLabels: { type: [rowLabelSchema], default: [] },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

export const SeatMap = mongoose.model('SeatMap', seatMapSchema);
