/**
 * src/scoring/b6_meal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * B6 – Meal Preference Score
 *
 * S_m = w_t·S_t + w_type·S_type + w_loc·S_loc + w_d·S_d
 *
 * Where:
 *   S_t    – time proximity score (how close actualTime is to preferredTime)
 *   S_type – cuisine/diet match (exact=1, similar=0.7, generic=0.3, mismatch=0)
 *   S_loc  – location convenience by km bands
 *   S_d    – duration preference (same piecewise triangle as B3)
 */

import config from '../../config.js';

/**
 * mealTimeScore(actualMin, preferredMin, toleranceMin)
 * Linear decay: 1 at preferred, 0 at preferred ± tolerance.
 */
function mealTimeScore(actualMin, preferredMin, toleranceMin) {
  const diff = Math.abs(actualMin - preferredMin);
  return Math.max(0, 1 - diff / Math.max(1, toleranceMin));
}

/**
 * mealTypeScore(place, mealPref, typeScores)
 * @param {object} place      – place with category, subCategories, tags, diet
 * @param {object} mealPref   – user meal pref (diet, cuisines)
 * @param {object} typeScores – config score map
 */
function mealTypeScore(place, mealPref, typeScores) {
  // Not a restaurant → generic (abstracted meal block)
  if (place.category !== 'restaurant') return typeScores.generic;

  const plCuisines = (place.subCategories ?? []).map((s) => s.toLowerCase());
  const plTags     = (place.tags ?? []).map((t) => t.toLowerCase());
  const plDiet     = (place.diet ?? 'any').toLowerCase();

  const userDiet    = (mealPref.diet ?? 'any').toLowerCase();
  const userCuisines = (mealPref.cuisines ?? []).map((c) => c.toLowerCase());

  // Diet mismatch check
  if (userDiet !== 'any' && plDiet !== 'any' && plDiet !== userDiet) {
    return typeScores.mismatch;
  }

  // Cuisine match
  if (userCuisines.length > 0) {
    const exactMatch = userCuisines.some(
      (uc) => plCuisines.includes(uc) || plTags.includes(uc),
    );
    if (exactMatch) return typeScores.exact;

    // Similar: any common token (e.g., "north" in "north_indian")
    const similar = userCuisines.some((uc) =>
      [...plCuisines, ...plTags].some((c) => c.includes(uc) || uc.includes(c)),
    );
    if (similar) return typeScores.similar;
  }

  return typeScores.generic;
}

/**
 * mealLocScore(km, locBands)
 */
function mealLocScore(km, locBands) {
  for (const band of locBands) {
    if (km <= band.maxKm) return band.score;
  }
  return locBands[locBands.length - 1].score;
}

/**
 * mealDurationScore(actualMin, mealPref)
 * Piecewise triangle same shape as B3 (using durationMin/durationTolerance).
 */
function mealDurationScore(actualMin, mealPref) {
  const ideal = mealPref.durationMin       ?? 45;
  const tol   = mealPref.durationTolerance ?? 30;
  const d_min = Math.max(0, ideal - tol);
  const d_max = ideal + tol;
  if (actualMin < d_min || actualMin > d_max) return 0;
  if (actualMin <= ideal) {
    const range = ideal - d_min;
    return range === 0 ? 1 : (actualMin - d_min) / range;
  }
  const range = d_max - ideal;
  return range === 0 ? 1 : 1 - (actualMin - ideal) / range;
}

/**
 * scoreMeal(mealInfo, cfg?)
 *
 * @param {object} mealInfo
 *   @param {object} place          – restaurant place OR abstract meal block
 *   @param {string} mealType       – 'lunch' | 'dinner'
 *   @param {number} actualStartMin – actual meal start time (minutes from midnight)
 *   @param {number} actualDurMin   – actual meal duration (minutes)
 *   @param {number} kmToMeal       – distance from last attraction to restaurant
 *   @param {object} mealPref       – user.meals[mealType]
 * @param {object} [cfg] – config.b6 override
 * @returns {{ score: number, breakdown: object }}
 */
export function scoreMeal(mealInfo, cfg = config.b6) {
  const { w_t, w_type, w_loc, w_d, typeScores, locBands } = cfg;
  const { place, actualStartMin, actualDurMin, kmToMeal, mealPref } = mealInfo;

  const prefTimeMin = parseTimeToMin(mealPref.preferredTime ?? '13:00');
  const timeTol     = mealPref.timeTolerance ?? 60;

  const S_t    = mealTimeScore(actualStartMin, prefTimeMin, timeTol);
  const S_type = mealTypeScore(place, mealPref, typeScores);
  const S_loc  = mealLocScore(kmToMeal, locBands);
  const S_d    = mealDurationScore(actualDurMin, mealPref);

  const score = Math.min(1, Math.max(0, w_t * S_t + w_type * S_type + w_loc * S_loc + w_d * S_d));

  return {
    score,
    breakdown: { S_t, S_type, S_loc, S_d },
  };
}

/** HH:MM string → minutes from midnight */
function parseTimeToMin(str) {
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

export default scoreMeal;
