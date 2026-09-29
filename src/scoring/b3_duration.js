/**
 * src/scoring/b3_duration.js
 * ─────────────────────────────────────────────────────────────────────────────
 * B3 – Visit-Duration Preference Score
 *
 * For d_proposed in [d_min, d_ideal]:
 *   S_d = (d_proposed - d_min) / (d_ideal - d_min)     if d_ideal != d_min
 *         else 0                                         (d < d_ideal)
 *
 * For d_proposed in (d_ideal, d_max]:
 *   S_d = 1 - (d_proposed - d_ideal) / (d_max - d_ideal)  if d_max != d_ideal
 *         else 1
 *
 * Outside [d_min, d_max]: A3 hard-constraint would have already rejected this,
 * but we clamp to 0 here defensively.
 *
 * Returns score in [0, 1].
 */

/**
 * scoreDuration(dProposed, duration)
 * @param {number} dProposed  – proposed visit duration in minutes
 * @param {{ min: number, ideal: number, max: number }} duration – from place
 * @returns {{ score: number, breakdown: object }}
 */
export function scoreDuration(dProposed, duration) {
  const { min: d_min, ideal: d_ideal, max: d_max } = duration;

  // Outside hard bounds → 0 (defensive; A3 should have caught this)
  if (dProposed < d_min || dProposed > d_max) {
    return { score: 0, breakdown: { d_min, d_ideal, d_max, dProposed, region: 'out_of_bounds' } };
  }

  let score;
  if (dProposed <= d_ideal) {
    // Rising slope: d_min → d_ideal
    const range = d_ideal - d_min;
    score = range === 0 ? (dProposed >= d_ideal ? 1 : 0) : (dProposed - d_min) / range;
  } else {
    // Falling slope: d_ideal → d_max
    const range = d_max - d_ideal;
    score = range === 0 ? 1 : 1 - (dProposed - d_ideal) / range;
  }

  score = Math.min(1, Math.max(0, score));
  const region = dProposed <= d_ideal ? 'rising' : 'falling';

  return { score, breakdown: { d_min, d_ideal, d_max, dProposed, region } };
}

export default scoreDuration;
