/**
 * src/scoring/b11_futureValue.js
 * ─────────────────────────────────────────────────────────────────────────────
 * B11 – Future-Day / Remaining-Route Value Score
 *
 * V_i  = w_p · P'_i  +  w_u · S'_i       (place's intrinsic value)
 *
 * V_after = w_r·R_remaining + w_f·F_future + w_c·ClusterVal + w_h·H_val
 *
 * Where:
 *   R_remaining – mean V_i of remaining places on today's pool after i
 *   F_future    – mean V_i of places on future days (days d+1 … D)
 *   ClusterVal  – mean V_i of places within sigmaC km of candidate
 *   H_val       – fraction of high-value (V_i >= highValueThreshold) places
 *                 remaining in pool
 *
 * V_after is normalised to [0,1] (already bounded by construction).
 */

import config from '../../config.js';
import { haversineKm } from '../utils/geo.js';

/**
 * placeValue(place, B1score, B2score, cfg?)
 * Computes V_i for a single place given its B1 and B2 scores.
 *
 * @param {number} B1score – interest score from b1_interest
 * @param {number} B2score – priority score from b2_priority
 * @param {object} [cfg]   – config.b11 override
 * @returns {number} V_i in [0,1]
 */
export function placeValue(B1score, B2score, cfg = config.b11) {
  return Math.min(1, Math.max(0, cfg.w_p * B2score + cfg.w_u * B1score));
}

/**
 * scoreFutureValue(futureInfo, cfg?)
 *
 * @param {object} futureInfo
 *   @param {{ place, V_i }[]} remainingToday  – pool places after current candidate on today
 *   @param {{ place, V_i }[]} futureDays      – all places on days d+1 … D
 *   @param {{ lat, lng }}     candidateLoc    – candidate place location
 *   @param {number}           [sigmaKm]       – cluster radius (default config.b10.sigmaC)
 * @param {object} [cfg] – config.b11 override
 * @returns {{ score: number, breakdown: object }}
 */
export function scoreFutureValue(futureInfo, cfg = config.b11) {
  const { w_r, w_f, w_c, w_h } = cfg;
  const hvt = config.highValueThreshold ?? 0.7;
  const sigmaC = futureInfo.sigmaKm ?? (config.b10?.sigmaC ?? 3);

  const remaining = futureInfo.remainingToday ?? [];
  const future    = futureInfo.futureDays    ?? [];
  const allPool   = [...remaining, ...future];

  // R_remaining – mean V_i of today's remaining places
  const R_remaining = remaining.length > 0
    ? remaining.reduce((s, x) => s + x.V_i, 0) / remaining.length
    : 1;  // no remaining → assume full value (incentivise last stop)

  // F_future – mean V_i of future-day places
  const F_future = future.length > 0
    ? future.reduce((s, x) => s + x.V_i, 0) / future.length
    : 1;  // no future days → single-day trip, neutral

  // ClusterVal – mean V_i of places within sigmaC km of candidate
  const candidateLoc = futureInfo.candidateLoc;
  let ClusterVal = 0.5;
  if (candidateLoc) {
    const nearby = allPool.filter(({ place }) => {
      const km = haversineKm(candidateLoc.lat, candidateLoc.lng, place.lat, place.lng);
      return km <= sigmaC;
    });
    if (nearby.length > 0) {
      ClusterVal = nearby.reduce((s, x) => s + x.V_i, 0) / nearby.length;
    }
  }

  // H_val – fraction of high-value places remaining
  const H_val = allPool.length > 0
    ? allPool.filter((x) => x.V_i >= hvt).length / allPool.length
    : 0;

  const score = Math.min(1, Math.max(0,
    w_r * R_remaining + w_f * F_future + w_c * ClusterVal + w_h * H_val,
  ));

  return {
    score,
    breakdown: { R_remaining, F_future, ClusterVal, H_val },
  };
}

export default { placeValue, scoreFutureValue };
