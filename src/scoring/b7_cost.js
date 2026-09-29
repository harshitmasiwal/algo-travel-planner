/**
 * src/scoring/b7_cost.js
 * ─────────────────────────────────────────────────────────────────────────────
 * B7 – Cost Preference Score
 *
 * 1. Compute preferred cost range [C_pref_min, C_pref_max]:
 *    - If user.preferredCostRange is set, use it directly.
 *    - Otherwise derive from costPreferenceFractions[costPreference] × dailyBudget.
 *
 * 2. Score:
 *    - C_actual in [C_pref_min, C_pref_max]  → S = 1
 *    - C_actual < C_pref_min                 → S = 1 - q·(C_pref_min - C_actual)/C_pref_min
 *    - C_actual > C_pref_max                 → S = 1 - q·(C_actual - C_pref_max)/C_pref_max
 *    clamped to [0, 1]; q = config.b7.costSensitivity
 */

import config from '../../config.js';

/**
 * scoreCost(costInfo, cfg?)
 *
 * @param {object} costInfo
 *   @param {number}  C_actual        – actual total day cost so far (INR)
 *   @param {number}  dailyBudget     – day budget (INR); fallback to totalBudget/nDays
 *   @param {object}  user            – normalized user (costPreference, preferredCostRange)
 * @param {object} [cfg] – config.b7 override (costSensitivity)
 * @returns {{ score: number, breakdown: object }}
 */
export function scoreCost(costInfo, cfg = config.b7) {
  const { C_actual, dailyBudget, user } = costInfo;
  const q = cfg.costSensitivity ?? 0.5;

  // Determine preferred range
  let C_min, C_max;
  if (user.preferredCostRange && user.preferredCostRange.min != null) {
    C_min = user.preferredCostRange.min;
    C_max = user.preferredCostRange.max;
  } else {
    const pref   = (user.costPreference ?? 'balanced').toLowerCase();
    const fracs  = config.costPreferenceFractions[pref] ?? config.costPreferenceFractions.balanced;
    C_min = fracs.min * dailyBudget;
    C_max = fracs.max * dailyBudget;
  }

  // Guard against zero range
  if (C_max <= 0) return { score: 1, breakdown: { C_actual, C_min, C_max, deviation: 0 } };

  let score;
  let deviation = 0;

  if (C_actual < C_min) {
    deviation = C_min > 0 ? (C_min - C_actual) / C_min : 0;
    score = Math.max(0, 1 - q * deviation);
  } else if (C_actual > C_max) {
    deviation = C_max > 0 ? (C_actual - C_max) / C_max : 0;
    score = Math.max(0, 1 - q * deviation);
  } else {
    score = 1;
  }

  return {
    score: Math.min(1, score),
    breakdown: { C_actual, C_min, C_max, deviation, q },
  };
}

export default scoreCost;
