import mongoose from 'mongoose';
import { SCAN_RESULTS } from './constants.js';

/**
 * Append-only audit log for every gate scan attempt.
 * Kept separate from Ticket so duplicate/fraud attempts don't bloat ticket docs.
 */
const scanLogSchema = new mongoose.Schema(
  {
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket' },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    result: { type: String, enum: SCAN_RESULTS, required: true },
    holderName: { type: String, default: '' },
    tierName: { type: String, default: '' },
    code: { type: String, default: '' },
    message: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

scanLogSchema.index({ eventId: 1, createdAt: -1 });
scanLogSchema.index({ agentId: 1, createdAt: -1 });
scanLogSchema.index({ ticketId: 1, createdAt: -1 });

export const ScanLog = mongoose.model('ScanLog', scanLogSchema);
