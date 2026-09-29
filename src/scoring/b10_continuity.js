/**
 * src/scoring/b10_continuity.js
 * ─────────────────────────────────────────────────────────────────────────────
 * B10 – Route Continuity Score
 *
 * C_j = w_d·D_j + w_b·(1-B_j) + w_c·Cluster_j + w_r·S_reversal
 *
 * Where:
 *   D_j      – directional consistency: dot product of (prev→cur) and (cur→next)
 *              vectors, normalised to [0,1]. High = keeps moving in same direction.
 *   B_j      – backtracking fraction: how many visited stops are closer to the
 *              *next* place than the current position is (reuse of B4's B_ij).
 *   Cluster_j – Gaussian proximity to day centroid:
 *              exp(-dist²/ (2·σC²))
 *   S_reversal – 1 - D_j  (reversal penalty reuses direction score complement)
 *
 * All vectors are (Δlng, Δlat) in degrees (small-angle approximation is fine
 * for city-level distances).
 */

import config from '../../config.js';

/** dot product of 2D vectors */
function dot2(a, b) { return a[0] * b[0] + a[1] * b[1]; }
/** magnitude of 2D vector */
function mag2(v) { return Math.sqrt(v[0] ** 2 + v[1] ** 2); }

/**
 * scoreContinuity(routeInfo, cfg?)
 *
 * @param {object} routeInfo
 *   @param {{ lat, lng }} prev        – previous stop location (or null for first stop)
 *   @param {{ lat, lng }} current     – current stop location
 *   @param {{ lat, lng }} next        – candidate next stop location
 *   @param {{ lat, lng }} centroid    – day centroid (mean lat/lng of pool)
 *   @param {number[]}     visitedDist – km from each visited stop to 'next'
 *   @param {number}       currentDist – km from 'current' to 'next'
 * @param {object} [cfg] – config.b10 override
 * @returns {{ score: number, breakdown: object }}
 */
export function scoreContinuity(routeInfo, cfg = config.b10) {
  const { w_d, w_b, w_c, w_r, sigmaC } = cfg;
  const { prev, current, next, centroid, visitedDist = [], currentDist } = routeInfo;

  // ── D_j : directional consistency ─────────────────────────────────────────
  let D_j = 0.5;   // neutral if no previous vector
  if (prev) {
    const v1 = [current.lng - prev.lng,     current.lat - prev.lat];
    const v2  = [next.lng    - current.lng, next.lat    - current.lat];
    const m1  = mag2(v1);
    const m2  = mag2(v2);
    if (m1 > 1e-9 && m2 > 1e-9) {
      // cosine similarity mapped to [0,1]
      D_j = Math.min(1, Math.max(0, (dot2(v1, v2) / (m1 * m2) + 1) / 2));
    }
  }

  // ── B_j : backtracking fraction ────────────────────────────────────────────
  let B_j = 0;
  if (visitedDist.length > 0 && currentDist != null) {
    const closer = visitedDist.filter((d) => d < currentDist).length;
    B_j = closer / visitedDist.length;
  }

  // ── Cluster_j : Gaussian proximity to day centroid ────────────────────────
  let Cluster_j = 1;
  if (centroid) {
    // Approximate km via degree difference (1° lat ≈ 111 km)
    const dLat = (next.lat - centroid.lat) * 111;
    const dLng = (next.lng - centroid.lng) * 111 * Math.cos((centroid.lat * Math.PI) / 180);
    const distKm = Math.sqrt(dLat ** 2 + dLng ** 2);
    Cluster_j = Math.exp(-(distKm ** 2) / (2 * (sigmaC ?? 3) ** 2));
  }

  // ── S_reversal: complement of D_j ─────────────────────────────────────────
  const S_reversal = 1 - D_j;

  const score = Math.min(1, Math.max(0,
    w_d * D_j + w_b * (1 - B_j) + w_c * Cluster_j + w_r * S_reversal,
  ));

  return {
    score,
    breakdown: { D_j, B_j, Cluster_j, S_reversal },
  };
}

export default scoreContinuity;
