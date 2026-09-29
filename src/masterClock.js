/**
 * src/masterClock.js
 * ─────────────────────────────────────────────────────────────────────────────
 * MasterClock – a pure helper that advances time through a schedule step.
 * It knows about:
 *   - Travel time
 *   - Wait for opening
 *   - Visit duration
 *   - Meal window detection (should a meal be inserted before this stop?)
 *
 * All times are in minutes from midnight (integer or float).
 */

import { parseTime, formatTime } from './utils/time.js';

/**
 * advanceClock(currentMin, travelMin, place, cfg?)
 *
 * Given we are at `currentMin` and travel takes `travelMin` minutes,
 * compute the timeline for visiting `place`.
 *
 * @param {number} currentMin   – current time (minutes from midnight)
 * @param {number} travelMin    – travel time to place
 * @param {object} place        – normalized place (open, close as minutes, duration)
 * @param {number} visitMin     – proposed visit duration
 * @returns {{ arrivalMin, waitMin, startMin, finishMin, slackMin, feasible }}
 */
export function advanceClock(currentMin, travelMin, place, visitMin) {
  const arrivalMin = currentMin + travelMin;
  const openTime   = place.openTime  ?? 0;
  const closeTime  = place.closeTime ?? 1440;

  const startMin  = Math.max(arrivalMin, openTime);
  const waitMin   = startMin - arrivalMin;
  const finishMin = startMin + visitMin;
  const slackMin  = closeTime - finishMin;
  const feasible  = slackMin >= 0;

  return { arrivalMin, waitMin, startMin, finishMin, slackMin, feasible };
}

/**
 * mealWindowHit(currentMin, nextStopStartMin, mealPrefs)
 *
 * Should we insert a meal break between now and the next stop?
 * Returns the meal type ('lunch'|'dinner'|null) if yes.
 *
 * @param {number} currentMin     – current time
 * @param {number} nextStopStart  – when next stop will begin
 * @param {object} mealPrefs      – user.meals object
 * @param {Set}    mealsServed    – already served meals
 * @returns {string|null}
 */
export function mealWindowHit(currentMin, nextStopStart, mealPrefs, mealsServed) {
  if (!mealPrefs) return null;

  for (const [type, pref] of Object.entries(mealPrefs)) {
    if (mealsServed.has(type)) continue;

    const winStart = parseTime(pref.windowStart);
    const winEnd   = parseTime(pref.windowEnd);
    const preferred= parseTime(pref.preferredTime);

    // We are in the window, and next stop starts after or at window start
    if (currentMin >= winStart && currentMin <= winEnd) return type;

    // Next stop would start after window closes → we are past preferred time
    if (nextStopStart > winEnd && currentMin <= winEnd) return type;

    // Preferred time falls between now and next stop start
    if (preferred >= currentMin && preferred <= nextStopStart) return type;
  }

  return null;
}

/**
 * buildMealEntry(mealType, currentMin, mealPref, currentLocation)
 * Creates a meal schedule entry at the current location (zero travel).
 */
export function buildMealEntry(mealType, currentMin, mealPref, currentLocation) {
  const preferred  = parseTime(mealPref.preferredTime ?? '13:00');
  const startMin   = Math.max(currentMin, preferred);
  const durationMin = mealPref.durationMin ?? 45;
  const endMin     = startMin + durationMin;
  const avgCost    = mealPref.avgCost ?? 0;

  return {
    type:          'meal',
    mealType,
    placeId:       currentLocation?.id ?? 'current',
    mode:          'none',
    startMin,
    endMin,
    travelMin:     0,
    waitMin:       0,
    visitMin:      durationMin,
    costTransport: 0,
    costEntry:     avgCost,
    kmFromPrev:    0,
  };
}

/**
 * timeLabel(minutes) – helper for human-readable output
 */
export function timeLabel(minutes) {
  return formatTime(Math.round(minutes));
}

export default { advanceClock, mealWindowHit, buildMealEntry, timeLabel };
