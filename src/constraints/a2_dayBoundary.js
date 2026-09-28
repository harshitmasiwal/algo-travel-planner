/**
 * src/constraints/a2_dayBoundary.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A2 — Day Boundary Constraints
 *
 *   R = f_last + T_last,end          (return arrival time)
 *   R <= day_end
 *   f_i <= day_end  for every stop i
 *   total_day_time = sum(travel incl. return) + sum(visit) + sum(waiting)
 *   available_time = day_end - currentTime
 *   feasible iff R <= day_end  (equivalently total_day_time <= available_time)
 *
 * Output: { day_time_feasible, total_day_time, available_time,
 *           return_arrival_time, remaining_time, time_overrun, failure_reason }
 */

import { formatTime } from '../utils/time.js';

/**
 * Check A2 day boundary feasibility for a proposed schedule.
 *
 * @param {{
 *   stops: { travelMin: number, waiting: number }[],   // from propagateSchedule
 *   visitDurations: number[],                          // parallel array
 *   lastFinishMin: number,                             // finish time of last stop
 *   lastStopId: string,
 *   endLocationId: string,
 *   dayStartMin: number,
 *   dayEndMin: number,
 *   currentTimeMin: number,                            // time we start planning from
 *   returnTravelMin: number,                           // T_last,end
 * }} params
 * @returns {{
 *   day_time_feasible: boolean,
 *   total_day_time: number,
 *   available_time: number,
 *   return_arrival_time: number,
 *   return_arrival_formatted: string,
 *   remaining_time: number,
 *   time_overrun: number,
 *   failure_reason: string|null
 * }}
 */
export function checkDayBoundary({
  stops,
  visitDurations,
  lastFinishMin,
  returnTravelMin,
  dayEndMin,
  currentTimeMin,
}) {
  // Sum up components
  let totalTravel  = 0;
  let totalVisit   = 0;
  let totalWaiting = 0;

  for (let i = 0; i < stops.length; i++) {
    totalTravel  += stops[i].travelMin;
    totalVisit   += visitDurations[i];
    totalWaiting += stops[i].waiting;
  }
  totalTravel += returnTravelMin;  // include return leg

  const total_day_time      = totalTravel + totalVisit + totalWaiting;
  const available_time      = dayEndMin - currentTimeMin;
  const return_arrival_time = lastFinishMin + returnTravelMin;
  const feasible            = return_arrival_time <= dayEndMin;
  const time_overrun        = Math.max(0, return_arrival_time - dayEndMin);
  const remaining_time      = dayEndMin - return_arrival_time;

  // Also check no individual finish exceeds dayEnd
  let earlyViolation = null;
  for (const stop of stops) {
    // stop.finish is carried in the stop object by propagateSchedule
    if (stop.finish !== undefined && stop.finish > dayEndMin) {
      earlyViolation = `Stop "${stop.placeId}" finish ${formatTime(stop.finish)} exceeds day end ${formatTime(dayEndMin)}`;
      break;
    }
  }

  let failure_reason = null;
  if (!feasible) {
    failure_reason =
      `Return arrival ${formatTime(return_arrival_time)} exceeds day end ${formatTime(dayEndMin)} ` +
      `(overrun ${time_overrun} min)`;
  } else if (earlyViolation) {
    failure_reason = earlyViolation;
  }

  return {
    day_time_feasible:        feasible && !earlyViolation,
    total_day_time,
    available_time,
    return_arrival_time,
    return_arrival_formatted: formatTime(return_arrival_time),
    remaining_time,
    time_overrun,
    failure_reason,
  };
}

/**
 * Quick feasibility check: can we add a new stop and still return in time?
 *
 * @param {number} currentFinishMin  - current position finish time
 * @param {number} travelToNewMin    - travel to new stop
 * @param {number} openTime          - new stop open time
 * @param {number} closeTime         - new stop close time
 * @param {number} durationMin       - visit duration
 * @param {number} travelToEndMin    - travel from new stop back to end location
 * @param {number} dayEndMin
 * @returns {boolean}
 */
export function canFitStop(
  currentFinishMin, travelToNewMin, openTime, closeTime,
  durationMin, travelToEndMin, dayEndMin
) {
  const arrivalAtNew = currentFinishMin + travelToNewMin;
  const startAtNew   = Math.max(arrivalAtNew, openTime);
  const finishAtNew  = startAtNew + durationMin;
  if (finishAtNew > closeTime) return false;         // A1 violation
  const returnArrival = finishAtNew + travelToEndMin;
  return returnArrival <= dayEndMin;                 // A2 check
}
