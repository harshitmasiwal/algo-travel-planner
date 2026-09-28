/**
 * src/constraints/a1_timeWindows.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A1 — Time Window Constraints
 *
 * Core propagation (for consecutive stop p → i):
 *   arrival_i   = finish_p + T[p][i]
 *   start_i     = max(arrival_i, openTime_i)
 *   waiting_i   = start_i - arrival_i
 *   finish_i    = start_i + duration_i
 *   feasible    iff finish_i <= closeTime_i
 *   timeSlack_i = closeTime_i - finish_i
 *
 * Waiting is NOT a violation in A1; B5 penalises it in scoring.
 *
 * Output per stop: { feasible, arrival_time, visit_start_time,
 *   visit_end_time, waiting_time, opening_time, closing_time,
 *   time_slack, failure_reason }
 */

import { formatTime } from '../utils/time.js';

// ── Single stop check ─────────────────────────────────────────────────────────

/**
 * Check whether a single stop is time-window feasible.
 *
 * @param {{openTime:number, closeTime:number, duration:{min:number,max:number,ideal:number}}} place
 * @param {number} arrivalMin   - minutes since 00:00 when we arrive
 * @param {number} durationMin  - proposed visit duration (minutes)
 * @returns {{
 *   feasible: boolean,
 *   arrival_time: string,
 *   visit_start_time: string,
 *   visit_end_time: string,
 *   waiting_time: number,
 *   opening_time: string,
 *   closing_time: string,
 *   time_slack: number,
 *   failure_reason: string|null
 * }}
 */
export function checkTimeWindow(place, arrivalMin, durationMin) {
  const { openTime, closeTime } = place;
  const startMin   = Math.max(arrivalMin, openTime);
  const waitingMin = startMin - arrivalMin;         // always >= 0
  const finishMin  = startMin + durationMin;
  const slackMin   = closeTime - finishMin;
  const feasible   = finishMin <= closeTime;

  let failure_reason = null;
  if (!feasible) {
    failure_reason =
      `Finish ${formatTime(finishMin)} exceeds closing ${formatTime(closeTime)} ` +
      `(overrun ${finishMin - closeTime} min)`;
  }
  // Secondary check: window too narrow for any valid duration
  if (openTime >= closeTime) {
    return {
      feasible: false, arrival_time: formatTime(arrivalMin),
      visit_start_time: formatTime(startMin), visit_end_time: formatTime(finishMin),
      waiting_time: waitingMin, opening_time: formatTime(openTime),
      closing_time: formatTime(closeTime), time_slack: slackMin,
      failure_reason: `Invalid window: openTime ${formatTime(openTime)} >= closeTime ${formatTime(closeTime)}`,
    };
  }

  return {
    feasible,
    arrival_time:      formatTime(arrivalMin),
    visit_start_time:  formatTime(startMin),
    visit_end_time:    formatTime(finishMin),
    waiting_time:      waitingMin,
    opening_time:      formatTime(openTime),
    closing_time:      formatTime(closeTime),
    time_slack:        slackMin,
    failure_reason,
  };
}

// ── Raw numeric propagation (used by solver/simulation) ──────────────────────

/**
 * Propagate time for one stop — returns raw minutes.
 *
 * @param {number} prevFinishMin  - finish time of previous stop (or day start + travel for first)
 * @param {number} travelMin      - travel time from previous stop to this one
 * @param {number} openTime       - place open time (minutes)
 * @param {number} closeTime      - place close time (minutes)
 * @param {number} durationMin    - visit duration (minutes)
 * @returns {{
 *   arrival: number, start: number, finish: number,
 *   waiting: number, slack: number, feasible: boolean
 * }}
 */
export function propagateOne(prevFinishMin, travelMin, openTime, closeTime, durationMin) {
  const arrival  = prevFinishMin + travelMin;
  const start    = Math.max(arrival, openTime);
  const waiting  = start - arrival;
  const finish   = start + durationMin;
  const slack    = closeTime - finish;
  const feasible = finish <= closeTime;
  return { arrival, start, finish, waiting, slack, feasible };
}

// ── Full route schedule propagation ─────────────────────────────────────────

/**
 * Propagate a full sequence of stops and return per-stop time data.
 *
 * @param {{id:string, openTime:number, closeTime:number}[]} stops
 *   Ordered list of stops (already-chosen places).
 * @param {number} dayStartMin      - day start time
 * @param {string} startLocationId  - id of start location (hotel)
 * @param {Function} getTravelMin   - (fromId, toId) -> minutes
 * @param {Function} getDuration    - (stop) -> minutes
 * @returns {{
 *   stops: object[],   // per-stop result objects
 *   feasible: boolean,
 *   firstFailure: string|null
 * }}
 */
