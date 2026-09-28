/**
 * src/constraints/a7_booking.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A7 — Booking / Reservation Constraints
 *
 *   y_i <= F_ik   (can only visit if a confirmed, un-expired slot exists)
 *   slot must satisfy:
 *     1. Same date as planned visit
 *     2. slot.available == true AND slot.confirmed == true
 *     3. visit_start >= slot.start  AND  visit_end <= slot.end (fullDurationInSlot=true)
 *     4. bookingCutoff not yet passed (if cutoff present)
 *     5. Capacity >= partySize (simplified: slot.capacity >= partySize)
 *
 *   If booking.required == false or booking == null: constraint is trivially met.
 */

import { formatTime } from '../utils/time.js';

/**
 * Find the best available slot for a visit at a given time.
 *
 * @param {{
 *   required: boolean,
 *   slots: {
 *     slotId: string,
 *     date: string,
 *     start: number,    - minutes
 *     end: number,      - minutes
 *     capacity: number,
 *     available: boolean,
 *     confirmed: boolean,
 *     cutoff: string,   - ISO datetime of booking cutoff
 *   }[]
 * }|null} booking
 * @param {string} visitDate          YYYY-MM-DD
 * @param {number} visitStartMin      proposed visit start
 * @param {number} visitEndMin        proposed visit end
 * @param {Date}   bookingTimeNow     current booking datetime (for cutoff check)
 * @param {number} partySize
 * @param {boolean} [fullDurationInSlot=true]  visit must fit entirely within slot
 * @returns {{
 *   feasible: boolean,
 *   slot: object|null,
 *   failure_reason: string|null
 * }}
 */
export function checkBooking(
  booking, visitDate, visitStartMin, visitEndMin, bookingTimeNow, partySize,
  fullDurationInSlot = true
) {
  // No booking required
  if (!booking || !booking.required) {
    return { feasible: true, slot: null, failure_reason: null };
  }

  const now = bookingTimeNow instanceof Date ? bookingTimeNow : new Date(bookingTimeNow);

  const candidateSlots = (booking.slots ?? []).filter((slot) => {
    // 1. Same date
    if (slot.date !== visitDate) return false;
    // 2. Available and confirmed
    if (!slot.available || !slot.confirmed) return false;
    // 3. Capacity
    if ((slot.capacity ?? Infinity) < partySize) return false;
    // 4. Cutoff not passed
    if (slot.cutoff) {
      const cutoffDate = new Date(slot.cutoff);
      if (now > cutoffDate) return false;
    }
    // 5. Visit fits in slot
    if (fullDurationInSlot) {
      return visitStartMin >= slot.start && visitEndMin <= slot.end;
    } else {
      // Partial fit: at least some overlap
      return visitStartMin < slot.end && visitEndMin > slot.start;
    }
  });

  if (candidateSlots.length === 0) {
    return {
      feasible: false,
      slot: null,
      failure_reason: _bookingFailureReason(booking, visitDate, visitStartMin, visitEndMin, partySize, now, fullDurationInSlot),
    };
  }

  // Prefer slot with most remaining capacity (greedy)
  candidateSlots.sort((a, b) => (b.capacity ?? Infinity) - (a.capacity ?? Infinity));
  return { feasible: true, slot: candidateSlots[0], failure_reason: null };
}

function _bookingFailureReason(booking, visitDate, visitStartMin, visitEndMin, partySize, now, fullDurationInSlot) {
  const allSlots = booking.slots ?? [];
  const dateSlots = allSlots.filter((s) => s.date === visitDate);

  if (dateSlots.length === 0) return `No slots available on ${visitDate}`;

  const expired  = dateSlots.filter((s) => s.cutoff && new Date(s.cutoff) < now);
  const noRoom   = dateSlots.filter((s) => (s.capacity ?? Infinity) < partySize);
  const noFit    = dateSlots.filter((s) => {
    if (!s.available || !s.confirmed) return false;
    return fullDurationInSlot
      ? !(visitStartMin >= s.start && visitEndMin <= s.end)
      : !(visitStartMin < s.end && visitEndMin > s.start);
  });
  const unavail  = dateSlots.filter((s) => !s.available || !s.confirmed);

  if (unavail.length === dateSlots.length) return `All slots on ${visitDate} are unavailable/unconfirmed`;
  if (expired.length  > 0)  return `Booking cutoff has passed for ${expired.length} slot(s)`;
  if (noRoom.length   > 0)  return `Insufficient capacity for party of ${partySize}`;
  if (noFit.length    === dateSlots.filter((s) => s.available && s.confirmed).length)
    return `No slot fits visit ${formatTime(visitStartMin)}-${formatTime(visitEndMin)} on ${visitDate}`;

  return `No valid booking slot found for ${visitDate}`;
}

// ── Slot selection for solver ─────────────────────────────────────────────────

/**
 * Given a confirmed slot, compute the visit start/end times.
 * If the solver proposes a visit BEFORE the slot starts, snap to slot start.
 *
 * @param {object} slot
 * @param {number} proposedStartMin   - proposed start (from A1 propagation)
 * @param {number} durationMin
 * @param {number} closeTime          - place closing time (A1)
 * @returns {{ start: number, end: number, feasible: boolean }}
 */
export function snapToSlot(slot, proposedStartMin, durationMin, closeTime) {
  const start = Math.max(proposedStartMin, slot.start);
  const end   = start + durationMin;
  const feasible = end <= slot.end && end <= closeTime;
  return { start, end, feasible };
}
