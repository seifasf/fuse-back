import crypto from 'node:crypto';
import { Booking } from '../models/Booking.js';
import { TicketTier } from '../models/TicketTier.js';
import { AppError } from '../utils/AppError.js';
import { cacheDel } from '../utils/memoryCache.js';
import { releaseBookingSeats } from './seatMapService.js';

export function generateAccessKey() {
  return crypto.randomBytes(24).toString('hex');
}

export function accessKeyMatches(booking, key) {
  const expected = String(booking?.accessKey || '');
  const given = String(key || '');
  if (!expected || expected.length !== given.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

function qtyByTier(items) {
  const map = new Map();
  for (const item of items || []) {
    const id = String(item.tierId);
    map.set(id, (map.get(id) || 0) + Math.max(0, Number(item.qty) || 0));
  }
  return map;
}

/**
 * Holds tier capacity for an order waiting for approval. Atomic per tier, so two orders can never
 * take the last tickets together; rolls back the tiers already held if one is sold out.
 */
export async function reserveTierCapacity(items) {
  const held = [];
  for (const [tierId, qty] of qtyByTier(items)) {
    const ok = await TicketTier.findOneAndUpdate(
      {
        _id: tierId,
        isActive: true,
        $expr: { $lte: [{ $add: ['$sold', { $ifNull: ['$reserved', 0] }, qty] }, '$quantity'] },
      },
      { $inc: { reserved: qty } },
      { new: true, projection: { name: 1 } }
    ).lean();
    if (!ok) {
      await releaseTierCapacity(held);
      const tier = await TicketTier.findById(tierId).select('name').lean();
      throw new AppError(`Not enough tickets for ${tier?.name || 'this tier'}`, 400, 'SOLD_OUT');
    }
    held.push({ tierId, qty });
  }
}

export async function releaseTierCapacity(items) {
  await Promise.all(
    [...qtyByTier(items)].map(([tierId, qty]) =>
      TicketTier.updateOne({ _id: tierId, reserved: { $gte: qty } }, { $inc: { reserved: -qty } })
    )
  );
}

/** Reserved -> sold for an approved order. */
export async function convertReservedToSold(items) {
  await Promise.all(
    [...qtyByTier(items)].map(async ([tierId, qty]) => {
      const res = await TicketTier.updateOne(
        { _id: tierId, reserved: { $gte: qty } },
        { $inc: { reserved: -qty, sold: qty } }
      );
      if (!res.modifiedCount) await TicketTier.updateOne({ _id: tierId }, { $inc: { sold: qty } });
    })
  );
}

/**
 * Moves a pending_approval order to rejected / expired / cancelled. Only the caller that wins the
 * status claim releases its seats and capacity, so this is safe to race with approve or another sweep.
 */
export async function closePendingOrder(bookingId, status, fields = {}) {
  const claimed = await Booking.findOneAndUpdate(
    { _id: bookingId, status: 'pending_approval' },
    { $set: { status, ...fields } },
    { new: true }
  );
  if (!claimed) return null;
  if (claimed.items.some((item) => item.seats?.length)) await releaseBookingSeats(claimed._id);
  await releaseTierCapacity(claimed.items);
  cacheDel('public:');
  return claimed;
}

/** Expires orders whose approval window has passed and frees their seats and tickets. */
export async function expireStaleApprovals() {
  const stale = await Booking.find({ status: 'pending_approval', expiresAt: { $lte: new Date() } })
    .select('_id')
    .limit(200)
    .lean();
  let expired = 0;
  for (const b of stale) {
    if (await closePendingOrder(b._id, 'expired', { expiredAt: new Date() })) expired += 1;
  }
  if (expired) console.log(`[approvals] expired ${expired} order(s) waiting for approval`);
  return expired;
}

let sweepTimer = null;

export function startApprovalExpirySweep(intervalMs = 60_000) {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    expireStaleApprovals().catch((err) => console.error('[approvals] sweep failed:', err?.message || err));
  }, intervalMs);
  sweepTimer.unref?.();
}
