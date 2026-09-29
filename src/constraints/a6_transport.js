/**
 * src/constraints/a6_transport.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A6 — Transport Feasibility Constraints
 *
 *   F_ijm = allowed_m * avail_ijm(dep_ij) * timing_ijm * conn_ijm * book_ijm
 *   F_ij  = max_m F_ijm
 *   x_ij <= F_ij
 *
 * Single-mode architecture: exactly one mode per leg.
 * Scheduled modes use a departures list; gap until next departure counts as
 * transport waiting (for B5).
 *
 * Road closures (context.roadClosures) set R_ij = 0.
 * Transport suspensions (context.transportSuspensions) set T_safe_ijm = 0.
 */

import { nextDeparture } from '../utils/time.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Check if a mode is suspended on a given date/time by context.
 * @param {string} mode
 * @param {string} date
 * @param {number} depMin   - departure time (minutes)
 * @param {object[]} transportSuspensions
 * @returns {boolean} true if suspended (T_safe = 0)
 */
function isSuspended(mode, date, depMin, transportSuspensions) {
  for (const s of transportSuspensions) {
    if (s.mode !== mode || s.date !== date) continue;
    // If no time range → full day suspension
    if (s.from === undefined && s.to === undefined) return true;
    const from = s.from ?? 0;
    const to   = s.to   ?? 1440;
    if (depMin >= from && depMin < to) return true;
  }
  return false;
}

/**
 * Check if a road is closed on a given date.
 * @param {string} fromId
 * @param {string} toId
 * @param {string} date
 * @param {object[]} roadClosures
 * @returns {boolean}
 */
export function isRoadClosed(fromId, toId, date, roadClosures) {
  return roadClosures.some(
    (r) => r.date === date && (
      (r.fromId === fromId && r.toId === toId) ||
      (r.fromId === toId   && r.toId === fromId)  // bidirectional
    )
  );
}

/**
 * Check if a mode is unavailable at departure time due to service window or
 * explicit unavailability blocks.
 *
 * @param {{ open: number, close: number, unavailable: {from:number,to:number}[] }} svc
 * @param {number} depMin
 * @returns {boolean} true if available
 */
function isServiceAvailable(svc, depMin) {
  if (!svc) return false;
  if (depMin < svc.open || depMin > svc.close) return false;
  for (const u of (svc.unavailable ?? [])) {
    if (depMin >= u.from && depMin < u.to) return false;
  }
  return true;
}

// ── Single mode feasibility ───────────────────────────────────────────────────

/**
 * Check transport feasibility for one mode on one leg.
 *
 * @param {{
 *   fromId: string,
 *   toId: string,
 *   mode: string,
 *   readyMin: number,       - earliest departure time (finish of previous activity)
 *   date: string,
 *   travelInfo: { minutes: number, km: number, transfers: number } | null,
 *   userAllowedModes: string[],
 *   placeTransportAccess: string[],
 *   transferTolerance: number,
 *   maxWalkKm: number,
 *   transportServices: object,
 *   context: object,
 * }} params
 * @returns {{
 *   feasible: boolean,
 *   F_ijm: number,          - 0 or 1
 *   departureMin: number,   - actual departure (next scheduled dep or readyMin)
 *   arrivalMin: number,
 *   transferWaitMin: number,  - wait for next scheduled departure
 *   reason: string|null
 * }}
 */
export function checkModeFeasibility({
  fromId, toId, mode, readyMin, date,
  travelInfo,
  userAllowedModes,
  placeTransportAccess,
  transferTolerance,
  maxWalkKm,
  transportServices,
  context,
}) {
  const INFEASIBLE = (reason) => ({
    feasible: false, F_ijm: 0,
    departureMin: readyMin, arrivalMin: Infinity,
    transferWaitMin: 0, reason,
  });

  // allowed_m: user allows this mode
  if (!userAllowedModes.includes(mode)) return INFEASIBLE('MODE_NOT_ALLOWED');

  // place must support this transport mode
  if (placeTransportAccess && !placeTransportAccess.includes(mode))
    return INFEASIBLE('PLACE_NOT_REACHABLE_BY_MODE');

  // Road closure
  if (isRoadClosed(fromId, toId, date, context.roadClosures ?? []))
    return INFEASIBLE('ROAD_CLOSED');

  // Transport suspension
  if (isSuspended(mode, date, readyMin, context.transportSuspensions ?? []))
    return INFEASIBLE('TRANSPORT_SUSPENDED');

  // No travel info (matrix missing this leg for this mode)
  if (!travelInfo) return INFEASIBLE('NO_TRAVEL_INFO');

  // Walk distance limit (A8-linked check surfaced in A6)
  if (mode === 'walk' && travelInfo.km > maxWalkKm)
    return INFEASIBLE(`WALK_DISTANCE_EXCEEDED: ${travelInfo.km.toFixed(2)} km > max ${maxWalkKm} km`);

  // Transfer tolerance
  if ((travelInfo.transfers ?? 0) > transferTolerance)
    return INFEASIBLE(`TRANSFERS_EXCEEDED: ${travelInfo.transfers} > max ${transferTolerance}`);

  const svc = transportServices[mode];

  // Service timing: open <= dep <= close
  let departureMin    = readyMin;
  let transferWaitMin = 0;

  if (svc) {
    if (!isServiceAvailable(svc, readyMin)) return INFEASIBLE('SERVICE_NOT_AVAILABLE');

    // Scheduled departures
    if (svc.departures && svc.departures.length > 0) {
      const nextDep = nextDeparture(svc.departures, readyMin);
      if (nextDep === null) return INFEASIBLE('NO_DEPARTURE_AVAILABLE');
      // Connection: dep_l >= arr_k + transfer_min
      const minConnDep = readyMin + (svc.transferMin ?? 0);
      const actualDep  = nextDeparture(svc.departures, minConnDep);
      if (actualDep === null) return INFEASIBLE('NO_DEPARTURE_AFTER_TRANSFER');
      transferWaitMin = actualDep - readyMin;
      departureMin    = actualDep;
    }
  }

  const arrivalMin = departureMin + travelInfo.minutes;

  return {
    feasible: true,
    F_ijm: 1,
    departureMin,
    arrivalMin,
    transferWaitMin,
    reason: null,
  };
}

