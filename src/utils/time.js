/**
 * src/utils/time.js
 * Time utility functions. All internal times are minutes since 00:00.
 */

/**
 * Parse "HH:MM" string to integer minutes since midnight.
 * @param {string} hhmm
 * @returns {number}
 */
export function parseTime(hhmm) {
  if (typeof hhmm !== 'string') throw new TypeError(`parseTime expects string, got ${typeof hhmm}`);
  const match = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!match) throw new RangeError(`Invalid time format "${hhmm}", expected HH:MM`);
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h > 23 || m > 59) throw new RangeError(`Time out of range: "${hhmm}"`);
  return h * 60 + m;
}

/**
 * Format integer minutes since midnight as "HH:MM".
 * @param {number} minutes
 * @returns {string}
 */
export function formatTime(minutes) {
  if (typeof minutes !== 'number' || !isFinite(minutes)) {
    throw new TypeError(`formatTime expects finite number, got ${minutes}`);
  }
  const totalMin = Math.round(minutes);
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Format minutes as "Xh Ym" human-readable string.
 * @param {number} minutes
 * @returns {string}
 */
export function formatDuration(minutes) {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}

/**
 * Clamp value between 0 and 1.
 * @param {number} v
 * @returns {number}
 */
export function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Clamp value between lo and hi.
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Parse an ISO 8601 timestamp string and return a Date.
 * @param {string} iso
 * @returns {Date}
 */
export function parseISO(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) throw new RangeError(`Invalid ISO timestamp: "${iso}"`);
  return d;
}

/**
 * Age in days from a Date to now.
 * @param {Date} date
 * @returns {number}
 */
export function ageInDays(date) {
  return (Date.now() - date.getTime()) / 86_400_000;
}

/**
 * Return the ISO date string (YYYY-MM-DD) from a Date.
 * @param {Date} date
 * @returns {string}
 */
export function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Next departure time >= readyMinutes from a sorted list of "HH:MM" strings.
 * Returns null if none available.
 * @param {string[]} departures sorted list
 * @param {number} readyMinutes
 * @returns {number|null}
 */
export function nextDeparture(departures, readyMinutes) {
  if (!Array.isArray(departures) || departures.length === 0) return null;
  for (const dep of departures) {
    const t = parseTime(dep);
    if (t >= readyMinutes) return t;
  }
  return null;
}
