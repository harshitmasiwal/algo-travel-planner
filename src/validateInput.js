/**
 * src/validateInput.js
 * Validates the raw input JSON against the Algorithm B schema.
 * Throws descriptive ValidationError objects listing every issue found.
 */

import { parseTime } from './utils/time.js';

// ── Error class ───────────────────────────────────────────────────────────────

export class ValidationError extends Error {
  /**
   * @param {string[]} issues
   */
  constructor(issues) {
    super(`Input validation failed:\n${issues.map((i) => `  • ${i}`).join('\n')}`);
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isString(v) { return typeof v === 'string'; }
function isNumber(v) { return typeof v === 'number' && isFinite(v); }
function isInt(v)    { return Number.isInteger(v); }
function isBool(v)   { return typeof v === 'boolean'; }
function isArray(v)  { return Array.isArray(v); }
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function inRange(v, lo, hi) { return isNumber(v) && v >= lo && v <= hi; }

function tryParseTime(ctx, errs, val, field) {
  if (!isString(val)) { errs.push(`${ctx}.${field}: expected "HH:MM" string, got ${JSON.stringify(val)}`); return null; }
  try { return parseTime(val); }
  catch (e) { errs.push(`${ctx}.${field}: ${e.message}`); return null; }
}

function tryParseISO(ctx, errs, val, field) {
  if (!isString(val)) { errs.push(`${ctx}.${field}: expected ISO timestamp string`); return null; }
  const d = new Date(val);
  if (isNaN(d.getTime())) { errs.push(`${ctx}.${field}: invalid ISO timestamp "${val}"`); return null; }
  return d;
}

function requireString(ctx, errs, obj, field) {
  if (!isString(obj[field])) errs.push(`${ctx}.${field}: required string`);
}

function requireNumber(ctx, errs, obj, field, lo = -Infinity, hi = Infinity) {
  if (!isNumber(obj[field])) errs.push(`${ctx}.${field}: required number`);
  else if (obj[field] < lo || obj[field] > hi) errs.push(`${ctx}.${field}: must be in [${lo}, ${hi}]`);
}

const VALID_PRIORITY_STRINGS = new Set(['HIGH', 'MEDIUM', 'LOW']);
const VALID_CONDITIONS = new Set(['clear', 'cloudy', 'rain', 'heavy_rain', 'heat', 'storm']);
const VALID_ALERT_LEVELS = new Set(['warn', 'block']);
const VALID_DIET = new Set(['veg', 'nonveg', 'any']);
const VALID_COMFORT = new Set(['premium', 'standard', 'basic']);
const VALID_COST_PREF = new Set(['budget', 'balanced', 'premium']);
const VALID_DIRECTNESS = new Set(['direct', 'partial', 'indirect']);
const VALID_MODES = new Set(['walk', 'taxi', 'transit']); // extensible via config
const VALID_GROUP_MODES = new Set(['atLeast', 'exactly']);

// ── Section validators ────────────────────────────────────────────────────────

function validateTrip(trip, errs) {
  const ctx = 'trip';
  if (!isObject(trip)) { errs.push(`${ctx}: must be an object`); return; }
  requireString(ctx, errs, trip, 'tripId');
  if (!isString(trip.currency)) errs.push(`${ctx}.currency: required string`);
  if (!isNumber(trip.totalBudget) || trip.totalBudget < 0)
    errs.push(`${ctx}.totalBudget: must be a non-negative number`);
  if (!isInt(trip.partySize) || trip.partySize < 1)
    errs.push(`${ctx}.partySize: must be a positive integer`);
  if (trip.bookingTime !== undefined) tryParseISO(ctx, errs, trip.bookingTime, 'bookingTime');
}

function validateUser(user, errs) {
  const ctx = 'user';
  if (!isObject(user)) { errs.push(`${ctx}: must be an object`); return; }

  // interests
  if (user.interests !== undefined) {
    if (!isObject(user.interests)) errs.push(`${ctx}.interests: must be an object`);
    else {
      for (const [k, v] of Object.entries(user.interests)) {
        if (!inRange(v, 0, 1)) errs.push(`${ctx}.interests.${k}: must be in [0,1]`);
      }
    }
  }

  if (user.explicitInterests !== undefined && !isArray(user.explicitInterests))
    errs.push(`${ctx}.explicitInterests: must be an array`);
  if (user.dislikes !== undefined && !isArray(user.dislikes))
    errs.push(`${ctx}.dislikes: must be an array`);

  // mode preference
  if (user.modePreference !== undefined) {
    if (!isObject(user.modePreference)) errs.push(`${ctx}.modePreference: must be an object`);
    else {
      const validPref = new Set(['preferred', 'acceptable', 'low', 'avoided']);
      for (const [mode, pref] of Object.entries(user.modePreference)) {
        if (!validPref.has(pref)) errs.push(`${ctx}.modePreference.${mode}: must be one of ${[...validPref]}`);
      }
    }
  }

  if (user.allowedModes !== undefined && !isArray(user.allowedModes))
    errs.push(`${ctx}.allowedModes: must be an array`);

  if (user.comfortPreference !== undefined && !VALID_COMFORT.has(user.comfortPreference))
    errs.push(`${ctx}.comfortPreference: must be one of ${[...VALID_COMFORT]}`);

  if (user.transferTolerance !== undefined && (!isInt(user.transferTolerance) || user.transferTolerance < 0))
    errs.push(`${ctx}.transferTolerance: must be a non-negative integer`);

  if (user.maxWalkKm !== undefined && (!isNumber(user.maxWalkKm) || user.maxWalkKm < 0))
    errs.push(`${ctx}.maxWalkKm: must be a non-negative number`);

  if (user.waitingToleranceMin !== undefined && (!isNumber(user.waitingToleranceMin) || user.waitingToleranceMin < 0))
    errs.push(`${ctx}.waitingToleranceMin: must be a non-negative number`);

  // weather preferences
  if (user.weather !== undefined) {
    if (!isObject(user.weather)) errs.push(`${ctx}.weather: must be an object`);
    else {
      const w = user.weather;
      const fields = ['tempPrefMin', 'tempPrefMax', 'coldTol', 'heatTol'];
      for (const f of fields) {
        if (w[f] !== undefined && !isNumber(w[f])) errs.push(`${ctx}.weather.${f}: must be a number`);
      }
      if (w.rainTol !== undefined && !inRange(w.rainTol, 0, 1))
        errs.push(`${ctx}.weather.rainTol: must be in [0,1]`);
      if (w.windTol !== undefined && !inRange(w.windTol, 0, 1))
        errs.push(`${ctx}.weather.windTol: must be in [0,1]`);
    }
  }

  if (user.costPreference !== undefined && !VALID_COST_PREF.has(user.costPreference))
    errs.push(`${ctx}.costPreference: must be one of ${[...VALID_COST_PREF]}`);

  if (user.preferredCostRange !== undefined && user.preferredCostRange !== null) {
    const r = user.preferredCostRange;
    if (!isObject(r)) errs.push(`${ctx}.preferredCostRange: must be object or null`);
    else {
      if (!isNumber(r.min) || r.min < 0) errs.push(`${ctx}.preferredCostRange.min: must be >= 0`);
      if (!isNumber(r.max) || r.max < 0) errs.push(`${ctx}.preferredCostRange.max: must be >= 0`);
      if (isNumber(r.min) && isNumber(r.max) && r.min > r.max)
        errs.push(`${ctx}.preferredCostRange: min must be <= max`);
    }
  }

  // meals
  if (user.meals !== undefined) {
    if (!isObject(user.meals)) errs.push(`${ctx}.meals: must be an object`);
    else {
      for (const [mealType, meal] of Object.entries(user.meals)) {
        const mc = `${ctx}.meals.${mealType}`;
        if (!isObject(meal)) { errs.push(`${mc}: must be an object`); continue; }
        tryParseTime(mc, errs, meal.windowStart, 'windowStart');
        tryParseTime(mc, errs, meal.windowEnd, 'windowEnd');
        if (meal.preferredTime !== undefined) tryParseTime(mc, errs, meal.preferredTime, 'preferredTime');
        if (meal.timeTolerance !== undefined && (!isNumber(meal.timeTolerance) || meal.timeTolerance < 0))
          errs.push(`${mc}.timeTolerance: must be >= 0`);
        if (meal.durationMin !== undefined && (!isNumber(meal.durationMin) || meal.durationMin <= 0))
          errs.push(`${mc}.durationMin: must be > 0`);
        if (meal.diet !== undefined && !VALID_DIET.has(meal.diet))
          errs.push(`${mc}.diet: must be one of ${[...VALID_DIET]}`);
        if (meal.avgCost !== undefined && (!isNumber(meal.avgCost) || meal.avgCost < 0))
          errs.push(`${mc}.avgCost: must be >= 0`);
      }
    }
  }

  if (user.mustVisit !== undefined && !isArray(user.mustVisit))
    errs.push(`${ctx}.mustVisit: must be an array`);
  if (user.mustAvoid !== undefined && !isArray(user.mustAvoid))
    errs.push(`${ctx}.mustAvoid: must be an array`);

  if (user.mandatoryGroups !== undefined) {
    if (!isArray(user.mandatoryGroups)) errs.push(`${ctx}.mandatoryGroups: must be an array`);
    else {
      user.mandatoryGroups.forEach((g, i) => {
        const gc = `${ctx}.mandatoryGroups[${i}]`;
        if (!isObject(g)) { errs.push(`${gc}: must be an object`); return; }
        requireString(gc, errs, g, 'category');
        if (!isInt(g.count) || g.count < 1) errs.push(`${gc}.count: must be a positive integer`);
        if (!VALID_GROUP_MODES.has(g.mode)) errs.push(`${gc}.mode: must be one of ${[...VALID_GROUP_MODES]}`);
      });
    }
  }

  if (user.forbiddenCategories !== undefined && !isArray(user.forbiddenCategories))
    errs.push(`${ctx}.forbiddenCategories: must be an array`);

  if (user.minPlacesPerDay !== undefined && user.minPlacesPerDay !== null) {
    if (!isInt(user.minPlacesPerDay) || user.minPlacesPerDay < 0)
      errs.push(`${ctx}.minPlacesPerDay: must be a non-negative integer or null`);
  }
  if (user.maxPlacesPerDay !== undefined && user.maxPlacesPerDay !== null) {
    if (!isInt(user.maxPlacesPerDay) || user.maxPlacesPerDay < 1)
      errs.push(`${ctx}.maxPlacesPerDay: must be a positive integer or null`);
  }
}

function validateLocation(ctx, errs, loc) {
  if (!isObject(loc)) { errs.push(`${ctx}: must be an object`); return; }
  requireString(ctx, errs, loc, 'id');
  requireString(ctx, errs, loc, 'name');
  requireNumber(ctx, errs, loc, 'lat', -90, 90);
  requireNumber(ctx, errs, loc, 'lng', -180, 180);
}

function validateDays(days, errs) {
  const ctx = 'days';
  if (!isArray(days) || days.length === 0) { errs.push(`${ctx}: must be a non-empty array`); return; }
  days.forEach((day, i) => {
    const dc = `${ctx}[${i}]`;
    if (!isObject(day)) { errs.push(`${dc}: must be an object`); return; }
    if (!isInt(day.dayIndex) || day.dayIndex < 0) errs.push(`${dc}.dayIndex: must be a non-negative integer`);
    requireString(dc, errs, day, 'date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) errs.push(`${dc}.date: must match YYYY-MM-DD`);
    tryParseTime(dc, errs, day.dayStart, 'dayStart');
    tryParseTime(dc, errs, day.dayEnd, 'dayEnd');
    if (day.startLocation) validateLocation(`${dc}.startLocation`, errs, day.startLocation);
    if (day.endLocation)   validateLocation(`${dc}.endLocation`, errs, day.endLocation);
    if (day.dailyBudget !== undefined && day.dailyBudget !== null) {
      if (!isNumber(day.dailyBudget) || day.dailyBudget < 0)
        errs.push(`${dc}.dailyBudget: must be a non-negative number or null`);
    }
    if (!isArray(day.pool)) errs.push(`${dc}.pool: must be an array`);
    else {
      day.pool.forEach((pid, pi) => {
        if (!isString(pid)) errs.push(`${dc}.pool[${pi}]: must be a string (place id)`);
      });
    }
  });
}

function validatePlaces(places, errs) {
  const ctx = 'places';
  if (!isArray(places) || places.length === 0) { errs.push(`${ctx}: must be a non-empty array`); return; }
  const ids = new Set();
  places.forEach((p, i) => {
    const pc = `${ctx}[${i}]`;
    if (!isObject(p)) { errs.push(`${pc}: must be an object`); return; }
    requireString(pc, errs, p, 'id');
    if (p.id && ids.has(p.id)) errs.push(`${pc}.id: duplicate place id "${p.id}"`);
    if (p.id) ids.add(p.id);
    requireString(pc, errs, p, 'name');
    requireNumber(pc, errs, p, 'lat', -90, 90);
    requireNumber(pc, errs, p, 'lng', -180, 180);
    requireString(pc, errs, p, 'category');
    if (p.subCategories !== undefined && !isArray(p.subCategories))
      errs.push(`${pc}.subCategories: must be an array`);
    if (p.tags !== undefined && !isArray(p.tags))
      errs.push(`${pc}.tags: must be an array`);
    tryParseTime(pc, errs, p.open, 'open');
    tryParseTime(pc, errs, p.close, 'close');
    if (p.closedDays !== undefined && !isArray(p.closedDays))
      errs.push(`${pc}.closedDays: must be an array`);

    // temporaryClosures
    if (p.temporaryClosures !== undefined) {
      if (!isArray(p.temporaryClosures)) errs.push(`${pc}.temporaryClosures: must be an array`);
      else {
        p.temporaryClosures.forEach((tc, ti) => {
          const tcc = `${pc}.temporaryClosures[${ti}]`;
          if (!isObject(tc)) { errs.push(`${tcc}: must be an object`); return; }
          requireString(tcc, errs, tc, 'date');
          tryParseTime(tcc, errs, tc.from, 'from');
          tryParseTime(tcc, errs, tc.to, 'to');
        });
      }
    }

    // duration
    if (!isObject(p.duration)) {
      errs.push(`${pc}.duration: must be an object with min/ideal/max`);
    } else {
      requireNumber(pc + '.duration', errs, p.duration, 'min', 0);
      requireNumber(pc + '.duration', errs, p.duration, 'ideal', 0);
      requireNumber(pc + '.duration', errs, p.duration, 'max', 0);
      if (isNumber(p.duration.min) && isNumber(p.duration.max) && p.duration.min > p.duration.max)
        errs.push(`${pc}.duration: min must be <= max`);
      if (isNumber(p.duration.ideal)) {
        if (p.duration.ideal < p.duration.min) errs.push(`${pc}.duration.ideal must be >= min`);
        if (p.duration.ideal > p.duration.max) errs.push(`${pc}.duration.ideal must be <= max`);
      }
    }

    if (!isNumber(p.cost) || p.cost < 0) errs.push(`${pc}.cost: must be a non-negative number`);
    if (p.otherCost !== undefined && (!isNumber(p.otherCost) || p.otherCost < 0))
      errs.push(`${pc}.otherCost: must be a non-negative number`);

    // priority
    if (p.priority !== undefined) {
      if (!VALID_PRIORITY_STRINGS.has(p.priority) && !inRange(p.priority, 0, 1))
        errs.push(`${pc}.priority: must be HIGH/MEDIUM/LOW or number in [0,1]`);
    }

    if (p.existingInterest !== undefined && !inRange(p.existingInterest, 0, 1))
      errs.push(`${pc}.existingInterest: must be in [0,1]`);

    if (p.modifiers !== undefined && !isObject(p.modifiers))
      errs.push(`${pc}.modifiers: must be an object`);

    if (p.outdoorSensitivity !== undefined && !inRange(p.outdoorSensitivity, 0, 1))
      errs.push(`${pc}.outdoorSensitivity: must be in [0,1]`);

    if (p.eligibleDays !== undefined && p.eligibleDays !== null) {
      if (!isArray(p.eligibleDays)) errs.push(`${pc}.eligibleDays: must be an array or null`);
    }

    if (p.transportAccess !== undefined && !isArray(p.transportAccess))
      errs.push(`${pc}.transportAccess: must be an array`);

    // booking
    if (p.booking !== undefined && p.booking !== null) {
      const bc = `${pc}.booking`;
      if (!isObject(p.booking)) { errs.push(`${bc}: must be an object or null`); }
      else {
        if (!isBool(p.booking.required)) errs.push(`${bc}.required: must be boolean`);
        if (!isArray(p.booking.slots)) errs.push(`${bc}.slots: must be an array`);
        else {
          p.booking.slots.forEach((slot, si) => {
            const sc = `${bc}.slots[${si}]`;
            if (!isObject(slot)) { errs.push(`${sc}: must be an object`); return; }
            requireString(sc, errs, slot, 'slotId');
            requireString(sc, errs, slot, 'date');
            tryParseTime(sc, errs, slot.start, 'start');
            tryParseTime(sc, errs, slot.end, 'end');
            if (!isInt(slot.capacity) || slot.capacity < 1)
              errs.push(`${sc}.capacity: must be positive integer`);
            if (!isBool(slot.available)) errs.push(`${sc}.available: must be boolean`);
            if (!isBool(slot.confirmed)) errs.push(`${sc}.confirmed: must be boolean`);
            if (slot.cutoff !== undefined) tryParseISO(sc, errs, slot.cutoff, 'cutoff');
          });
        }
      }
    }
  });
  return ids;
}

function validateTravelMatrix(matrix, placeIds, errs) {
  const ctx = 'travelMatrix';
  if (!isObject(matrix)) { errs.push(`${ctx}: must be an object`); return; }
  if (!isArray(matrix.ids)) { errs.push(`${ctx}.ids: must be an array`); return; }

  const n = matrix.ids.length;
  matrix.ids.forEach((id, i) => {
    if (!isString(id)) errs.push(`${ctx}.ids[${i}]: must be a string`);
  });

  if (!isObject(matrix.modes)) { errs.push(`${ctx}.modes: must be an object`); return; }

  for (const [mode, mdata] of Object.entries(matrix.modes)) {
    const mc = `${ctx}.modes.${mode}`;
    if (!isObject(mdata)) { errs.push(`${mc}: must be an object`); continue; }

    for (const field of ['minutes', 'km']) {
      if (!isArray(mdata[field])) { errs.push(`${mc}.${field}: must be a 2D array`); continue; }
      if (mdata[field].length !== n) errs.push(`${mc}.${field}: outer length must be ${n}`);
      mdata[field].forEach((row, ri) => {
        if (!isArray(row) || row.length !== n)
          errs.push(`${mc}.${field}[${ri}]: row length must be ${n}`);
        else {
          row.forEach((v, ci) => {
            if (!isNumber(v) || v < 0) errs.push(`${mc}.${field}[${ri}][${ci}]: must be a non-negative number`);
          });
        }
      });
    }

    // optional directness
    if (mdata.directness !== undefined) {
      if (!isArray(mdata.directness) || mdata.directness.length !== n)
        errs.push(`${mc}.directness: must be 2D array of size ${n}x${n}`);
      else {
        mdata.directness.forEach((row, ri) => {
          if (!isArray(row) || row.length !== n)
            errs.push(`${mc}.directness[${ri}]: row length must be ${n}`);
          else {
            row.forEach((v, ci) => {
              if (!VALID_DIRECTNESS.has(v))
                errs.push(`${mc}.directness[${ri}][${ci}]: must be one of ${[...VALID_DIRECTNESS]}`);
            });
          }
        });
      }
    }
  }
}

function validateTransportServices(services, errs) {
  const ctx = 'transportServices';
  if (services === undefined) return; // optional
  if (!isObject(services)) { errs.push(`${ctx}: must be an object`); return; }

  for (const [mode, svc] of Object.entries(services)) {
    const mc = `${ctx}.${mode}`;
    if (!isObject(svc)) { errs.push(`${mc}: must be an object`); continue; }
    tryParseTime(mc, errs, svc.open, 'open');
    tryParseTime(mc, errs, svc.close, 'close');
    if (svc.departures !== undefined) {
      if (!isArray(svc.departures)) errs.push(`${mc}.departures: must be an array`);
      else svc.departures.forEach((d, i) => tryParseTime(`${mc}.departures[${i}]`, errs, d, ''));
    }
    if (svc.transferMin !== undefined && (!isNumber(svc.transferMin) || svc.transferMin < 0))
      errs.push(`${mc}.transferMin: must be >= 0`);
    if (svc.unavailable !== undefined) {
      if (!isArray(svc.unavailable)) errs.push(`${mc}.unavailable: must be an array`);
      else {
        svc.unavailable.forEach((u, i) => {
          const uc = `${mc}.unavailable[${i}]`;
          if (!isObject(u)) { errs.push(`${uc}: must be an object`); return; }
          tryParseTime(uc, errs, u.from, 'from');
          tryParseTime(uc, errs, u.to, 'to');
        });
      }
    }
  }
}

function validateContext(context, errs) {
  const ctx = 'context';
  if (context === undefined) return; // optional
  if (!isObject(context)) { errs.push(`${ctx}: must be an object`); return; }

  // weather
  if (context.weather !== undefined) {
    if (!isObject(context.weather)) errs.push(`${ctx}.weather: must be an object`);
    else {
      for (const [date, w] of Object.entries(context.weather)) {
        const wc = `${ctx}.weather.${date}`;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errs.push(`${wc}: key must be YYYY-MM-DD`);
        if (!isObject(w)) { errs.push(`${wc}: must be an object`); continue; }
        if (!VALID_CONDITIONS.has(w.condition))
          errs.push(`${wc}.condition: must be one of ${[...VALID_CONDITIONS]}`);
        if (!isNumber(w.tempC)) errs.push(`${wc}.tempC: must be a number`);
        if (w.rain !== undefined && !inRange(w.rain, 0, 1)) errs.push(`${wc}.rain: must be in [0,1]`);
        if (w.wind !== undefined && !inRange(w.wind, 0, 1)) errs.push(`${wc}.wind: must be in [0,1]`);
      }
    }
  }

  // closures
  if (context.closures !== undefined) {
    if (!isArray(context.closures)) errs.push(`${ctx}.closures: must be an array`);
    else {
      context.closures.forEach((c, i) => {
        const cc = `${ctx}.closures[${i}]`;
        if (!isObject(c)) { errs.push(`${cc}: must be an object`); return; }
        requireString(cc, errs, c, 'placeId');
        requireString(cc, errs, c, 'date');
      });
    }
  }

  // safetyAlerts
  if (context.safetyAlerts !== undefined) {
    if (!isArray(context.safetyAlerts)) errs.push(`${ctx}.safetyAlerts: must be an array`);
    else {
      context.safetyAlerts.forEach((a, i) => {
        const ac = `${ctx}.safetyAlerts[${i}]`;
        if (!isObject(a)) { errs.push(`${ac}: must be an object`); return; }
        requireString(ac, errs, a, 'placeId');
        requireString(ac, errs, a, 'date');
        if (!VALID_ALERT_LEVELS.has(a.level))
          errs.push(`${ac}.level: must be one of ${[...VALID_ALERT_LEVELS]}`);
      });
    }
  }

  // environmentalRestrictions
  if (context.environmentalRestrictions !== undefined) {
    if (!isArray(context.environmentalRestrictions))
      errs.push(`${ctx}.environmentalRestrictions: must be an array`);
    else {
      context.environmentalRestrictions.forEach((r, i) => {
        const rc = `${ctx}.environmentalRestrictions[${i}]`;
        if (!isObject(r)) { errs.push(`${rc}: must be an object`); return; }
        requireString(rc, errs, r, 'placeId');
        requireString(rc, errs, r, 'date');
      });
    }
  }

  // roadClosures
  if (context.roadClosures !== undefined) {
    if (!isArray(context.roadClosures)) errs.push(`${ctx}.roadClosures: must be an array`);
    else {
      context.roadClosures.forEach((r, i) => {
        const rc = `${ctx}.roadClosures[${i}]`;
        if (!isObject(r)) { errs.push(`${rc}: must be an object`); return; }
        requireString(rc, errs, r, 'fromId');
        requireString(rc, errs, r, 'toId');
        requireString(rc, errs, r, 'date');
      });
    }
  }

  // transportSuspensions
  if (context.transportSuspensions !== undefined) {
    if (!isArray(context.transportSuspensions))
      errs.push(`${ctx}.transportSuspensions: must be an array`);
    else {
      context.transportSuspensions.forEach((s, i) => {
        const sc = `${ctx}.transportSuspensions[${i}]`;
        if (!isObject(s)) { errs.push(`${sc}: must be an object`); return; }
        requireString(sc, errs, s, 'mode');
        requireString(sc, errs, s, 'date');
        if (s.from !== undefined) tryParseTime(sc, errs, s.from, 'from');
        if (s.to !== undefined)   tryParseTime(sc, errs, s.to, 'to');
      });
    }
  }

  // events
  if (context.events !== undefined) {
    if (!isArray(context.events)) errs.push(`${ctx}.events: must be an array`);
    else {
      context.events.forEach((e, i) => {
        const ec = `${ctx}.events[${i}]`;
        if (!isObject(e)) { errs.push(`${ec}: must be an object`); return; }
        requireString(ec, errs, e, 'placeId');
        requireString(ec, errs, e, 'date');
      });
    }
  }
}

function validateCrossReferences(input, placeIds, errs) {
  // Every pool id must be a known place id
  input.days.forEach((day, di) => {
    if (!isArray(day.pool)) return;
    day.pool.forEach((pid, pi) => {
      if (!placeIds.has(pid))
        errs.push(`days[${di}].pool[${pi}]: place id "${pid}" not found in places array`);
    });
  });

  // travelMatrix ids must be a subset of place ids + location ids
  const locationIds = new Set();
  input.days.forEach((day) => {
    if (day.startLocation?.id) locationIds.add(day.startLocation.id);
    if (day.endLocation?.id)   locationIds.add(day.endLocation.id);
  });
  const allIds = new Set([...placeIds, ...locationIds]);
  if (isArray(input.travelMatrix?.ids)) {
    input.travelMatrix.ids.forEach((id, i) => {
      if (!allIds.has(id))
        errs.push(`travelMatrix.ids[${i}]: id "${id}" not found in places or locations`);
    });
  }

  // mustVisit must reference known places
  input.user?.mustVisit?.forEach((pid, i) => {
    if (!placeIds.has(pid))
      errs.push(`user.mustVisit[${i}]: place id "${pid}" not found in places`);
  });
  input.user?.mustAvoid?.forEach((pid, i) => {
    if (!placeIds.has(pid))
      errs.push(`user.mustAvoid[${i}]: place id "${pid}" not found in places`);
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Validate the raw Algorithm B input.
 * @param {unknown} input - Raw parsed JSON
 * @throws {ValidationError} when validation fails
 * @returns {true}
 */
export function validateInput(input) {
  const errs = [];

  if (!isObject(input)) {
    throw new ValidationError(['Root input must be a JSON object']);
  }

  validateTrip(input.trip, errs);
  validateUser(input.user, errs);
  validateDays(input.days, errs);
  const placeIds = validatePlaces(input.places, errs);
  validateTravelMatrix(input.travelMatrix, placeIds, errs);
  validateTransportServices(input.transportServices, errs);
  validateContext(input.context, errs);

  // Cross-references (only if structural validations passed enough to attempt)
  if (errs.length < 50) {
    validateCrossReferences(input, placeIds, errs);
  }

  if (errs.length > 0) {
    throw new ValidationError(errs);
  }

  return true;
}
