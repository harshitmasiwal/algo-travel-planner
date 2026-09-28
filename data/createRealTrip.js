/**
 * data/createRealTrip.js
 * ─────────────────────────────────────────────────────────────────────────────
 * REAL DATA ENTRY TOOL
 *
 * Isme apna real data dalo aur run karo:
 *   node data/createRealTrip.js
 *
 * Ye automatically:
 *   1. Haversine se travel matrix calculate karega (taxi/walk/transit)
 *   2. Validation check karega
 *   3. my_real_trip.json save karega
 *
 * Phir test karo:
 *   node src/cli.js data/my_real_trip.json   (Phase 5 ke baad)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { haversineKm } from '../src/utils/geo.js';
import config from '../config.js';

const __dir = dirname(fileURLToPath(import.meta.url));

// ════════════════════════════════════════════════════════════════════════════
// ✏️  YAHAN APNA DATA DALO — BAS YE SECTION EDIT KARO
// ════════════════════════════════════════════════════════════════════════════

// ── TRIP INFO ────────────────────────────────────────────────────────────────
const TRIP = {
  tripId:      'my_trip_001',     // Koi bhi naam do
  currency:    'INR',
  totalBudget: 20000,             // ₹ mein total budget (sabke liye)
  partySize:   2,                 // Kitne log hain
  bookingTime: new Date().toISOString(),
};

// ── HOTEL / START LOCATION ────────────────────────────────────────────────────
// Google Maps pe hotel dhundho, right-click → coordinates copy karo
const HOTEL = {
  id:   'my_hotel',
  name: 'Mera Hotel',
  lat:  28.6315,   // ← Apna hotel ka latitude
  lng:  77.2167,   // ← Apna hotel ka longitude
};

// ── USER PREFERENCES ─────────────────────────────────────────────────────────
const USER = {
  interests: {
    // Har category ko 0-1 score do (1 = bahut pasand, 0 = bilkul nahi)
    history:      0.9,
    architecture: 0.8,
    museum:       0.7,
    food:         0.7,
    nature:       0.5,
    religious:    0.4,
    shopping:     0.2,
  },
  explicitInterests: ['fort', 'mughal', 'heritage'],  // Specifically ye pasand hai
  dislikes:          ['shopping', 'market'],           // Ye nahi chahiye
  modePreference: {
    taxi:    'preferred',   // preferred / acceptable / low / avoided
    transit: 'acceptable',
    walk:    'low',
  },
  allowedModes:        ['walk', 'taxi', 'transit'],
  comfortPreference:   'standard',   // premium / standard / basic
  transferTolerance:   2,
  maxWalkKm:           1.5,
  waitingToleranceMin: 20,
  weather: {
    tempPrefMin: 20,   // Kitne degree se kam nahi pasand
    tempPrefMax: 32,   // Kitne degree se zyada nahi pasand
    coldTol:     8,
    heatTol:     8,
    rainTol:     0.5,  // 0=baarish bilkul nahi chalti, 1=koi baat nahi
    windTol:     0.4,
  },
  costPreference:    'balanced',  // budget / balanced / premium
  preferredCostRange: null,       // Ya { min: 1000, max: 5000 }
  meals: {
    lunch: {
      windowStart:       '12:00',
      windowEnd:         '14:30',
      preferredTime:     '13:00',
      timeTolerance:     60,
      durationMin:       45,
      durationTolerance: 30,
      diet:              'nonveg',  // veg / nonveg / any
      cuisines:          ['north_indian', 'mughlai'],
      locationPref:      'near_next_attraction',
      avgCost:           500,       // ₹ per person
    },
    dinner: {
      windowStart:       '19:00',
      windowEnd:         '21:30',
      preferredTime:     '20:00',
      timeTolerance:     60,
      durationMin:       60,
      durationTolerance: 30,
      diet:              'nonveg',
      cuisines:          ['north_indian'],
      locationPref:      'near_next_attraction',
      avgCost:           800,
    },
  },
  mustVisit:           ['red_fort_real'],  // Ye zaroor jaana hai (place id dalo)
  mustAvoid:           [],                 // Ye nahi jaana
  mandatoryGroups:     [{ category: 'museum', count: 1, mode: 'atLeast' }],
  forbiddenCategories: [],
  minPlacesPerDay:     3,
  maxPlacesPerDay:     6,
};

// ── DAYS ─────────────────────────────────────────────────────────────────────
// Ek entry = ek din. Hotel same reh sakta hai ya change ho sakta hai.
const DAYS_CONFIG = [
  {
    date:      '2026-10-05',   // YYYY-MM-DD
    dayStart:  '08:00',        // Subah nikalne ka time
    dayEnd:    '20:00',        // Raat wapas aane ka time
    hotel:     HOTEL,
    dailyBudget: null,         // ₹ ya null (no daily limit)
    placeIds: [                // Is din ki pool (neeche defined places ke ids)
      'red_fort_real',
      'jama_masjid_real',
      'india_gate_real',
      'karim_restaurant_real',
    ],
  },
  // Doosra din add karna ho toh:
  // {
  //   date: '2026-10-06',
  //   dayStart: '08:00',
  //   dayEnd: '20:00',
  //   hotel: HOTEL,
  //   dailyBudget: null,
  //   placeIds: ['qutub_real', 'lodhi_real', ...],
  // },
];

// ── PLACES ───────────────────────────────────────────────────────────────────
// Yahan apni real jagahein add karo.
// lat/lng: Google Maps pe jagah dhundho → right-click → "What's here?" → coordinates
//
// CATEGORIES (common ones):
//   fort, monument, museum, gallery, temple, religious, garden, market,
//   restaurant, experience, neighborhood, zoo, park, exhibition
//
// PRIORITY: HIGH (must see), MEDIUM (good to see), LOW (agar time mile)

const PLACES = [
  // ─── EXAMPLE: Red Fort ────────────────────────────────────────────────────
  {
    id:       'red_fort_real',        // Unique ID (koi spaces nahi)
    name:     'Red Fort',
    lat:       28.6562,               // ← Google Maps se
    lng:       77.2410,               // ← Google Maps se
    category:  'fort',
    subCategories: ['mughal', 'heritage'],
    tags:          ['UNESCO', 'history', 'architecture'],
    open:      '09:30',               // Opening time HH:MM (24hr)
    close:     '17:00',               // Closing time HH:MM
    closedDays: ['Mon'],              // ['Mon','Tue',...] ya []
    temporaryClosures: [],            // Agar koi special closure ho
    duration: {
      min:   60,    // Minimum visit time (minutes)
      ideal: 120,   // Recommended visit time
      max:   180,   // Maximum visit time
    },
    cost:   600,   // Entry ticket ₹ (per person)
    otherCost: 0,  // Camera/guide fee ₹
    priority: 'HIGH',                 // HIGH / MEDIUM / LOW
    existingInterest: 0.9,            // 0-1: User already kitna jaanta hai/chahta hai
    modifiers: {
      flagship: 1,  // Famous iconic place? 1
      unesco:   1,  // UNESCO World Heritage? 1
      mustSee:  1,  // "Must see" lists mein hai? 1
      seasonal: 0,  // Seasonal best hai? 0-1
      campaign: 0,  // Currently promoted? 1
    },
    outdoorSensitivity: 0.8,  // 0=fully indoor, 1=fully outdoor
    accessRestricted:   false,
    restricted:         false,
    eligibleDays:       null, // null=any day, [0,1,2]=only day 0,1,2
    transportAccess:    ['walk', 'taxi', 'transit'],
    booking:            null, // null if no booking needed
    // booking: {              // Agar advance booking chahiye:
    //   required: true,
    //   slots: [{
    //     slotId: 'slot_1',
    //     date: '2026-10-05',
    //     start: '10:00',
    //     end: '12:00',
    //     capacity: 50,
    //     available: true,
    //     confirmed: true,
    //     cutoff: '2026-10-04T23:59:00+05:30',
    //   }]
    // },
  },

  // ─── EXAMPLE: Jama Masjid ─────────────────────────────────────────────────
  {
    id:       'jama_masjid_real',
    name:     'Jama Masjid',
    lat:       28.6507,
    lng:       77.2334,
    category:  'religious',
    subCategories: ['mosque', 'mughal'],
    tags:          ['heritage', 'architecture'],
    open:      '07:00',
    close:     '12:00',
    closedDays: [],
    temporaryClosures: [],
    duration: { min: 30, ideal: 45, max: 60 },
    cost:      0,
    otherCost: 50,   // Camera fee
    priority: 'HIGH',
    existingInterest: 0.7,
    modifiers: { flagship: 1, unesco: 0, mustSee: 1, seasonal: 0, campaign: 0 },
    outdoorSensitivity: 0.5,
    accessRestricted: false,
    restricted:       false,
    eligibleDays:     null,
    transportAccess:  ['walk', 'taxi', 'transit'],
    booking:          null,
  },

  // ─── EXAMPLE: India Gate ──────────────────────────────────────────────────
  {
    id:       'india_gate_real',
    name:     'India Gate',
    lat:       28.6129,
    lng:       77.2295,
    category:  'monument',
    subCategories: ['war_memorial'],
    tags:          ['history', 'landmark'],
    open:      '00:00',  // 24/7 open
    close:     '23:59',
    closedDays: [],
    temporaryClosures: [],
    duration: { min: 30, ideal: 60, max: 90 },
    cost:      0,
    otherCost: 0,
    priority: 'HIGH',
    existingInterest: 0.8,
    modifiers: { flagship: 1, unesco: 0, mustSee: 1, seasonal: 0, campaign: 0 },
    outdoorSensitivity: 0.9,
    accessRestricted: false,
    restricted:       false,
    eligibleDays:     null,
    transportAccess:  ['walk', 'taxi', 'transit'],
    booking:          null,
  },

  // ─── EXAMPLE: Restaurant ──────────────────────────────────────────────────
  // Restaurant ke liye cuisine aur dietTags zaroor dalo!
  {
    id:       'karim_restaurant_real',
    name:     "Karim's Hotel",
    lat:       28.6498,
    lng:       77.2320,
    category:  'restaurant',           // ← RESTAURANT category zaroori
    subCategories: ['mughlai'],
    tags:          ['food', 'famous', 'nonveg'],
    open:      '09:00',
    close:     '23:00',
    closedDays: [],
    temporaryClosures: [],
    duration: { min: 30, ideal: 60, max: 90 },
    cost:      600,    // Average meal cost per person
    otherCost: 0,
    priority: 'MEDIUM',
    existingInterest: 0.7,
    modifiers: { flagship: 1, unesco: 0, mustSee: 1, seasonal: 0, campaign: 0 },
    outdoorSensitivity: 0.1,
    accessRestricted: false,
    restricted:       false,
    eligibleDays:     null,
    transportAccess:  ['walk', 'taxi', 'transit'],
    booking:          null,
    cuisine:  ['mughlai', 'kebab'],    // ← Kha kya milta hai
    dietTags: ['nonveg'],              // ← veg / nonveg
  },

  // ─── APNI JAGAH ADD KARO ─────────────────────────────────────────────────
  // Copy karo upar se ek template aur fill karo:
  // {
  //   id:       'apni_jagah_1',
  //   name:     'Apni Jagah Ka Naam',
  //   lat:       XX.XXXX,
  //   lng:       YY.YYYY,
  //   category:  'museum',
  //   ...
  // },
];

// ── WEATHER (optional) ────────────────────────────────────────────────────────
// AccuWeather / IMD se weather pata karo ya estimate karo
// condition: clear / cloudy / rain / heavy_rain / heat / storm
const WEATHER = {
  '2026-10-05': { condition: 'clear', tempC: 30, rain: 0.0, wind: 0.1 },
  // '2026-10-06': { condition: 'cloudy', tempC: 28, rain: 0.1, wind: 0.2 },
};

// ── CONTEXT (optional — agar koi special situation hai) ────────────────────
const CONTEXT = {
  weather:                   WEATHER,
  closures:                  [],  // [{ placeId: 'red_fort_real', date: '2026-10-05' }]
  safetyAlerts:              [],  // [{ placeId: '...', date: '...', level: 'warn' }]
  environmentalRestrictions: [],
  roadClosures:              [],
  transportSuspensions:      [],
  events:                    [],  // [{ placeId: '...', date: '...', note: 'Diwali Mela' }]
};

// ════════════════════════════════════════════════════════════════════════════
// AUTO-BUILD: Matrix + Validation — Yahan kuch mat badlo
// ════════════════════════════════════════════════════════════════════════════

function buildMatrix(locations, modes = ['walk', 'taxi', 'transit']) {
  const ids = locations.map((l) => l.id);
  const n   = ids.length;
  const result = { ids, modes: {} };

  for (const mode of modes) {
    const speed = config.speeds[mode];
    const minMat = [], kmMat = [], transMat = [], dirMat = [];

    for (let i = 0; i < n; i++) {
      minMat.push([]); kmMat.push([]); transMat.push([]); dirMat.push([]);
      for (let j = 0; j < n; j++) {
        if (i === j) {
          minMat[i].push(0); kmMat[i].push(0); transMat[i].push(0); dirMat[i].push('direct');
          continue;
        }
        const km  = haversineKm(locations[i].lat, locations[i].lng, locations[j].lat, locations[j].lng);
        const min = parseFloat(((km / speed) * 60).toFixed(2));
        minMat[i].push(min);
        kmMat[i].push(parseFloat(km.toFixed(4)));
        transMat[i].push(mode === 'transit' ? (km <= 10 ? 0 : km <= 20 ? 1 : 2) : 0);
        dirMat[i].push(mode === 'transit' ? (km <= 10 ? 'direct' : km <= 20 ? 'partial' : 'indirect') : 'direct');
      }
    }
    result.modes[mode] = { minutes: minMat, km: kmMat, transfers: transMat, directness: dirMat };
  }
  return result;
}

// Build days
const days = DAYS_CONFIG.map((d, i) => ({
  dayIndex:      i,
  date:          d.date,
  dayStart:      d.dayStart,
  dayEnd:        d.dayEnd,
  startLocation: d.hotel,
  endLocation:   d.hotel,
  dailyBudget:   d.dailyBudget,
  pool:          d.placeIds,
}));

// All locations for matrix (hotel + all places)
const hotelForMatrix = { id: HOTEL.id, lat: HOTEL.lat, lng: HOTEL.lng };
const allLocs = [hotelForMatrix, ...PLACES.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng }))];
const travelMatrix = buildMatrix(allLocs);

// Build final object
const realTrip = {
  trip: TRIP,
  user: USER,
  days,
  places: PLACES,
  travelMatrix,
  transportServices: {
    walk:    { open: '05:00', close: '23:59' },
    transit: { open: '06:00', close: '22:00', transferMin: 10,
               departures: ['06:00','07:00','08:00','09:00','10:00','11:00',
                            '12:00','13:00','14:00','15:00','16:00','17:00',
                            '18:00','19:00','20:00','20:30'] },
    taxi:    { open: '00:00', close: '23:59' },
  },
  context: CONTEXT,
};

// Validate before saving
import(join(import.meta.url, '../../src/validateInput.js').replace('file:///', ''))
  .then(({ validateInput }) => {
    try {
      validateInput(realTrip);
      console.log('✅ Validation PASSED!');
    } catch (e) {
      console.error('❌ Validation FAILED:\n', e.message);
      process.exit(1);
    }
  })
  .catch(() => {
    // Validation module import issue — save anyway
    console.log('⚠️  Validation skipped (run phase 2 first)');
  })
  .finally(() => {
    const outPath = join(__dir, 'my_real_trip.json');
    writeFileSync(outPath, JSON.stringify(realTrip, null, 2), 'utf8');
    console.log(`\n📁 Saved: ${outPath}`);
    console.log(`\n📊 Summary:`);
    console.log(`   Trip:   ${TRIP.tripId}`);
    console.log(`   Days:   ${days.length}`);
    console.log(`   Places: ${PLACES.length}`);
    console.log(`   Budget: ₹${TRIP.totalBudget} for ${TRIP.partySize} person(s)`);
    console.log(`\n▶️  Test karo: node --test test/phase1.test.js`);
  });
