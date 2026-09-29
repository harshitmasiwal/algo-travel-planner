/**
 * src/scoring/b9_weather.js
 * ─────────────────────────────────────────────────────────────────────────────
 * B9 – Weather Preference Score
 *
 * S_adjusted = (1 - O_sens · (1 - S_weather)) + O_sens · S_weather
 *            = 1 - O_sens + 2·O_sens·S_weather    (simplified)
 * But we follow the spec formulation directly:
 *
 *   S_weather = w_T·S_temp + w_R·S_rain + w_W·S_wind
 *   S_adjusted = clamp(S_weather + (1 - O_sens)·(1 - S_weather), [0,1])
 *              = S_weather + (1-O_sens)·(1-S_weather)
 *              = 1 - O_sens·(1-S_weather)
 *
 * Temperature score S_temp:
 *   Within [tempPrefMin, tempPrefMax]           → 1.0
 *   Below  tempPrefMin by d:                    → max(0, 1 - d/coldTol)
 *   Above  tempPrefMax by d:                    → max(0, 1 - d/heatTol)
 *
 * Rain score  S_rain = max(0, 1 - rain  / rainTol)   (if rainTol>0)
 * Wind score  S_wind = max(0, 1 - wind  / windTol)   (if windTol>0)
 */

import config from '../../config.js';

/**
 * scoreWeather(weatherInfo, place, user, cfg?)
 *
 * @param {object} weatherInfo   – { condition, tempC, rain, wind }
 *   @param {string} condition   – 'clear'|'cloudy'|'rain'|'heavy_rain'|'heat'|'storm'
 *   @param {number} tempC       – temperature in Celsius
 *   @param {number} [rain]      – rain intensity 0-1 (override condition map)
 *   @param {number} [wind]      – wind intensity 0-1 (override condition map)
 * @param {object} place         – { outdoorSensitivity }
 * @param {object} user          – { weather: { tempPrefMin, tempPrefMax, coldTol, heatTol, rainTol, windTol } }
 * @param {object} [cfg]         – config.b9 override
 * @returns {{ score: number, breakdown: object }}
 */
export function scoreWeather(weatherInfo, place, user, cfg = config.b9) {
  const { w_T, w_R, w_W, conditionMap } = cfg;
  const wx = user.weather ?? {};

  // ── Temperature score ──────────────────────────────────────────────────────
  const tempC    = weatherInfo.tempC ?? 25;
  const tMin     = wx.tempPrefMin ?? 15;
  const tMax     = wx.tempPrefMax ?? 35;
  const coldTol  = wx.coldTol ?? 10;
  const heatTol  = wx.heatTol ?? 10;

  let S_temp;
  if (tempC < tMin) {
    S_temp = Math.max(0, 1 - (tMin - tempC) / Math.max(1, coldTol));
  } else if (tempC > tMax) {
    S_temp = Math.max(0, 1 - (tempC - tMax) / Math.max(1, heatTol));
  } else {
    S_temp = 1;
  }

  // ── Rain & Wind (from condition map or explicit override) ──────────────────
  const mapped  = conditionMap[weatherInfo.condition ?? 'clear'] ?? { rain: 0, wind: 0.1 };
  const rainVal = weatherInfo.rain ?? mapped.rain;
  const windVal = weatherInfo.wind ?? mapped.wind;

  const rainTol = wx.rainTol ?? 0.5;
  const windTol = wx.windTol ?? 0.5;

  const S_rain = rainTol > 0 ? Math.max(0, 1 - rainVal / rainTol) : (rainVal === 0 ? 1 : 0);
  const S_wind = windTol > 0 ? Math.max(0, 1 - windVal / windTol) : (windVal === 0 ? 1 : 0);

  // ── Base weather score ─────────────────────────────────────────────────────
  const S_weather = Math.min(1, Math.max(0, w_T * S_temp + w_R * S_rain + w_W * S_wind));

  // ── Outdoor sensitivity adjustment ────────────────────────────────────────
  const O_sens   = Math.min(1, Math.max(0, place.outdoorSensitivity ?? 0));
  // S_adjusted = 1 - O_sens·(1 - S_weather)
  const S_adjusted = Math.min(1, Math.max(0, 1 - O_sens * (1 - S_weather)));

  return {
    score: S_adjusted,
    breakdown: { S_temp, S_rain, S_wind, S_weather, O_sens, tempC, rainVal, windVal },
  };
}

export default scoreWeather;
