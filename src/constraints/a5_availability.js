/**
 * src/constraints/a5_availability.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A5 — Location / Availability Constraints
 *
 *   A_i = a_avail * a_access * a_reach * a_restriction   (each in {0,1})
 *   y_i <= A_i
 *
 * Mapping:
 *   a_avail      = operating day (closedDays, temporaryClosures at planned time)
 *   a_access     = no access restriction
 *   a_reach      = reachable (at least one transport mode feasible)
 *   a_restriction= no legal/special restriction
 *   eligibleDays = hard gate on which trip-day indices this place may be visited
 *
 * Reason codes: TEMPORARILY_CLOSED, CLOSED_DAY, ACCESS_RESTRICTED, NOT_REACHABLE,
 *               RESTRICTED, NOT_ELIGIBLE_DAY
 */

// ── Day-of-week helper ────────────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Return the short weekday name for a YYYY-MM-DD date string.
 * @param {string} dateStr  YYYY-MM-DD
 * @returns {string} e.g. 'Mon'
 */
function weekdayOf(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return DAY_NAMES[d.getUTCDay()];
}

// ── Temporary closure check ───────────────────────────────────────────────────

/**
 * Check if a temporary closure blocks a visit at a given time.
 *
 * @param {{ date: string, from: number, to: number }[]} temporaryClosures
 * @param {string} visitDate      YYYY-MM-DD
 * @param {number} visitStartMin  proposed visit start (minutes since 00:00)
 * @param {number} visitEndMin    proposed visit end
 * @returns {{ blocked: boolean, closure: object|null }}
 */
function checkTemporaryClosure(temporaryClosures, visitDate, visitStartMin, visitEndMin) {
  for (const tc of temporaryClosures) {
    if (tc.date !== visitDate) continue;
    // Blocked if the visit overlaps with the closure window
    const overlap = visitStartMin < tc.to && visitEndMin > tc.from;
    if (overlap) return { blocked: true, closure: tc };
  }
  return { blocked: false, closure: null };
}

// ── Main availability check ───────────────────────────────────────────────────

/**
 * Check full A5 availability for a place on a given day/time.
 *
 * @param {{
 *   id: string,
 *   closedDays: string[],
 *   temporaryClosures: { date: string, from: number, to: number }[],
 *   accessRestricted: boolean,
 *   restricted: boolean,
 *   eligibleDays: number[]|null,
 *   transportAccess: string[],
 * }} place
 * @param {string}   visitDate      YYYY-MM-DD
 * @param {number}   dayIndex       which trip-day (0-based)
 * @param {number}   visitStartMin  proposed start (minutes)
 * @param {number}   visitEndMin    proposed end (minutes)
 * @param {string[]} allowedModes   from user.allowedModes
 * @param {object}   context        normalised context (closures Set, etc.)
 * @returns {{
 *   place_id: string,
 *   available: boolean,
 *   access_allowed: boolean,
 *   reachable: boolean,
 *   restricted: boolean,
 *   eligible: boolean,
 *   reason: string|null
 * }}
 */
export function checkAvailability(
  place, visitDate, dayIndex, visitStartMin, visitEndMin, allowedModes, context
) {
  // ── a_avail: operating day ──────────────────────────────────────────────
  // 1. context.closures (official full-day closure)
  if (context.closures.has(`${place.id}|${visitDate}`)) {
    return _build(place.id, false, true, true, false, true, 'TEMPORARILY_CLOSED');
  }

  // 2. closedDays (regular weekly closure)
  const weekday = weekdayOf(visitDate);
  if (place.closedDays.includes(weekday)) {
    return _build(place.id, false, true, true, false, true, 'CLOSED_DAY');
  }

  // 3. temporaryClosures (partial-day)
  const tcResult = checkTemporaryClosure(
    place.temporaryClosures, visitDate, visitStartMin, visitEndMin
  );
  if (tcResult.blocked) {
    return _build(place.id, false, true, true, false, true, 'TEMPORARILY_CLOSED');
  }

  // ── a_access: no access restriction ────────────────────────────────────
  if (place.accessRestricted) {
    return _build(place.id, false, false, true, false, true, 'ACCESS_RESTRICTED');
  }

  // ── a_restriction: no legal restriction ────────────────────────────────
  if (place.restricted) {
    return _build(place.id, false, true, true, true, true, 'RESTRICTED');
  }

  // ── eligibleDays gate ───────────────────────────────────────────────────
  if (place.eligibleDays !== null && !place.eligibleDays.includes(dayIndex)) {
    return _build(place.id, false, true, true, false, false, 'NOT_ELIGIBLE_DAY');
  }

  // ── a_reach: at least one mode in common ───────────────────────────────
  const reachable = place.transportAccess.some((m) => allowedModes.includes(m));
  if (!reachable) {
    return _build(place.id, false, true, false, false, true, 'NOT_REACHABLE');
  }

  return _build(place.id, true, true, true, false, true, null);
}

function _build(placeId, available, access_allowed, reachable, restrictedFlag, eligible, reason) {
  return { place_id: placeId, available, access_allowed, reachable, restricted: restrictedFlag, eligible, reason };
}

// ── Time-dependent availability ───────────────────────────────────────────────

/**
 * Check if a temporary closure blocks a visit at a SPECIFIC proposed start time
 * (used for partial-day closures like 14:00-16:00).
 *
 * Per spec example: closure 14:00-16:00 blocks a 15:00 visit but NOT a 16:00 one.
 *
 * @param {{ date: string, from: number, to: number }[]} temporaryClosures
 * @param {string} visitDate
 * @param {number} visitStartMin  - only the start time is checked (open-ended)
 * @returns {boolean} true if blocked
 */
export function isBlockedByTemporaryClosure(temporaryClosures, visitDate, visitStartMin) {
  for (const tc of temporaryClosures) {
    if (tc.date !== visitDate) continue;
    // Start must be strictly before the closure ends, AND start is >= closure from
    // i.e. visitStartMin is INSIDE [from, to)
    if (visitStartMin >= tc.from && visitStartMin < tc.to) return true;
  }
  return false;
}
