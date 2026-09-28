/**
 * src/constraints/a9_safety.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A9 — Safety / Environmental Constraints
 *
 *   Place safety:    F_i = S_i * O_i * E_i * H_i   (each in {0,1})
 *   Route safety:    R_ij = 0 if road closed on date
 *   Transport safety:T_safe_ijm = 0 if mode suspended OR storm + walk
 *
 *   S_i: safetyAlerts — 'block' level sets S_i = 0, 'warn' only flags
 *   O_i: context.closures — full-day closure sets O_i = 0
 *   E_i: environmentalRestrictions — matching place/date sets E_i = 0
 *   H_i: hazard — storm OR extreme heat (outdoorSensitivity >= threshold)
 *
 *   Storm rules (per config.stormBlockedModes, config.stormOutdoorThreshold):
 *     - Sets H_i = 0 for outdoor places (outdoorSensitivity >= stormOutdoorThreshold)
 *     - Blocks walk mode (T_safe_walk = 0)
 *
 *   Extreme heat rules (per config.extremeHeatC):
 *     - Sets H_i = 0 for outdoor places with outdoorSensitivity >= threshold
 *     - Does NOT block transport modes
 */

import config from '../../config.js';

// ── Place safety check ─────────────────────────────────────────────────────────

/**
 * Compute F_i for a place on a given date/time.
 *
 * @param {{
 *   id: string,
 *   outdoorSensitivity: number,
 * }} place
 * @param {string} visitDate          YYYY-MM-DD
 * @param {number} visitStartMin      (unused for now; reserved for time-of-day checks)
 * @param {{ condition: string, tempC: number }|null} weather   day's weather
 * @param {{
 *   safetyAlerts: { placeId: string, date: string, level: 'warn'|'block' }[],
 *   closures: Set<string>,
 *   environmentalRestrictions: { placeId: string, date: string }[],
 * }} context
 * @param {object} [cfg]
 * @returns {{
 *   safe: boolean,
 *   F_i: number,
 *   S_i: number, O_i: number, E_i: number, H_i: number,
 *   warnings: string[],
 *   failure_reason: string|null
 * }}
 */
export function checkPlaceSafety(place, visitDate, visitStartMin, weather, context, cfg = config) {
  const warnings = [];

  // ── S_i: safety alert ──────────────────────────────────────────────────
  let S_i = 1;
  for (const alert of (context.safetyAlerts ?? [])) {
    if (alert.placeId !== place.id || alert.date !== visitDate) continue;
    if (alert.level === 'block') {
      S_i = 0;
    } else if (alert.level === 'warn') {
      warnings.push(`SAFETY_WARNING: "${place.id}" has a safety advisory on ${visitDate}`);
    }
  }

  // ── O_i: official closure ──────────────────────────────────────────────
  const O_i = context.closures.has(`${place.id}|${visitDate}`) ? 0 : 1;

  // ── E_i: environmental restriction ────────────────────────────────────
  let E_i = 1;
  for (const er of (context.environmentalRestrictions ?? [])) {
    if (er.placeId === place.id && er.date === visitDate) {
      E_i = 0;
      break;
    }
  }

  // ── H_i: weather hazard ────────────────────────────────────────────────
  let H_i = 1;
  if (weather) {
    const cond     = weather.condition;
    const tempC    = weather.tempC ?? 25;
    const outSens  = place.outdoorSensitivity ?? 0;
    const outThresh = cfg.stormOutdoorThreshold ?? 0.5;

    if (cond === 'storm' && outSens >= outThresh) {
      H_i = 0;
      warnings.push(`STORM_HAZARD: "${place.id}" is outdoors (sens=${outSens}) — storm day`);
    } else if (tempC >= (cfg.extremeHeatC ?? 42) && outSens >= outThresh) {
      H_i = 0;
      warnings.push(`HEAT_HAZARD: "${place.id}" — temp ${tempC}°C exceeds ${cfg.extremeHeatC}°C`);
    }
  }

  const F_i    = S_i * O_i * E_i * H_i;
  const safe   = F_i === 1;

  let failure_reason = null;
  if (!safe) {
    const parts = [];
    if (S_i === 0) parts.push('SAFETY_BLOCK_ALERT');
    if (O_i === 0) parts.push('OFFICIALLY_CLOSED');
    if (E_i === 0) parts.push('ENVIRONMENTAL_RESTRICTION');
    if (H_i === 0) parts.push(weather?.condition === 'storm' ? 'STORM_OUTDOOR_BLOCKED' : 'EXTREME_HEAT_BLOCKED');
    failure_reason = parts.join(' | ');
  }

  return { safe, F_i, S_i, O_i, E_i, H_i, warnings, failure_reason };
}

// ── Route (road) safety ───────────────────────────────────────────────────────

/**
 * Check R_ij: is the road between fromId and toId open on visitDate?
 *
 * @param {string} fromId
 * @param {string} toId
 * @param {string} date
 * @param {object[]} roadClosures
 * @returns {boolean} true = safe (road open)
 */
export function checkRouteSafety(fromId, toId, date, roadClosures) {
  return !roadClosures.some(
    (r) => r.date === date && (
      (r.fromId === fromId && r.toId === toId) ||
      (r.fromId === toId   && r.toId === fromId)
    )
  );
}

// ── Transport safety ──────────────────────────────────────────────────────────

/**
 * Check T_safe_ijm: is mode safe to use on this leg on this date/time?
 *
 * Storm rules:  modes in config.stormBlockedModes get T_safe = 0 during storm.
 * Suspension:   explicit context.transportSuspensions block the mode.
 *
 * @param {string} mode
 * @param {string} date
 * @param {number} depMin
 * @param {object} context
 * @param {object} [cfg]
 * @param {{ condition: string }|null} [weather]
 * @returns {{ safe: boolean, T_safe: number, reason: string|null }}
 */
export function checkTransportSafety(mode, date, depMin, context, cfg = config, weather = null) {
  // Storm blocks certain modes
  if (weather?.condition === 'storm') {
    const blocked = cfg.stormBlockedModes ?? ['walk'];
    if (blocked.includes(mode)) {
      return { safe: false, T_safe: 0, reason: `STORM_BLOCKS_${mode.toUpperCase()}` };
    }
  }

  // Explicit transport suspension
  for (const s of (context.transportSuspensions ?? [])) {
    if (s.mode !== mode || s.date !== date) continue;
    const from = s.from ?? 0;
    const to   = s.to   ?? 1440;
    if (depMin >= from && depMin < to) {
      return { safe: false, T_safe: 0, reason: 'TRANSPORT_SUSPENDED' };
    }
    if (s.from === undefined && s.to === undefined) {
      return { safe: false, T_safe: 0, reason: 'TRANSPORT_SUSPENDED_ALL_DAY' };
    }
  }

  return { safe: true, T_safe: 1, reason: null };
}

// ── Batch safety filter ────────────────────────────────────────────────────────

/**
 * Filter a list of candidate places to those that are safe on a given day.
 *
 * @param {object[]} places       - normalised place objects
 * @param {string}   visitDate
 * @param {number}   visitStartMin
 * @param {object}   weather
 * @param {object}   context
 * @param {object}   [cfg]
 * @returns {{ safe: object[], blocked: { place: object, result: object }[] }}
 */
export function filterSafePlaces(places, visitDate, visitStartMin, weather, context, cfg = config) {
  const safe    = [];
  const blocked = [];
  for (const p of places) {
    const result = checkPlaceSafety(p, visitDate, visitStartMin, weather, context, cfg);
    if (result.safe) safe.push(p);
    else             blocked.push({ place: p, result });
  }
  return { safe, blocked };
}
