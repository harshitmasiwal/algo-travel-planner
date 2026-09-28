/**
 * src/providers/osrmProvider.js
 * OsrmProvider: wraps the OSRM HTTP API.
 *
 * OUT OF SCOPE (built upstream) – this file provides a clean, stubbed
 * interface so the algorithm can be wired to OSRM without changing any
 * downstream code.
 *
 * OSRM endpoints used:
 *   Table: GET /table/v1/{profile}/{coords}?sources=...&destinations=...
 *   Route: GET /route/v1/{profile}/{coords}?overview=false
 *
 * Mode -> OSRM profile mapping (configurable in config.js if needed):
 *   walk    -> foot
 *   transit -> car   (nearest approximation; real transit needs GTFS)
 *   taxi    -> car
 *
 * All methods throw when the HTTP request fails so callers must handle errors.
 */

import { TravelTimeProvider } from './travelTimeProvider.js';
import config from '../../config.js';

// OSRM profile per mode
const OSRM_PROFILES = {
  walk:    'foot',
  taxi:    'car',
  transit: 'car',
};

// Approximate conversion from OSRM duration (seconds) -> minutes
const secToMin = (s) => s / 60;

// OSRM returns metres; convert to km
const mToKm = (m) => m / 1000;

export class OsrmProvider extends TravelTimeProvider {
  /**
   * @param {string} baseUrl - OSRM server base URL, e.g. "http://router.project-osrm.org"
   * @param {Map<string, { lat: number, lng: number }>} locationMap
   */
  constructor(baseUrl, locationMap) {
    super();
    this._base = baseUrl.replace(/\/$/, '');
    this._loc  = locationMap;
  }

  /**
   * Make a fetch request. Stub-friendly: can be overridden in tests.
   * @param {string} url
   * @returns {Promise<object>}
   */
  async _fetch(url) {
    // Node 18+ has built-in fetch
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}: ${url}`);
    return res.json();
  }

  _coordStr(id) {
    const loc = this._loc.get(id);
    if (!loc) throw new Error(`OsrmProvider: unknown location id "${id}"`);
    return `${loc.lng},${loc.lat}`;
  }

  /**
   * Single leg: calls OSRM /route endpoint.
   */
  async getTravelInfo(fromId, toId, mode) {
    const profile = OSRM_PROFILES[mode];
    if (!profile) return null;

    const url = `${this._base}/route/v1/${profile}/${this._coordStr(fromId)};${this._coordStr(toId)}?overview=false`;
    const data = await this._fetch(url);
    if (data.code !== 'Ok' || !data.routes?.length) return null;

    const route = data.routes[0];
    return {
      minutes:    secToMin(route.duration),
      km:         mToKm(route.distance),
      transfers:  0,  // OSRM does not return transit transfers
      directness: 'direct',
    };
  }

  /**
   * Build an NxN matrix using OSRM /table endpoint.
   * Each mode calls the table endpoint separately (OSRM profiles differ).
   */
  async buildMatrix(ids, modes, locations) {
    const loc = locations ?? this._loc;
    const n = ids.length;
    const result = { ids, modes: {} };

    for (const mode of modes) {
      const profile = OSRM_PROFILES[mode];
      if (!profile) continue;

      const coords = ids.map((id) => {
        const l = loc.get(id);
        if (!l) throw new Error(`OsrmProvider.buildMatrix: unknown id "${id}"`);
        return `${l.lng},${l.lat}`;
      }).join(';');

      const url = `${this._base}/table/v1/${profile}/${coords}`;
      const data = await this._fetch(url);
      if (data.code !== 'Ok') throw new Error(`OSRM table error: ${data.message}`);

      // OSRM returns duration matrix (seconds) and optionally distance matrix
      const rawDur  = data.durations;   // seconds
      const rawDist = data.distances;   // metres (may be null)

      const minutesMat  = [];
      const kmMat       = [];
      const transferMat = [];
      const directMat   = [];

      for (let i = 0; i < n; i++) {
        minutesMat.push([]);
        kmMat.push([]);
        transferMat.push([]);
        directMat.push([]);
        for (let j = 0; j < n; j++) {
          minutesMat[i].push(parseFloat(secToMin(rawDur[i][j]).toFixed(2)));
          kmMat[i].push(rawDist ? parseFloat(mToKm(rawDist[i][j]).toFixed(4)) : 0);
          transferMat[i].push(0);
          directMat[i].push('direct');
        }
      }

      result.modes[mode] = {
        minutes:    minutesMat,
        km:         kmMat,
        transfers:  transferMat,
        directness: directMat,
      };
    }

    return result;
  }
}
