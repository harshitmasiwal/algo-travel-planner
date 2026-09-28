/**
 * src/providers/mockProvider.js
 * MockProvider: builds travel matrices from haversine distances and
 * configured speeds.  Zero network calls.  Fully deterministic.
 *
 * Speed per mode (km/h):  walk 5, taxi 25, transit 18   (from config.speeds)
 * Directness: walk/taxi always "direct"; transit "direct" for <= 10 km,
 *             "partial" up to 20 km, "indirect" beyond.
 * Transfers:  transit 0 for <= 10 km, 1 for <= 20 km, 2 beyond; walk/taxi 0.
 */

import { TravelTimeProvider } from './travelTimeProvider.js';
import { haversineKm } from '../utils/geo.js';
import config from '../../config.js';

function transitDirectness(km) {
  if (km <= 10) return 'direct';
  if (km <= 20) return 'partial';
  return 'indirect';
}

function transitTransfers(km) {
  if (km <= 10) return 0;
  if (km <= 20) return 1;
  return 2;
}

export class MockProvider extends TravelTimeProvider {
  /**
   * @param {Map<string, { lat: number, lng: number }>} locationMap
   *   A map of id -> { lat, lng } for all places and day locations.
   */
  constructor(locationMap) {
    super();
    this._loc = locationMap;
  }

  /**
   * Compute travel info from haversine + config speeds.
   * @returns {{ minutes: number, km: number, transfers: number, directness: string }|null}
   */
  async getTravelInfo(fromId, toId, mode) {
    const from = this._loc.get(fromId);
    const to   = this._loc.get(toId);
    if (!from || !to) return null;

    const speedKmh = config.speeds[mode];
    if (!speedKmh) return null;  // unknown mode

    const km      = haversineKm(from.lat, from.lng, to.lat, to.lng);
    const minutes = (km / speedKmh) * 60;

    return {
      minutes,
      km,
      transfers:  mode === 'transit' ? transitTransfers(km) : 0,
      directness: mode === 'transit' ? transitDirectness(km) : 'direct',
    };
  }

  /**
   * Build a full NxN matrix for the given ids and modes.
   * @param {string[]} ids
   * @param {string[]} modes
   * @param {Map<string, { lat: number, lng: number }>} locations
   * @returns {object} travelMatrix in the input schema shape
   */
  async buildMatrix(ids, modes, locations) {
    const loc = locations ?? this._loc;
    const n = ids.length;
    const result = { ids, modes: {} };

    for (const mode of modes) {
      const speedKmh = config.speeds[mode];
      const minutesMat  = [];
      const kmMat       = [];
      const transferMat = [];
      const directMat   = [];

      for (let i = 0; i < n; i++) {
        minutesMat.push([]);
        kmMat.push([]);
        transferMat.push([]);
        directMat.push([]);
        const from = loc.get(ids[i]);
        for (let j = 0; j < n; j++) {
          if (i === j) {
            minutesMat[i].push(0);
            kmMat[i].push(0);
            transferMat[i].push(0);
            directMat[i].push('direct');
            continue;
          }
          const to = loc.get(ids[j]);
          if (!from || !to || !speedKmh) {
            minutesMat[i].push(0);
            kmMat[i].push(0);
            transferMat[i].push(0);
            directMat[i].push('direct');
            continue;
          }
          const km      = haversineKm(from.lat, from.lng, to.lat, to.lng);
          const minutes = (km / speedKmh) * 60;
          minutesMat[i].push(parseFloat(minutes.toFixed(2)));
          kmMat[i].push(parseFloat(km.toFixed(4)));
          transferMat[i].push(mode === 'transit' ? transitTransfers(km) : 0);
          directMat[i].push(mode === 'transit' ? transitDirectness(km) : 'direct');
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
