/**
 * src/scoring/b1_interest.js
 * ─────────────────────────────────────────────────────────────────────────────
 * B1 – User Interest Score
 *
 * S'_i = w_c·S_c + w_I·(1 - I_i) + w_K·S_K  –  w_D·D_i
 * clamped to [0, 1]
 *
 * Where:
 *   S_c  – category-match score (from user.interests map + sub-category/tag bonus)
 *   I_i  – place.existingInterest (0=novel, 1=well-known-to-user → novelty = 1-I)
 *   S_K  – explicit-keyword match fraction
 *   D_i  – dislike penalty (1 if place matches a disliked category/tag, else 0)
 */

import config from '../../config.js';

/**
 * scoreInterest(place, user, cfg?)
 * @param {object} place  – normalized place object
 * @param {object} user   – normalized user object (interests, explicitInterests, dislikes)
 * @param {object} [cfg]  – optional config override (default: config.b1)
 * @returns {{ score: number, breakdown: object }}
 */
export function scoreInterest(place, user, cfg = config.b1) {
  const { w_c, w_I, w_K, w_D, m_sub, m_tag } = cfg;

  // ── S_c : category match ────────────────────────────────────────────────────
  const interests = user.interests ?? {};
  // Primary category score
  let S_c = interests[place.category] ?? 0;
  // Sub-category bonus (capped at 1)
  const subCats = place.subCategories ?? [];
  for (const sub of subCats) {
    if (interests[sub] !== undefined) {
      S_c = Math.min(1, S_c + m_sub * interests[sub]);
    }
  }
  // Tag bonus (capped at 1)
  const tags = place.tags ?? [];
  for (const tag of tags) {
    if (interests[tag] !== undefined) {
      S_c = Math.min(1, S_c + m_tag * interests[tag]);
    }
  }
  S_c = Math.min(1, Math.max(0, S_c));

  // ── novelty (1 - existingInterest) ─────────────────────────────────────────
  const I_i    = Math.min(1, Math.max(0, place.existingInterest ?? 0));
  const novelty = 1 - I_i;

  // ── S_K : explicit keyword match ────────────────────────────────────────────
  const keywords = user.explicitInterests ?? [];
  let matchCount = 0;
  if (keywords.length > 0) {
    const haystack = [
      place.category,
      ...(place.subCategories ?? []),
      ...(place.tags ?? []),
      place.name.toLowerCase(),
    ].map((s) => s.toLowerCase());
    for (const kw of keywords) {
      if (haystack.some((h) => h.includes(kw.toLowerCase()))) matchCount++;
    }
  }
  const S_K = keywords.length > 0 ? matchCount / keywords.length : 0;

  // ── D_i : dislike penalty ───────────────────────────────────────────────────
  const dislikes = user.dislikes ?? [];
  let D_i = 0;
  if (dislikes.length > 0) {
    const haystack = [
      place.category,
      ...(place.subCategories ?? []),
      ...(place.tags ?? []),
    ].map((s) => s.toLowerCase());
    for (const dl of dislikes) {
      if (haystack.some((h) => h.includes(dl.toLowerCase()))) {
        D_i = 1;
        break;
      }
    }
  }

  // ── Final score ──────────────────────────────────────────────────────────────
  const raw   = w_c * S_c + w_I * novelty + w_K * S_K - w_D * D_i;
  const score = Math.min(1, Math.max(0, raw));

  return {
    score,
    breakdown: { S_c, novelty, S_K, D_i, raw },
  };
}

export default scoreInterest;
