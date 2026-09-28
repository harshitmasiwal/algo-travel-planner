/**
 * src/utils/rng.js
 * Seeded pseudo-random number generator (Mulberry32) for determinism.
 */

/**
 * Create a seeded RNG that returns floats in [0, 1).
 * @param {number} seed
 * @returns {() => number}
 */
export function createRng(seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    s += 0x6d2b79f5;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    z = (z ^ (z >>> 14)) >>> 0;
    return z / 4294967296;
  };
}

/**
 * Shuffle an array in-place using Fisher-Yates with the supplied RNG.
 * @template T
 * @param {T[]} arr
 * @param {() => number} rng
 * @returns {T[]}
 */
export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
