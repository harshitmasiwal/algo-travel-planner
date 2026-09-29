/**
 * src/scoring/b2_priority.js
 * ─────────────────────────────────────────────────────────────────────────────
 * B2 – Place Priority Score
 *
 * P'_i = base[priority] + Σ modifierWeights[k] · modifiers[k]
 * clamped to [0, 1]
 *
 * Where base scores: HIGH=1.0, MEDIUM=0.6, LOW=0.3
 * Modifiers: flagship, unesco, mustSee, seasonal, campaign (each 0 or 1)
 */

import config from '../../config.js';

/**
 * scorePriority(place, cfg?)
 * @param {object} place – normalized place (priority, modifiers)
 * @param {object} [cfg] – optional config override (default: config.b2)
 * @returns {{ score: number, breakdown: object }}
 */
export function scorePriority(place, cfg = config.b2) {
  const { base, modifierWeights } = cfg;

  // Base score by priority level
  let baseScore;
  let priorityKey;
  if (typeof place.priority === 'number') {
    baseScore = place.priority;
    priorityKey = place.priority >= 0.8 ? 'HIGH' : (place.priority >= 0.5 ? 'MEDIUM' : 'LOW');
  } else {
    priorityKey = String(place.priority ?? 'LOW').toUpperCase();
    baseScore   = base[priorityKey] ?? base.LOW;
  }

  // Sum modifier bonuses
  const mods = place.modifiers ?? {};
  let modSum = 0;
  for (const [key, weight] of Object.entries(modifierWeights)) {
    const mVal = Math.min(1, Math.max(0, mods[key] ?? 0));
    modSum += weight * mVal;
  }

  const raw   = baseScore + modSum;
  const score = Math.min(1, Math.max(0, raw));

  return {
    score,
    breakdown: { baseScore, modSum, priorityKey },
  };
}

export default scorePriority;