export function propagateSchedule(stops, dayStartMin, startLocationId, getTravelMin, getDuration) {
  const results = [];
  let prevFinish = dayStartMin;
  let prevId     = startLocationId;
  let routeFeasible = true;
  let firstFailure  = null;

  for (const stop of stops) {
    const travelMin  = getTravelMin(prevId, stop.id);
    const duration   = getDuration(stop);
    const prop       = propagateOne(prevFinish, travelMin, stop.openTime, stop.closeTime, duration);
    const result     = {
      placeId:         stop.id,
      travelMin,
      arrival:         prop.arrival,
      start:           prop.start,
      finish:          prop.finish,
      waiting:         prop.waiting,
      slack:           prop.slack,
      feasible:        prop.feasible,
      failure_reason:  prop.feasible ? null :
        `Finish ${formatTime(prop.finish)} > close ${formatTime(stop.closeTime)}`,
    };
    results.push(result);
    if (!prop.feasible && routeFeasible) {
      routeFeasible = false;
      firstFailure  = `Stop "${stop.id}": ${result.failure_reason}`;
    }
    prevFinish = prop.finish;
    prevId     = stop.id;
  }

  return { stops: results, feasible: routeFeasible, firstFailure };
}

// ── Model-based validator ─────────────────────────────────────────────────────

/**
 * validateAgainstModel — checks every A1 inequality explicitly.
 * For explicit sequences there are no subtours so MTZ is trivially satisfied.
 *
 * @param {{
 *   stops: {id:string, openTime:number, closeTime:number, start:number, finish:number, arrival:number}[],
 *   dayStartMin: number,
 *   startLocationId: string,
 *   getTravelMin: Function,
 *   getDuration: Function,
 * }} params
 * @returns {string[]} list of violated constraint descriptions (empty = all ok)
 */
export function validateAgainstModel({ stops, dayStartMin, startLocationId, getTravelMin, getDuration }) {
  const issues = [];
  if (!stops || stops.length === 0) return issues;

  // First leg: a_first >= t0 + T_start,first
  const t0          = dayStartMin;
  const tFirst      = getTravelMin(startLocationId, stops[0].id);
  const minArrFirst = t0 + tFirst;
  if (stops[0].arrival < minArrFirst - 0.5) {
    issues.push(
      `A1 first-leg: arrival(${stops[0].id})=${formatTime(stops[0].arrival)} ` +
      `< t0+T_start=${formatTime(minArrFirst)}`
    );
  }

  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const d = getDuration(s);

    // opening: s_i >= O_i
    if (s.start < s.openTime - 0.5) {
      issues.push(`A1 opening(${s.id}): start=${formatTime(s.start)} < open=${formatTime(s.openTime)}`);
    }
    // arrival: s_i >= a_i
    if (s.start < s.arrival - 0.5) {
      issues.push(`A1 arrival(${s.id}): start=${formatTime(s.start)} < arrival=${formatTime(s.arrival)}`);
    }
    // closing: s_i + d_i <= C_i
    if (s.finish > s.closeTime + 0.5) {
      issues.push(`A1 closing(${s.id}): finish=${formatTime(s.finish)} > close=${formatTime(s.closeTime)}`);
    }
    // finish consistency: e_i = s_i + d_i
    if (Math.abs(s.finish - (s.start + d)) > 0.5) {
      issues.push(`A1 finish(${s.id}): finish=${s.finish} != start+d=${s.start + d}`);
    }
    // waiting: w_i = s_i - a_i >= 0
    const w = s.start - s.arrival;
    if (w < -0.5) {
      issues.push(`A1 waiting(${s.id}): waiting=${w} < 0`);
    }
    // window valid: O_i < C_i
    if (s.openTime >= s.closeTime) {
      issues.push(`A1 window(${s.id}): openTime=${formatTime(s.openTime)} >= closeTime=${formatTime(s.closeTime)}`);
    }
    // travel: a_j >= s_i + d_i + T_ij  (for consecutive pairs)
    if (i + 1 < stops.length) {
      const next = stops[i + 1];
      const tij  = getTravelMin(s.id, next.id);
      const minArrNext = s.finish + tij;
      if (next.arrival < minArrNext - 0.5) {
        issues.push(
          `A1 travel(${s.id}→${next.id}): arrival=${formatTime(next.arrival)} ` +
          `< finish+T=${formatTime(minArrNext)}`
        );
      }
    }
  }

  return issues;
}
