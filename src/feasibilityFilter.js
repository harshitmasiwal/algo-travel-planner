/**
 * src/feasibilityFilter.js
 * ─────────────────────────────────────────────────────────────────────────────
 * FeasibilityFilter – applies A1-A9 hard constraints to the candidate list
 * and returns only the feasible ones with their best transport leg.
 *
 * For each candidate:
 *   1. A9: safety/hazard check on the place itself
 *   2. A5: availability on this date/day
 *   3. A6: find best feasible transport mode
 *   4. A9: route safety (road closure on selected mode's road)
 *   5. A1: time-window feasibility (arrival, open, close, finish)
 *   6. A2: day-boundary check (will we make it back to hotel?)
 *   7. A3: visit duration feasible
 *   8. A4: budget check (transport + entry)
 *   9. A7: booking slot check (if required)
 *  10. A8: mandated include/exclude
 */

import { checkPlaceSafety, checkTransportSafety } from './constraints/a9_safety.js';
import { checkAvailability }                       from './constraints/a5_availability.js';
import { selectBestMode }                          from './constraints/a6_transport.js';
import { checkTimeWindow }                         from './constraints/a1_timeWindows.js';
import { canFitStop }                              from './constraints/a2_dayBoundary.js';
import { checkVisitDuration }                      from './constraints/a3_visitDuration.js';
import { checkIncrementalBudget, computeTransportCost } from './constraints/a4_budget.js';
import { checkBooking }                            from './constraints/a7_booking.js';
import { checkMandatedPlace }                      from './constraints/a8_mandated.js';

/**
 * @typedef {object} FeasibleCandidate
 * @property {object}  place
 * @property {string}  mode
 * @property {number}  travelMin
 * @property {number}  km
 * @property {number}  arrivalMin
 * @property {number}  startMin      – max(arrival, opening)
 * @property {number}  waitMin
 * @property {number}  finishMin
 * @property {number}  slackMin
 * @property {number}  visitMin      – duration used (ideal, clamped)
 * @property {string}  directness
 * @property {number}  transfers
 * @property {object}  [bookingSlot]
 */

/**
 * filterFeasible(candidates, state, context, cfg?)
 *
 * @param {object[]}  candidates   – from candidateGenerator
 * @param {object}    state        – DayStateManager snapshot
 * @param {object}    context      – { weather, user, travelMatrix, trip, allDayPools, serviceWindows }
 * @param {object}    cfg          – config
 * @returns {FeasibleCandidate[]}
 */
export function filterFeasible(candidates, state, context, cfg) {
  const { weather, user, travelMatrix, trip, serviceWindows = {} } = context;
  const fromId   = state.currentLocation.id ?? state.hotel.id;
  const now      = state.currentTimeMin;
  const results  = [];

  for (const place of candidates) {
    // ── A8: mandated exclude ───────────────────────────────────────────────
    const mandated = checkMandatedPlace(place, user);
    if (!mandated.allowed) continue;

    // ── A9: place safety ──────────────────────────────────────────────────
    const safety = checkPlaceSafety(place, state.date, now, weather, {});
    if (!safety.safe) continue;

    // ── A5: availability ──────────────────────────────────────────────────
    const availCtx = { closures: new Set(context.closures ?? []) };
    const avail = checkAvailability(
      place, state.date, state.dayIndex ?? 0, now,
      now + (place.duration?.ideal ?? 60),
      Object.keys(user.modePreference ?? {}),
      availCtx,
    );
    if (!avail.available) continue;

    // ── A6: best feasible transport mode ──────────────────────────────────
    const legOptions = travelMatrix[fromId]?.[place.id] ?? {};
    const modeResult = selectBestMode(legOptions, user, state.date, now, serviceWindows, cfg);
    if (!modeResult.feasible) continue;

    const { mode, travelMin, km, directness, transfers } = modeResult;

    // ── A9: transport safety ──────────────────────────────────────────────
    const tSafe = checkTransportSafety(mode, state.date, now, {}, cfg, weather);
    if (!tSafe.T_safe) continue;

    // ── A1: time-window ───────────────────────────────────────────────────
    const arrivalMin = now + travelMin;
    const visitMin   = place.duration?.ideal ?? 60;
    const tw = checkTimeWindow(place, arrivalMin, visitMin);
    if (!tw.feasible) continue;

    // ── A2: day boundary ──────────────────────────────────────────────────
    const returnLeg = travelMatrix[place.id]?.[state.hotel.id] ?? {};
    const returnModeResult = selectBestMode(returnLeg, user, state.date, tw.finishMin, serviceWindows, cfg);
    const returnMin = returnModeResult.feasible ? returnModeResult.travelMin : (cfg.speeds?.taxi ? (0) : 30);
    if (!canFitStop(tw.finishMin, returnMin, state.dayEnd)) continue;

    // ── A3: visit duration ────────────────────────────────────────────────
    const durCheck = checkVisitDuration(place, visitMin);
    if (!durCheck.feasible) continue;

    // ── A4: budget ────────────────────────────────────────────────────────
    const transportCost = computeTransportCost(mode, km, trip?.partySize ?? 1, cfg);
    const entryCost = (place.cost ?? 0) * (trip?.partySize ?? 1);
    const budgetOk = checkIncrementalBudget(transportCost + entryCost, state.budgetRemaining);
    if (!budgetOk.feasible) continue;

    // ── A7: booking ───────────────────────────────────────────────────────
    let bookingSlot = null;
    if (place.booking?.required) {
      const bookRes = checkBooking(place, state.date, tw.startMin, visitMin, cfg);
      if (!bookRes.feasible) continue;
      bookingSlot = bookRes.slot;
    }

    results.push({
      place,
      mode,
      travelMin,
      km,
      arrivalMin,
      startMin:  tw.startMin,
      waitMin:   tw.waitingMin,
      finishMin: tw.finishMin,
      slackMin:  tw.slackMin,
      visitMin,
      directness,
      transfers,
      transportCost,
      entryCost,
      bookingSlot,
    });
  }

  return results;
}

export default filterFeasible;
