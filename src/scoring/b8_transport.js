/**
 * src/scoring/b8_transport.js
 * ─────────────────────────────────────────────────────────────────────────────
 * B8 – Transport Preference Score
 *
 * S_ijm = w_m·S_mode + w_c·S_comfort + w_t·S_transfer + w_d·S_direct
 *
 * Where:
 *   S_mode     – user's mode preference score (preferred=1, acceptable=0.65, low=0.25, avoided=0)
 *   S_comfort  – comfort matrix[comfortPref][mode]
 *   S_transfer – max(0, 1 - transfers / transferTolerance)
 *   S_direct   – directness score (direct=1, partial=0.5, indirect=0)
 */

import config from '../../config.js';

/**
 * scoreTransport(legInfo, user, cfg?)
 *
 * @param {object} legInfo
 *   @param {string} mode        – 'walk' | 'taxi' | 'transit'
 *   @param {number} transfers   – number of transfers
 *   @param {string} directness  – 'direct' | 'partial' | 'indirect'
 * @param {object} user
 *   @param {object} user.modePreference   – { taxi: 'preferred', transit: 'acceptable', … }
 *   @param {string} user.comfortPreference – 'premium' | 'standard' | 'basic'
 *   @param {number} user.transferTolerance – max acceptable transfers
 * @param {object} [cfg] – config.b8 override
 * @returns {{ score: number, breakdown: object }}
 */
export function scoreTransport(legInfo, user, cfg = config.b8) {
  const { w_m, w_c, w_t, w_d, modeScores, comfortMatrix, directnessScores } = cfg;
  const { mode, transfers, directness } = legInfo;

  // S_mode
  const modePref = (user.modePreference ?? {})[mode] ?? 'acceptable';
  const S_mode   = modeScores[modePref] ?? modeScores.acceptable;

  // S_comfort
  const comfortPref  = (user.comfortPreference ?? 'standard').toLowerCase();
  const comfortRow   = comfortMatrix[comfortPref] ?? comfortMatrix.standard;
  const S_comfort    = comfortRow[mode] ?? 0.5;

  // S_transfer
  const tol        = Math.max(1, user.transferTolerance ?? 2);
  const S_transfer = Math.max(0, 1 - (transfers ?? 0) / tol);

  // S_direct
  const S_direct = directnessScores[directness ?? 'direct'] ?? 1;

  const score = Math.min(1, Math.max(0,
    w_m * S_mode + w_c * S_comfort + w_t * S_transfer + w_d * S_direct,
  ));

  return {
    score,
    breakdown: { S_mode, S_comfort, S_transfer, S_direct, modePref, comfortPref },
  };
}

export default scoreTransport;