// ── Best mode selection ───────────────────────────────────────────────────────

/**
 * Select the best feasible mode for a leg.
 * Per spec: among modes with F_ijm=1, choose the one maximising B8;
 * ties broken by shorter travel time.
 *
 * (Full B8 scoring happens in the scoring layer; here we use travel time as
 *  the tiebreaker and preference order from user.modePreference.)
 *
 * @param {{
 *   fromId: string,
 *   toId: string,
 *   readyMin: number,
 *   date: string,
 *   userAllowedModes: string[],
 *   placeTransportAccess: string[],
 *   modePreference: object,
 *   transferTolerance: number,
 *   maxWalkKm: number,
 *   transportServices: object,
 *   context: object,
 *   travelMatrix: object,
 * }} params
 * @returns {{
 *   mode: string|null,
 *   info: object|null,
 *   feasibilityResults: object
 * }}
 */
export function selectBestMode(arg1, arg2, date, readyMin, serviceWindows, cfg) {
  // If called with positional arguments (legOptions, user, ...)
  if (!arg1 || arg2 !== undefined || !arg1.userAllowedModes) {
    const legOptions = arg1 || {};
    const user = arg2 || {};
    const prefScore = { preferred: 3, acceptable: 2, low: 1, avoided: 0 };
    const modePreference = user.modePreference || { taxi: 'preferred', transit: 'acceptable', walk: 'low' };
    const maxWalkKm = user.maxWalkKm ?? 2;

    let bestMode = null;
    let bestScore = -Infinity;
    let bestLeg = null;

    for (const [mode, leg] of Object.entries(legOptions)) {
      if (!leg) continue;
      // Check walk max distance
      if (mode === 'walk' && leg.km > maxWalkKm) continue;

      const pref = modePreference[mode] ?? 'acceptable';
      if (pref === 'avoided') continue;

      const prefVal = prefScore[pref] ?? 1;
      const timeVal = -(leg.travelMin ?? 0);
      const score = prefVal * 1000 + timeVal;

      if (score > bestScore) {
        bestScore = score;
        bestMode = mode;
        bestLeg = leg;
      }
    }

    if (!bestMode || !bestLeg) {
      return {
        feasible: false,
        mode: null,
        travelMin: Infinity,
        km: 0,
        directness: 'none',
        transfers: 0,
        info: null,
        feasibilityResults: {},
      };
    }

    return {
      feasible: true,
      mode: bestMode,
      travelMin: bestLeg.travelMin,
      km: bestLeg.km,
      directness: bestLeg.directness ?? 'direct',
      transfers: bestLeg.transfers ?? 0,
      info: { mode: bestMode, ...bestLeg },
      feasibilityResults: { [bestMode]: { feasible: true, ...bestLeg } },
    };
  }

  const {
    fromId, toId,
    userAllowedModes, placeTransportAccess,
    modePreference, transferTolerance, maxWalkKm,
    transportServices, context, travelMatrix,
  } = arg1;
  const readyMinParam = arg1.readyMin;
  const dateParam = arg1.date;

  const prefScore = { preferred: 3, acceptable: 2, low: 1, avoided: 0 };
  const feasibilityResults = {};
  let bestMode = null;
  let bestInfo = null;
  let bestScore = -Infinity;

  for (const mode of userAllowedModes) {
    const travelInfo = travelMatrix.lookup(fromId, toId, mode);
    const result = checkModeFeasibility({
      fromId, toId, mode, readyMin: readyMinParam, date: dateParam, travelInfo,
      userAllowedModes, placeTransportAccess,
      transferTolerance, maxWalkKm,
      transportServices, context,
    });
    feasibilityResults[mode] = result;

    if (!result.feasible) continue;

    const pref     = modePreference[mode] ?? 'low';
    const prefVal  = prefScore[pref] ?? 1;
    const timeVal  = -result.arrivalMin;  // less time = higher score
    const score    = prefVal * 1000 + timeVal;

    if (score > bestScore) {
      bestScore = score;
      bestMode  = mode;
      bestInfo  = { ...result, travelInfo, mode };
    }
  }

  return {
    feasible: bestMode !== null,
    mode: bestMode,
    travelMin: bestInfo?.travelMin ?? bestInfo?.travelInfo?.travelMin,
    km: bestInfo?.km ?? bestInfo?.travelInfo?.km,
    directness: bestInfo?.directness ?? 'direct',
    transfers: bestInfo?.transfers ?? 0,
    info: bestInfo,
    feasibilityResults,
  };
}
