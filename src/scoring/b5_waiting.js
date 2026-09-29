/**
 * src/scoring/b5_waiting.js
 * ─────────────────────────────────────────────────────────────────────────────
 * B5 – Waiting Preference Score
 *
 * S_W = w_o·S_o + w_t·S_t + w_m·S_m
 *
 * Each component:
 *   S_o = max(0, 1 - W_open   / W_tol)   opening-wait penalty
 *   S_t = max(0, 1 - W_trans  / W_tol)   transport-wait penalty
 *   S_m = max(0, 1 - W_meal   / W_tol)   meal-wait penalty
 *
 * W_tol = user.waitingToleranceMin
 * Linear by default; exponential mode: e^{-W/tau} (config.b5.useExponential)
 */

import config from '../../config.js';

/**
 * @param {number} waitMin  – actual waiting minutes (>= 0)
 * @param {number} tol      – tolerance in minutes
 * @param {object} b5cfg    – config.b5
 */
function componentScore(waitMin, tol, b5cfg) {
  if (b5cfg.useExponential) {
    return Math.exp(-waitMin / (b5cfg.tau || 30));
  }
  return Math.max(0, 1 - waitMin / Math.max(1, tol));
}

/**
 * scoreWaiting(waits, user, cfg?)
 *
 * @param {object} waits
 *   @param {number} [waits.openingWaitMin]    – minutes waited for place to open
 *   @param {number} [waits.transportWaitMin]  – minutes waited for transport
 *   @param {number} [waits.mealWaitMin]       – minutes waited for meal slot
 * @param {object} user  – normalized user (waitingToleranceMin)
 * @param {object} [cfg] – config.b5 override
 * @returns {{ score: number, breakdown: object }}
 */
export function scoreWaiting(waits, user, cfg = config.b5) {
  const { w_o, w_t, w_m } = cfg;
  const tol = user.waitingToleranceMin ?? 30;

  const W_open  = waits.openingWaitMin   ?? 0;
  const W_trans = waits.transportWaitMin ?? 0;
  const W_meal  = waits.mealWaitMin      ?? 0;

  const S_o = componentScore(W_open,  tol, cfg);
  const S_t = componentScore(W_trans, tol, cfg);
  const S_m = componentScore(W_meal,  tol, cfg);

  const score = Math.min(1, Math.max(0, w_o * S_o + w_t * S_t + w_m * S_m));

  return {
    score,
    breakdown: { S_o, S_t, S_m, W_open, W_trans, W_meal, tol },
  };
}

export default scoreWaiting;
