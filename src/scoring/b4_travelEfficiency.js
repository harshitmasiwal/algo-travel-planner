/**
 * src/scoring/b4_travelEfficiency.js
 * ─────────────────────────────────────────────────────────────────────────────
 * B4 – Travel Efficiency Score
 *
 * E_ij = w_T·T_eff + w_D·D_eff + w_B·(1-B_ij) + w_C·C_j
 *
 * Where:
 *   T_eff = 1 - t_travel / t_ref          (time efficiency; t_ref = visit duration)
 *   D_eff = 1 - km / d_ref                (distance efficiency; d_ref configurable)
 *   B_ij  = fraction of visited stops closer to candidate than current position
 *           (backtracking indicator)
 *   C_j   = route-continuity score from B10 (injected, default 1 when not yet computed)
 *
 * All intermediate values clamped to [0, 1].
 */

import config from '../../config.js';

/**
 * scoreTravelEfficiency(leg, cfg?)
 *
 * @param {object} leg
 *   @param {number}   leg.travelMin    – travel time in minutes (current→next)
 *   @param {number}   leg.km           – straight-line or routed distance (km)
 *   @param {number}   leg.visitMin     – duration of visit at next place (minutes)
 *   @param {number[]} leg.visitedKmToNext  – km from each visited stop to next place
 *   @param {number}   leg.currentKmToNext  – km from current position to next place
 *   @param {number}   [leg.C_j]        – continuity score from B10 (default 1)
 *   @param {number}   [leg.tRefMin]    – reference travel time (default = visitMin)
 *   @param {number}   [leg.dRefKm]     – reference distance (default 20 km)
 * @param {object} [cfg] – config.b4 override
 * @returns {{ score: number, breakdown: object }}
 */
export function scoreTravelEfficiency(leg, cfg = config.b4) {
  const { w_T, w_D, w_B, w_C } = cfg;

  const { travelMin, km, visitMin, visitedKmToNext = [], currentKmToNext } = leg;
  const C_j    = leg.C_j   ?? 1;
  const tRef   = leg.tRefMin ?? Math.max(1, visitMin);       // avoid /0
  const dRef   = leg.dRefKm  ?? 20;

  // T_eff: time efficiency
  const T_eff = Math.min(1, Math.max(0, 1 - travelMin / tRef));

  // D_eff: distance efficiency
  const D_eff = Math.min(1, Math.max(0, 1 - km / dRef));

  // B_ij: backtracking fraction
  let B_ij = 0;
  if (visitedKmToNext.length > 0 && currentKmToNext != null) {
    const closer = visitedKmToNext.filter((d) => d < currentKmToNext).length;
    B_ij = closer / visitedKmToNext.length;
  }

  const raw   = w_T * T_eff + w_D * D_eff + w_B * (1 - B_ij) + w_C * C_j;
  const score = Math.min(1, Math.max(0, raw));

  return {
    score,
    breakdown: { T_eff, D_eff, B_ij, C_j },
  };
}

export default scoreTravelEfficiency;
