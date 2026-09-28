/**
 * data/generate.js
 * Generates trip_small.json and trip_full.json under data/.
 *
 * trip_small.json – 1 day, 5 places (worked A1/A2 examples from the spec).
 * trip_full.json  – 7 days, 10-13 places per pool (~80 unique places),
 *                   realistic Delhi coordinates, mock matrix, varied weather,
 *                   closures, safety alerts, transport suspension, road closure.
 *
 * Run: node data/generate.js
 */

import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { haversineKm } from '../src/utils/geo.js';
import config from '../config.js';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Helper ─────────────────────────────────────────────────────────────────────

function save(filename, data) {
  const path = join(__dir, filename);
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Wrote ${path}`);
}

/** Format minutes as HH:MM */
function fmt(m) {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * Build haversine-based mock travelMatrix for a list of locations.
 * locations: [{ id, lat, lng }]
 * modes: ['walk','taxi','transit']
 */
function buildMockMatrix(locations, modes = ['walk', 'taxi', 'transit']) {
  const ids = locations.map((l) => l.id);
  const n   = ids.length;
  const result = { ids, modes: {} };

  const speeds = config.speeds;

  for (const mode of modes) {
    const speedKmh = speeds[mode];
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
        if (i === j) {
          minutesMat[i].push(0);
          kmMat[i].push(0);
          transferMat[i].push(0);
          directMat[i].push('direct');
          continue;
        }
        const from = locations[i];
        const to   = locations[j];
        const km   = haversineKm(from.lat, from.lng, to.lat, to.lng);
        const min  = parseFloat(((km / speedKmh) * 60).toFixed(2));
        const km_  = parseFloat(km.toFixed(4));

        minutesMat[i].push(min);
        kmMat[i].push(km_);

        if (mode === 'transit') {
          transferMat[i].push(km <= 10 ? 0 : km <= 20 ? 1 : 2);
          directMat[i].push(km <= 10 ? 'direct' : km <= 20 ? 'partial' : 'indirect');
        } else {
          transferMat[i].push(0);
          directMat[i].push('direct');
        }
      }
    }

    result.modes[mode] = { minutes: minutesMat, km: kmMat, transfers: transferMat, directness: directMat };
  }
  return result;
}

// ════════════════════════════════════════════════════════════════════════════════
// trip_small.json
// 1 day, 5 places that reproduce the A1/A2 worked examples from the spec.
// ════════════════════════════════════════════════════════════════════════════════

function generateSmall() {
  // Delhi hotel (start/end)
  const hotel = { id: 'hotel_small', name: 'Delhi Hotel', lat: 28.6139, lng: 77.2090 };

  // Places arranged so travel times match spec examples (use haversine offsets)
  // We embed exact travel-time values in the matrix rather than relying on
  // haversine, since the spec states precise minutes.
  const places = [
    {
      id: 'museum_a', name: 'Museum A', lat: 28.6600, lng: 77.2300,
      category: 'museum', subCategories: ['history'], tags: ['heritage'],
      open: '10:00', close: '18:00', closedDays: [],
      temporaryClosures: [],
      duration: { min: 60, ideal: 90, max: 120 },
      cost: 200, otherCost: 0, priority: 'HIGH', existingInterest: 0.8,
      modifiers: { flagship: 1, unesco: 0, mustSee: 1, seasonal: 0, campaign: 0 },
      outdoorSensitivity: 0.1, accessRestricted: false, restricted: false,
      eligibleDays: null, transportAccess: ['walk', 'taxi', 'transit'],
      booking: null,
    },
    {
      id: 'fort_b', name: 'Fort B', lat: 28.6550, lng: 77.2400,
      category: 'fort', subCategories: ['history'], tags: ['heritage', 'architecture'],
      open: '09:00', close: '17:00', closedDays: [],
      temporaryClosures: [],
      duration: { min: 45, ideal: 60, max: 90 },
      cost: 150, otherCost: 0, priority: 'MEDIUM', existingInterest: 0.6,
      modifiers: { flagship: 0, unesco: 1, mustSee: 0, seasonal: 0, campaign: 0 },
      outdoorSensitivity: 0.7, accessRestricted: false, restricted: false,
      eligibleDays: null, transportAccess: ['walk', 'taxi', 'transit'],
      booking: null,
    },
    {
      id: 'gallery_c', name: 'Gallery C', lat: 28.6300, lng: 77.2200,
      category: 'gallery', subCategories: ['art'], tags: ['culture'],
      open: '10:00', close: '19:00', closedDays: [],
      temporaryClosures: [],
      duration: { min: 30, ideal: 60, max: 90 },
      cost: 100, otherCost: 0, priority: 'LOW', existingInterest: 0.4,
      modifiers: { flagship: 0, unesco: 0, mustSee: 0, seasonal: 0, campaign: 0 },
      outdoorSensitivity: 0.0, accessRestricted: false, restricted: false,
      eligibleDays: null, transportAccess: ['walk', 'taxi', 'transit'],
      booking: null,
    },
    {
      id: 'temple_d', name: 'Temple D', lat: 28.6450, lng: 77.2500,
      category: 'religious', subCategories: ['temple'], tags: ['spiritual'],
      open: '06:00', close: '21:00', closedDays: [],
      temporaryClosures: [],
      duration: { min: 30, ideal: 60, max: 90 },
      cost: 0, otherCost: 0, priority: 'MEDIUM', existingInterest: 0.5,
      modifiers: { flagship: 0, unesco: 0, mustSee: 0, seasonal: 0, campaign: 0 },
      outdoorSensitivity: 0.3, accessRestricted: false, restricted: false,
      eligibleDays: null, transportAccess: ['walk', 'taxi', 'transit'],
      booking: null,
    },
    {
      id: 'restaurant_e', name: 'Restaurant E', lat: 28.6350, lng: 77.2150,
      category: 'restaurant', subCategories: ['north_indian'], tags: ['food', 'lunch'],
      open: '11:00', close: '23:00', closedDays: [],
      temporaryClosures: [],
      duration: { min: 30, ideal: 60, max: 90 },
      cost: 300, otherCost: 0, priority: 'LOW', existingInterest: 0.3,
      modifiers: { flagship: 0, unesco: 0, mustSee: 0, seasonal: 0, campaign: 0 },
      outdoorSensitivity: 0.0, accessRestricted: false, restricted: false,
      eligibleDays: null, transportAccess: ['walk', 'taxi', 'transit'],
      booking: null,
      cuisine: ['north_indian', 'mughlai'],
      dietTags: ['nonveg'],
    },
  ];

  const allLocations = [hotel, ...places];
  const travelMatrix = buildMockMatrix(allLocations);

  // Override specific cells to match spec's stated travel times exactly.
  // A1 test 1: hotel -> museum_a = 35 min; museum_a -> fort_b = 25 min
  // A2 test 5: museum -> gallery = 20 min; gallery -> fort = 25 min (reuse fort_b);
  //            fort -> temple = 30 min; temple -> hotel = 40 min
  const ids = travelMatrix.ids;
  function setCell(fromId, toId, mode, minutes, km) {
    const fi = ids.indexOf(fromId);
    const ti = ids.indexOf(toId);
    if (fi < 0 || ti < 0) return;
    travelMatrix.modes[mode].minutes[fi][ti] = minutes;
    travelMatrix.modes[mode].km[fi][ti] = km;
  }

  // For the spec worked examples we set taxi times (the "default" mode used):
  for (const mode of ['walk', 'taxi', 'transit']) {
    setCell('hotel_small', 'museum_a',  mode, 35, 35 * config.speeds.taxi / 60);
    setCell('museum_a',    'fort_b',    mode, 25, 25 * config.speeds.taxi / 60);
    setCell('hotel_small', 'gallery_c', mode, 20, 20 * config.speeds.taxi / 60);
    setCell('gallery_c',   'fort_b',    mode, 25, 25 * config.speeds.taxi / 60);
    setCell('fort_b',      'temple_d',  mode, 30, 30 * config.speeds.taxi / 60);
    setCell('temple_d',    'hotel_small', mode, 40, 40 * config.speeds.taxi / 60);
  }

  const small = {
    trip: {
      tripId: 'trip_small_001',
      currency: 'INR',
      totalBudget: 10000,
      partySize: 2,
      bookingTime: '2026-09-28T07:00:00+05:30',
    },
    user: {
      interests: { museum: 0.9, history: 0.8, architecture: 0.7, food: 0.5 },
      explicitInterests: ['fort', 'heritage'],
      dislikes: ['shopping'],
      modePreference: { taxi: 'preferred', transit: 'acceptable', walk: 'low' },
      allowedModes: ['walk', 'taxi', 'transit'],
      comfortPreference: 'standard',
      transferTolerance: 2,
      maxWalkKm: 2,
      waitingToleranceMin: 20,
      weather: { tempPrefMin: 18, tempPrefMax: 26, coldTol: 10, heatTol: 10, rainTol: 0.6, windTol: 0.5 },
      costPreference: 'balanced',
      preferredCostRange: null,
      meals: {
        lunch: {
          windowStart: '12:00', windowEnd: '14:30', preferredTime: '13:00',
          timeTolerance: 60, durationMin: 45, durationTolerance: 30,
          diet: 'nonveg', cuisines: ['north_indian', 'mughlai'],
          locationPref: 'near_next_attraction', avgCost: 300,
        },
        dinner: {
          windowStart: '19:00', windowEnd: '21:30', preferredTime: '20:00',
          timeTolerance: 60, durationMin: 45, durationTolerance: 30,
          diet: 'nonveg', cuisines: ['north_indian'],
          locationPref: 'near_next_attraction', avgCost: 400,
        },
      },
      mustVisit: ['museum_a'],
      mustAvoid: [],
      mandatoryGroups: [],
      forbiddenCategories: [],
      minPlacesPerDay: null,
      maxPlacesPerDay: null,
    },
    days: [
      {
        dayIndex: 0,
        date: '2026-09-29',
        dayStart: '08:00',
        dayEnd: '20:00',
        startLocation: hotel,
        endLocation: hotel,
        dailyBudget: null,
        pool: ['museum_a', 'fort_b', 'gallery_c', 'temple_d', 'restaurant_e'],
      },
    ],
    places,
    travelMatrix,
    transportServices: {
      walk:    { open: '05:00', close: '23:59' },
      transit: { open: '06:00', close: '22:00', transferMin: 10,
                 departures: ['06:00','06:30','07:00','07:30','08:00','08:30',
                              '09:00','09:30','10:00','10:30','11:00','11:30',
                              '12:00','12:30','13:00','13:30','14:00','14:30',
                              '15:00','15:30','16:00','16:30','17:00','17:30',
                              '18:00','18:30','19:00','19:30','20:00','20:30'] },
      taxi:    { open: '00:00', close: '23:59' },
    },
    context: {
      weather: {
        '2026-09-29': { condition: 'clear', tempC: 32, rain: 0.0, wind: 0.1 },
      },
      closures: [],
      safetyAlerts: [],
      environmentalRestrictions: [],
      roadClosures: [],
      transportSuspensions: [],
      events: [],
    },
  };

  return small;
}

// ════════════════════════════════════════════════════════════════════════════════
// trip_full.json
// 7 days, 10-13 place pools, ~80 unique Delhi places.
// ════════════════════════════════════════════════════════════════════════════════

function generateFull() {
  // ── Hotels (one per day to test hotel-change support) ─────────────────────
  const hotels = [
    { id: 'hotel_connaught', name: 'Hotel Connaught Place', lat: 28.6315, lng: 77.2167 },
    { id: 'hotel_connaught', name: 'Hotel Connaught Place', lat: 28.6315, lng: 77.2167 },
    { id: 'hotel_cp2',       name: 'Hotel CP2',             lat: 28.6320, lng: 77.2180 },
    { id: 'hotel_south',     name: 'Hotel South Delhi',     lat: 28.5500, lng: 77.2300 },
    { id: 'hotel_south',     name: 'Hotel South Delhi',     lat: 28.5500, lng: 77.2300 },
    { id: 'hotel_old',       name: 'Hotel Old Delhi',       lat: 28.6560, lng: 77.2310 },
    { id: 'hotel_old',       name: 'Hotel Old Delhi',       lat: 28.6560, lng: 77.2310 },
  ];

  // ── Place definitions ─────────────────────────────────────────────────────
  // 80 unique places covering museums, forts, temples, gardens, markets,
  // restaurants, galleries, monuments, parks.
  const places = [
    // --- Day 0-1: Central Delhi / Old Delhi monuments ---
    { id:'red_fort',      name:'Red Fort',           lat:28.6562, lng:77.2410, category:'fort',        subCategories:['mughal','heritage'], tags:['UNESCO','history','architecture'], open:'09:30', close:'17:00', closedDays:['Mon'], temporaryClosures:[], duration:{min:60,ideal:120,max:180}, cost:600,  otherCost:0, priority:'HIGH',   existingInterest:0.9, modifiers:{flagship:1,unesco:1,mustSee:1,seasonal:0,campaign:0}, outdoorSens:0.8, accessRestricted:false, restricted:false, eligibleDays:null, transportAccess:['walk','taxi','transit'], booking:null },
    { id:'jama_masjid',   name:'Jama Masjid',        lat:28.6507, lng:77.2334, category:'religious',   subCategories:['mosque','mughal'],   tags:['heritage','architecture'],      open:'07:00', close:'12:00', closedDays:[], temporaryClosures:[{date:'2026-10-03',from:'11:00',to:'12:00'}], duration:{min:30,ideal:45,max:60},  cost:0,    otherCost:50, priority:'HIGH',   existingInterest:0.7, modifiers:{flagship:1,unesco:0,mustSee:1,seasonal:0,campaign:0}, outdoorSens:0.5, accessRestricted:false, restricted:false, eligibleDays:null, transportAccess:['walk','taxi','transit'], booking:null },
    { id:'chandni_chowk', name:'Chandni Chowk',      lat:28.6505, lng:77.2300, category:'market',      subCategories:['heritage_market'],   tags:['food','shopping','heritage'],   open:'10:00', close:'20:00', closedDays:['Sun'], temporaryClosures:[], duration:{min:60,ideal:90,max:150}, cost:0,    otherCost:0, priority:'MEDIUM', existingInterest:0.5, modifiers:{flagship:0,unesco:0,mustSee:1,seasonal:0,campaign:0}, outdoorSens:0.6, accessRestricted:false, restricted:false, eligibleDays:null, transportAccess:['walk','taxi','transit'], booking:null },
    { id:'india_gate',    name:'India Gate',          lat:28.6129, lng:77.2295, category:'monument',    subCategories:['war_memorial'],      tags:['history','landmark'],           open:'00:00', close:'23:59', closedDays:[], temporaryClosures:[], duration:{min:30,ideal:60,max:90},  cost:0,    otherCost:0, priority:'HIGH',   existingInterest:0.8, modifiers:{flagship:1,unesco:0,mustSee:1,seasonal:0,campaign:0}, outdoorSens:0.9, accessRestricted:false, restricted:false, eligibleDays:null, transportAccess:['walk','taxi','transit'], booking:null },
    { id:'national_museum',name:'National Museum',   lat:28.6115, lng:77.2195, category:'museum',      subCategories:['history','art'],     tags:['heritage','culture'],           open:'10:00', close:'18:00', closedDays:['Mon'], temporaryClosures:[], duration:{min:90,ideal:120,max:180}, cost:300, otherCost:0, priority:'HIGH',   existingInterest:0.9, modifiers:{flagship:1,unesco:0,mustSee:1,seasonal:0,campaign:0}, outdoorSens:0.1, accessRestricted:false, restricted:false, eligibleDays:null, transportAccess:['walk','taxi','transit'], booking:null },
    { id:'rashtrapati',   name:'Rashtrapati Bhavan', lat:28.6144, lng:77.1993, category:'monument',    subCategories:['government'],        tags:['architecture','history'],       open:'09:00', close:'16:00', closedDays:['Mon','Tue'], temporaryClosures:[], duration:{min:60,ideal:90,max:120}, cost:50, otherCost:0, priority:'MEDIUM', existingInterest:0.6, modifiers:{flagship:1,unesco:0,mustSee:0,seasonal:0,campaign:0}, outdoorSens:0.5, accessRestricted:true,  restricted:false, eligibleDays:null, transportAccess:['walk','taxi','transit'],
      booking:{ required:true, slots:[
        { slotId:'rb_s1', date:'2026-10-01', start:'10:00', end:'11:00', capacity:30, available:true,  confirmed:true, cutoff:'2026-09-30T23:59:00+05:30' },
        { slotId:'rb_s2', date:'2026-10-01', start:'14:00', end:'15:00', capacity:20, available:false, confirmed:false, cutoff:'2026-09-30T23:59:00+05:30' },
      ]} },
    { id:'humayun_tomb',  name:"Humayun's Tomb",     lat:28.5933, lng:77.2507, category:'monument',    subCategories:['mughal','heritage'], tags:['UNESCO','history','architecture'],open:'06:00', close:'18:00', closedDays:[], temporaryClosures:[], duration:{min:60,ideal:90,max:120}, cost:600, otherCost:0, priority:'HIGH',   existingInterest:0.8, modifiers:{flagship:1,unesco:1,mustSee:1,seasonal:0,campaign:0}, outdoorSens:0.7, accessRestricted:false, restricted:false, eligibleDays:null, transportAccess:['walk','taxi','transit'], booking:null },
    { id:'lodhi_garden',  name:'Lodhi Garden',       lat:28.5933, lng:77.2220, category:'garden',      subCategories:['park','heritage'],   tags:['nature','history','walking'],   open:'05:00', close:'20:00', closedDays:[], temporaryClosures:[], duration:{min:45,ideal:60,max:90},  cost:0,   otherCost:0, priority:'MEDIUM', existingInterest:0.6, modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0.5,campaign:0}, outdoorSens:0.9, accessRestricted:false, restricted:false, eligibleDays:null, transportAccess:['walk','taxi','transit'], booking:null },
    { id:'safdarjung',    name:'Safdarjung Tomb',    lat:28.5918, lng:77.2098, category:'monument',    subCategories:['mughal','heritage'], tags:['history','architecture'],       open:'06:00', close:'18:00', closedDays:[], temporaryClosures:[], duration:{min:30,ideal:45,max:60},  cost:25,  otherCost:0, priority:'LOW',    existingInterest:0.4, modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0}, outdoorSens:0.6, accessRestricted:false, restricted:false, eligibleDays:null, transportAccess:['walk','taxi','transit'], booking:null },
    { id:'qutub_minar',   name:'Qutub Minar',        lat:28.5245, lng:77.1855, category:'monument',    subCategories:['islamic','heritage'],tags:['UNESCO','history','architecture'],open:'07:00', close:'17:00', closedDays:[], temporaryClosures:[], duration:{min:60,ideal:90,max:120}, cost:600, otherCost:0, priority:'HIGH',   existingInterest:0.8, modifiers:{flagship:1,unesco:1,mustSee:1,seasonal:0,campaign:0}, outdoorSens:0.8, accessRestricted:false, restricted:false, eligibleDays:null, transportAccess:['walk','taxi','transit'], booking:null },
    // --- Day 1-2: South Delhi ---
    { id:'iskcon_temple', name:'ISKCON Temple',      lat:28.5618, lng:77.2116, category:'religious',   subCategories:['temple','hindu'],    tags:['spiritual','architecture'],     open:'04:30', close:'13:00', closedDays:[], temporaryClosures:[], duration:{min:30,ideal:60,max:90},  cost:0,   otherCost:0, priority:'MEDIUM', existingInterest:0.5, modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0}, outdoorSens:0.4, accessRestricted:false, restricted:false, eligibleDays:null, transportAccess:['walk','taxi','transit'], booking:null },
    { id:'dilli_haat',    name:'Dilli Haat',         lat:28.5726, lng:77.2071, category:'market',      subCategories:['craft','food'],      tags:['culture','shopping','food'],    open:'10:30', close:'22:00', closedDays:[], temporaryClosures:[], duration:{min:60,ideal:90,max:120}, cost:30,  otherCost:0, priority:'MEDIUM', existingInterest:0.5, modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0.3,campaign:0}, outdoorSens:0.5, accessRestricted:false, restricted:false, eligibleDays:null, transportAccess:['walk','taxi','transit'], booking:null },
    { id:'national_zoological',name:'Delhi Zoo',     lat:28.6005, lng:77.2388, category:'zoo',         subCategories:['wildlife','nature'], tags:['nature','family'],              open:'09:00', close:'17:00', closedDays:['Fri'], temporaryClosures:[], duration:{min:90,ideal:120,max:180}, cost:80, otherCost:0, priority:'MEDIUM', existingInterest:0.5, modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0}, outdoorSens:0.95,accessRestricted:false, restricted:false, eligibleDays:null, transportAccess:['walk','taxi','transit'], booking:null },
    { id:'garden_of_five_senses',name:'Garden of Five Senses',lat:28.5052,lng:77.1930,category:'garden',subCategories:['park','art'],tags:['nature','photography'],open:'09:00',close:'18:00',closedDays:['Mon'],temporaryClosures:[],duration:{min:60,ideal:90,max:120},cost:30,otherCost:0,priority:'LOW',existingInterest:0.4,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0.5,campaign:0},outdoorSens:0.9,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'mehrauli_complex',name:'Mehrauli Archaeological Park',lat:28.5215,lng:77.1853,category:'monument',subCategories:['mughal','heritage'],tags:['history','archaeology'],open:'08:00',close:'18:00',closedDays:[],temporaryClosures:[],duration:{min:60,ideal:90,max:120},cost:0,otherCost:0,priority:'LOW',existingInterest:0.4,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.7,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    // --- Day 2-3: North Delhi ---
    { id:'akshardham',    name:'Akshardham Temple',  lat:28.6127, lng:77.2773, category:'religious',   subCategories:['temple','hindu'],    tags:['architecture','spiritual','modern'],open:'09:30',close:'18:30',closedDays:['Mon'],temporaryClosures:[],duration:{min:120,ideal:180,max:240},cost:170,otherCost:0,priority:'HIGH',existingInterest:0.7,modifiers:{flagship:1,unesco:0,mustSee:1,seasonal:0,campaign:0},outdoorSens:0.6,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'old_delhi_walk', name:'Old Delhi Heritage Walk',lat:28.6505,lng:77.2310,category:'experience',subCategories:['walking_tour','heritage'],tags:['culture','history','food'],open:'08:00',close:'12:00',closedDays:[],temporaryClosures:[],duration:{min:90,ideal:120,max:180},cost:500,otherCost:0,priority:'MEDIUM',existingInterest:0.6,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:1},outdoorSens:0.8,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:{required:true,slots:[
      {slotId:'odw_s1',date:'2026-10-01',start:'08:00',end:'10:30',capacity:15,available:true,confirmed:true,cutoff:'2026-09-30T23:59:00+05:30'},
      {slotId:'odw_s2',date:'2026-10-02',start:'08:00',end:'10:30',capacity:15,available:true,confirmed:true,cutoff:'2026-10-01T23:59:00+05:30'},
    ]}},
    { id:'purana_qila',   name:'Purana Qila',        lat:28.6086, lng:77.2429, category:'fort',        subCategories:['mughal','heritage'], tags:['history','architecture'],       open:'07:00',close:'17:00',closedDays:[],temporaryClosures:[],duration:{min:60,ideal:90,max:120},cost:25,otherCost:0,priority:'MEDIUM',existingInterest:0.6,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.7,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'lal_quila_museum',name:'Red Fort Museum',  lat:28.6564,lng:77.2410,category:'museum',subCategories:['history','mughal'],tags:['heritage','culture'],open:'09:30',close:'16:30',closedDays:['Mon'],temporaryClosures:[],duration:{min:45,ideal:60,max:90},cost:0,otherCost:0,priority:'LOW',existingInterest:0.5,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.1,accessRestricted:false,restricted:false,eligibleDays:[0,1],transportAccess:['walk','taxi','transit'],booking:null},
    { id:'national_gallery_modern_art',name:'National Gallery of Modern Art',lat:28.6118,lng:77.2311,category:'gallery',subCategories:['art','modern'],tags:['culture','art','photography'],open:'11:00',close:'18:30',closedDays:['Mon'],temporaryClosures:[],duration:{min:60,ideal:90,max:120},cost:150,otherCost:0,priority:'MEDIUM',existingInterest:0.6,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.0,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    // --- Day 3-4: West Delhi ---
    { id:'rajghat',       name:'Rajghat',             lat:28.6416, lng:77.2499, category:'monument',    subCategories:['memorial','history'],tags:['history','peace'],              open:'05:00',close:'18:00',closedDays:[],temporaryClosures:[],duration:{min:30,ideal:45,max:60},cost:0,otherCost:0,priority:'MEDIUM',existingInterest:0.6,modifiers:{flagship:0,unesco:0,mustSee:1,seasonal:0,campaign:0},outdoorSens:0.7,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'sikh_gurdwara', name:'Gurudwara Bangla Sahib',lat:28.6272,lng:77.2096,category:'religious',subCategories:['gurdwara','sikh'],tags:['spiritual','architecture'],open:'04:00',close:'22:00',closedDays:[],temporaryClosures:[],duration:{min:30,ideal:45,max:60},cost:0,otherCost:0,priority:'MEDIUM',existingInterest:0.5,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.3,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'parliament_house',name:'Parliament House',  lat:28.6172,lng:77.2074,category:'monument',subCategories:['government'],tags:['architecture','history'],open:'09:00',close:'17:00',closedDays:['Sat','Sun'],temporaryClosures:[],duration:{min:60,ideal:90,max:120},cost:0,otherCost:0,priority:'LOW',existingInterest:0.4,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.5,accessRestricted:true,restricted:false,eligibleDays:null,transportAccess:['taxi','transit'],booking:null},
    { id:'national_science_museum',name:'National Science Centre',lat:28.6191,lng:77.2388,category:'museum',subCategories:['science','interactive'],tags:['family','education'],open:'10:00',close:'17:30',closedDays:['Mon'],temporaryClosures:[],duration:{min:90,ideal:120,max:180},cost:60,otherCost:0,priority:'LOW',existingInterest:0.3,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.1,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'hauz_khas',     name:'Hauz Khas Village',   lat:28.5494,lng:77.2001,category:'neighborhood',subCategories:['heritage','nightlife'],tags:['culture','food','heritage'],open:'11:00',close:'23:00',closedDays:[],temporaryClosures:[],duration:{min:60,ideal:90,max:120},cost:0,otherCost:0,priority:'MEDIUM',existingInterest:0.6,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.5,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    // --- Day 4-5: East Delhi ---
    { id:'swaminarayan_akshardham_e',name:'Akshardham East Wing',lat:28.6133,lng:77.2779,category:'religious',subCategories:['temple','hindu'],tags:['architecture','spiritual'],open:'09:30',close:'18:30',closedDays:['Mon'],temporaryClosures:[],duration:{min:60,ideal:90,max:120},cost:0,otherCost:0,priority:'LOW',existingInterest:0.4,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.6,accessRestricted:false,restricted:false,eligibleDays:[4,5],transportAccess:['walk','taxi','transit'],booking:null},
    { id:'craft_museum',  name:'Crafts Museum',       lat:28.6125,lng:77.2398,category:'museum',subCategories:['craft','culture'],tags:['heritage','art','craft'],open:'09:30',close:'18:00',closedDays:['Mon'],temporaryClosures:[],duration:{min:60,ideal:90,max:120},cost:20,otherCost:0,priority:'MEDIUM',existingInterest:0.5,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.3,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'pragati_maidan',name:'Pragati Maidan',      lat:28.6165,lng:77.2438,category:'exhibition',subCategories:['fair','modern'],tags:['culture','events'],open:'10:00',close:'18:00',closedDays:[],temporaryClosures:[],duration:{min:60,ideal:90,max:120},cost:100,otherCost:0,priority:'LOW',existingInterest:0.3,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.6,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'lotus_temple',  name:'Lotus Temple',        lat:28.5535,lng:77.2588,category:'religious',subCategories:['bahai'],tags:['architecture','peace','modern'],open:'09:00',close:'17:30',closedDays:['Mon'],temporaryClosures:[],duration:{min:45,ideal:60,max:90},cost:0,otherCost:0,priority:'HIGH',existingInterest:0.7,modifiers:{flagship:1,unesco:0,mustSee:1,seasonal:0,campaign:0},outdoorSens:0.5,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'tughlaqabad',   name:'Tughlaqabad Fort',    lat:28.4772,lng:77.2710,category:'fort',subCategories:['heritage','ruins'],tags:['history','architecture','ruins'],open:'07:00',close:'17:00',closedDays:[],temporaryClosures:[],duration:{min:60,ideal:90,max:120},cost:25,otherCost:0,priority:'LOW',existingInterest:0.4,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.8,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['taxi','transit'],booking:null},
    // --- Day 5-6: Monuments + Restaurants ---
    { id:'jantar_mantar', name:'Jantar Mantar',       lat:28.6272,lng:77.2165,category:'monument',subCategories:['observatory','history'],tags:['science','history','architecture'],open:'09:00',close:'17:30',closedDays:[],temporaryClosures:[],duration:{min:30,ideal:45,max:60},cost:25,otherCost:0,priority:'MEDIUM',existingInterest:0.6,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.8,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'national_handicrafts',name:'National Handicrafts & Handlooms Museum',lat:28.6130,lng:77.2391,category:'museum',subCategories:['craft','heritage'],tags:['art','culture','shopping'],open:'09:30',close:'18:00',closedDays:['Mon'],temporaryClosures:[],duration:{min:45,ideal:60,max:90},cost:20,otherCost:0,priority:'LOW',existingInterest:0.4,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.2,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'nehru_memorial',name:'Nehru Memorial Museum',lat:28.5989,lng:77.1997,category:'museum',subCategories:['history','political'],tags:['history','heritage'],open:'09:00',close:'17:30',closedDays:['Mon'],temporaryClosures:[],duration:{min:45,ideal:60,max:90},cost:0,otherCost:0,priority:'LOW',existingInterest:0.4,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.3,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'delhi_haat_pitampura',name:'Delhi Haat Pitampura',lat:28.7014,lng:77.1306,category:'market',subCategories:['craft','food'],tags:['culture','shopping','food'],open:'10:30',close:'22:00',closedDays:[],temporaryClosures:[],duration:{min:60,ideal:90,max:120},cost:30,otherCost:0,priority:'LOW',existingInterest:0.3,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.5,accessRestricted:false,restricted:false,eligibleDays:[5,6],transportAccess:['taxi','transit'],booking:null},
    // --- Restaurants (used for meal preference scoring) ---
    { id:'karim_hotel',   name:"Karim's Hotel",       lat:28.6498,lng:77.2320,category:'restaurant',subCategories:['mughlai'],tags:['food','famous','nonveg'],open:'09:00',close:'23:00',closedDays:[],temporaryClosures:[],duration:{min:30,ideal:60,max:90},cost:600,otherCost:0,priority:'HIGH',existingInterest:0.8,modifiers:{flagship:1,unesco:0,mustSee:1,seasonal:0,campaign:0},outdoorSens:0.1,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null,cuisine:['mughlai','kebab'],dietTags:['nonveg']},
    { id:'bukhara_restaurant',name:'Bukhara Restaurant',lat:28.5995,lng:77.1706,category:'restaurant',subCategories:['punjabi','tandoor'],tags:['food','premium','nonveg'],open:'12:30',close:'23:30',closedDays:[],temporaryClosures:[],duration:{min:60,ideal:90,max:120},cost:2500,otherCost:0,priority:'HIGH',existingInterest:0.7,modifiers:{flagship:1,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.0,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['taxi','transit'],booking:null,cuisine:['punjabi','tandoor'],dietTags:['nonveg']},
    { id:'saravana_bhavan',name:'Saravana Bhavan',    lat:28.6274,lng:77.2169,category:'restaurant',subCategories:['south_indian'],tags:['food','veg'],open:'08:00',close:'23:00',closedDays:[],temporaryClosures:[],duration:{min:30,ideal:45,max:60},cost:300,otherCost:0,priority:'MEDIUM',existingInterest:0.5,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.0,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null,cuisine:['south_indian'],dietTags:['veg']},
    { id:'indian_accent', name:'Indian Accent',       lat:28.5468,lng:77.1987,category:'restaurant',subCategories:['modern_indian'],tags:['food','premium','fine_dining'],open:'12:00',close:'23:00',closedDays:[],temporaryClosures:[],duration:{min:60,ideal:90,max:120},cost:3000,otherCost:0,priority:'HIGH',existingInterest:0.8,modifiers:{flagship:1,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.0,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['taxi','transit'],booking:{required:true,slots:[
      {slotId:'ia_s1',date:'2026-10-01',start:'19:00',end:'21:00',capacity:4,available:true,confirmed:true,cutoff:'2026-10-01T15:00:00+05:30'},
      {slotId:'ia_s2',date:'2026-10-02',start:'19:30',end:'21:30',capacity:4,available:true,confirmed:true,cutoff:'2026-10-02T15:00:00+05:30'},
    ]},cuisine:['modern_indian','fusion'],dietTags:['veg','nonveg']},
    { id:'dl_restaurant_veg',name:'Pure Veg Delight', lat:28.6310,lng:77.2160,category:'restaurant',subCategories:['north_indian'],tags:['food','veg','budget'],open:'11:00',close:'22:30',closedDays:[],temporaryClosures:[],duration:{min:30,ideal:45,max:60},cost:250,otherCost:0,priority:'LOW',existingInterest:0.3,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.0,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null,cuisine:['north_indian'],dietTags:['veg']},
    // --- More monuments / parks for variety ---
    { id:'sunder_nursery',name:'Sunder Nursery',      lat:28.5918,lng:77.2459,category:'garden',subCategories:['park','heritage'],tags:['nature','photography','heritage'],open:'07:00',close:'19:00',closedDays:['Mon'],temporaryClosures:[],duration:{min:45,ideal:60,max:90},cost:25,otherCost:0,priority:'MEDIUM',existingInterest:0.6,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0.6,campaign:0},outdoorSens:0.9,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'national_rail_museum',name:'National Rail Museum',lat:28.5988,lng:77.1906,category:'museum',subCategories:['transport','history'],tags:['family','heritage','trains'],open:'09:30',close:'17:30',closedDays:['Mon'],temporaryClosures:[],duration:{min:60,ideal:90,max:120},cost:50,otherCost:0,priority:'LOW',existingInterest:0.4,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.7,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'agrasen_baoli', name:'Agrasen ki Baoli',    lat:28.6260,lng:77.2241,category:'monument',subCategories:['stepwell','heritage'],tags:['history','architecture','photography'],open:'07:00',close:'18:00',closedDays:[],temporaryClosures:[],duration:{min:20,ideal:30,max:45},cost:0,otherCost:0,priority:'MEDIUM',existingInterest:0.6,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:1},outdoorSens:0.6,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'bangla_sahib_dhabha',name:'Guru Ka Langar', lat:28.6264,lng:77.2096,category:'restaurant',subCategories:['langar'],tags:['food','free','veg','spiritual'],open:'05:00',close:'23:00',closedDays:[],temporaryClosures:[],duration:{min:20,ideal:30,max:45},cost:0,otherCost:0,priority:'LOW',existingInterest:0.4,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.2,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null,cuisine:['langar'],dietTags:['veg']},
    { id:'walled_city_haveli',name:'Walled City Haveli Tour',lat:28.6521,lng:77.2330,category:'experience',subCategories:['heritage','walking_tour'],tags:['history','architecture','culture'],open:'09:00',close:'13:00',closedDays:[],temporaryClosures:[],duration:{min:90,ideal:120,max:150},cost:800,otherCost:0,priority:'MEDIUM',existingInterest:0.6,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:1},outdoorSens:0.7,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'mehrauli_village',name:'Mehrauli Village Walk',lat:28.5240,lng:77.1870,category:'experience',subCategories:['heritage','walking_tour'],tags:['history','craft','culture'],open:'09:00',close:'13:00',closedDays:[],temporaryClosures:[],duration:{min:60,ideal:90,max:120},cost:500,otherCost:0,priority:'LOW',existingInterest:0.4,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.7,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    // --- Additional museums / galleries ---
    { id:'delhi_art_gallery',name:'Delhi Art Gallery',lat:28.6105,lng:77.2266,category:'gallery',subCategories:['contemporary_art'],tags:['art','culture','photography'],open:'11:00',close:'19:00',closedDays:['Mon'],temporaryClosures:[],duration:{min:45,ideal:60,max:90},cost:0,otherCost:0,priority:'LOW',existingInterest:0.4,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.0,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'chhatarpur_temple',name:'Chhatarpur Temple',lat:28.5020,lng:77.1837,category:'religious',subCategories:['temple','hindu'],tags:['spiritual','architecture'],open:'06:00',close:'22:00',closedDays:[],temporaryClosures:[],duration:{min:45,ideal:60,max:90},cost:0,otherCost:0,priority:'MEDIUM',existingInterest:0.5,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.5,accessRestricted:false,restricted:false,eligibleDays:[5,6],transportAccess:['taxi','transit'],booking:null},
    { id:'selected_artworks',name:'Selected Works Gallery',lat:28.5460,lng:77.1960,category:'gallery',subCategories:['modern_art'],tags:['art','photography','culture'],open:'10:00',close:'18:00',closedDays:['Sun','Mon'],temporaryClosures:[],duration:{min:45,ideal:60,max:90},cost:200,otherCost:0,priority:'LOW',existingInterest:0.4,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.0,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    // --- Places for testing specific constraints ---
    // Safety alert place (day 3)
    { id:'blocked_place',  name:'Blocked Safety Place',lat:28.6400,lng:77.2400,category:'monument',subCategories:['test'],tags:['test'],open:'09:00',close:'17:00',closedDays:[],temporaryClosures:[],duration:{min:30,ideal:60,max:90},cost:50,otherCost:0,priority:'LOW',existingInterest:0.2,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.9,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    // Outdoor place for storm day (day 4)
    { id:'storm_outdoor',  name:'Storm Day Outdoor Site',lat:28.5800,lng:77.2600,category:'garden',subCategories:['park'],tags:['nature'],open:'07:00',close:'19:00',closedDays:[],temporaryClosures:[],duration:{min:45,ideal:60,max:90},cost:0,otherCost:0,priority:'MEDIUM',existingInterest:0.5,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.9,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    // Road closure pair
    { id:'road_close_a',   name:'Road Closure Side A',lat:28.6600,lng:77.2200,category:'monument',subCategories:['test'],tags:['test'],open:'08:00',close:'20:00',closedDays:[],temporaryClosures:[],duration:{min:30,ideal:45,max:60},cost:0,otherCost:0,priority:'LOW',existingInterest:0.2,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.3,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'road_close_b',   name:'Road Closure Side B',lat:28.6620,lng:77.2220,category:'monument',subCategories:['test'],tags:['test'],open:'08:00',close:'20:00',closedDays:[],temporaryClosures:[],duration:{min:30,ideal:45,max:60},cost:0,otherCost:0,priority:'LOW',existingInterest:0.2,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.3,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    // Must-visit place
    { id:'must_visit_place',name:'Mandatory Highlight',lat:28.6350,lng:77.2250,category:'monument',subCategories:['heritage'],tags:['must_see'],open:'09:00',close:'18:00',closedDays:[],temporaryClosures:[],duration:{min:45,ideal:60,max:90},cost:100,otherCost:0,priority:'HIGH',existingInterest:0.9,modifiers:{flagship:1,unesco:0,mustSee:1,seasonal:0,campaign:0},outdoorSens:0.4,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    // Access-restricted place (for A5 test)
    { id:'access_restricted_place',name:'Access Restricted Site',lat:28.6450,lng:77.2350,category:'park',subCategories:['protected'],tags:['nature'],open:'10:00',close:'16:00',closedDays:[],temporaryClosures:[],duration:{min:45,ideal:60,max:90},cost:200,otherCost:0,priority:'LOW',existingInterest:0.3,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.9,accessRestricted:true,restricted:true,eligibleDays:null,transportAccess:['walk'],booking:null},
    // A transport-suspension-sensitive place
    { id:'metro_dependent', name:'Metro Dependent Site',lat:28.6250,lng:77.2700,category:'museum',subCategories:['modern'],tags:['culture'],open:'10:00',close:'19:00',closedDays:['Mon'],temporaryClosures:[],duration:{min:60,ideal:90,max:120},cost:100,otherCost:0,priority:'MEDIUM',existingInterest:0.5,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.1,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['transit'],booking:null},
    // Additional places to fill pools to 10-13
    { id:'nature_walk_1',  name:'Yamuna Biodiversity Park',lat:28.7200,lng:77.1700,category:'garden',subCategories:['nature_reserve'],tags:['nature','bird_watching'],open:'06:00',close:'18:00',closedDays:[],temporaryClosures:[],duration:{min:60,ideal:90,max:120},cost:0,otherCost:0,priority:'LOW',existingInterest:0.3,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0.4,campaign:0},outdoorSens:0.95,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['taxi','transit'],booking:null},
    { id:'coronation_park',name:'Coronation Park',    lat:28.7105,lng:77.1530,category:'garden',subCategories:['park','heritage'],tags:['history','nature'],open:'06:00',close:'18:00',closedDays:[],temporaryClosures:[],duration:{min:30,ideal:45,max:60},cost:0,otherCost:0,priority:'LOW',existingInterest:0.2,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.9,accessRestricted:false,restricted:false,eligibleDays:[5,6],transportAccess:['taxi'],booking:null},
    { id:'tibetan_colony', name:'Majnu ka Tilla (Tibetan Colony)',lat:28.7053,lng:77.2166,category:'neighborhood',subCategories:['culture','food'],tags:['culture','food','photography'],open:'10:00',close:'21:00',closedDays:[],temporaryClosures:[],duration:{min:45,ideal:60,max:90},cost:0,otherCost:0,priority:'MEDIUM',existingInterest:0.5,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.5,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'shanti_van',     name:'Shanti Van',          lat:28.6460,lng:77.2530,category:'garden',subCategories:['memorial','park'],tags:['history','peace','nature'],open:'05:00',close:'18:00',closedDays:[],temporaryClosures:[],duration:{min:30,ideal:45,max:60},cost:0,otherCost:0,priority:'LOW',existingInterest:0.3,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.9,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'double_storey',  name:'Double Storey Market', lat:28.5683,lng:77.2113,category:'market',subCategories:['local_market'],tags:['shopping','culture'],open:'10:00',close:'20:00',closedDays:['Sun'],temporaryClosures:[],duration:{min:30,ideal:60,max:90},cost:0,otherCost:0,priority:'LOW',existingInterest:0.2,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.5,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'ambedkar_memorial',name:'Ambedkar Memorial', lat:28.6422,lng:77.2500,category:'monument',subCategories:['memorial'],tags:['history','politics'],open:'09:00',close:'17:00',closedDays:['Mon'],temporaryClosures:[],duration:{min:30,ideal:45,max:60},cost:0,otherCost:0,priority:'LOW',existingInterest:0.3,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.5,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'sabarmati_ashram_delhi',name:'Gandhi Smriti', lat:28.6004,lng:77.2014,category:'museum',subCategories:['history','memorial'],tags:['history','peace','gandhi'],open:'09:00',close:'17:30',closedDays:['Mon'],temporaryClosures:[],duration:{min:45,ideal:60,max:90},cost:0,otherCost:0,priority:'MEDIUM',existingInterest:0.5,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.4,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'khan_market',    name:'Khan Market',          lat:28.6000,lng:77.2258,category:'market',subCategories:['premium_market'],tags:['shopping','food','premium'],open:'10:00',close:'21:00',closedDays:['Sun'],temporaryClosures:[],duration:{min:60,ideal:90,max:120},cost:0,otherCost:0,priority:'LOW',existingInterest:0.4,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.5,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'dastarkhwan_restaurant',name:'Dastarkhwan',   lat:28.6510,lng:77.2340,category:'restaurant',subCategories:['mughlai'],tags:['food','nonveg','local'],open:'12:00',close:'23:00',closedDays:[],temporaryClosures:[],duration:{min:30,ideal:60,max:90},cost:500,otherCost:0,priority:'MEDIUM',existingInterest:0.6,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.1,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null,cuisine:['mughlai','biryani'],dietTags:['nonveg']},
    { id:'triveni_kala_sangam',name:'Triveni Kala Sangam',lat:28.6273,lng:77.2212,category:'gallery',subCategories:['art','culture'],tags:['art','theatre','culture'],open:'11:00',close:'19:30',closedDays:['Mon'],temporaryClosures:[],duration:{min:45,ideal:60,max:90},cost:0,otherCost:0,priority:'LOW',existingInterest:0.4,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.2,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'daryaganj_book_market',name:'Daryaganj Book Market',lat:28.6480,lng:77.2430,category:'market',subCategories:['books'],tags:['culture','books'],open:'10:00',close:'18:00',closedDays:[],temporaryClosures:[],duration:{min:45,ideal:60,max:90},cost:0,otherCost:0,priority:'LOW',existingInterest:0.3,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0,campaign:0},outdoorSens:0.5,accessRestricted:false,restricted:false,eligibleDays:[0,1,2],transportAccess:['walk','taxi','transit'],booking:null},
    { id:'hazrat_nizamuddin',name:'Hazrat Nizamuddin Dargah',lat:28.5912,lng:77.2432,category:'religious',subCategories:['dargah','sufi'],tags:['spiritual','music','heritage'],open:'05:00',close:'22:00',closedDays:[],temporaryClosures:[],duration:{min:45,ideal:60,max:90},cost:0,otherCost:0,priority:'HIGH',existingInterest:0.7,modifiers:{flagship:1,unesco:0,mustSee:1,seasonal:0,campaign:0},outdoorSens:0.5,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
    { id:'yamuna_ghat',    name:'Yamuna Ghat',          lat:28.6557,lng:77.2599,category:'experience',subCategories:['river','nature'],tags:['nature','photography','sunset'],open:'05:00',close:'20:00',closedDays:[],temporaryClosures:[],duration:{min:30,ideal:45,max:60},cost:0,otherCost:0,priority:'LOW',existingInterest:0.3,modifiers:{flagship:0,unesco:0,mustSee:0,seasonal:0.4,campaign:0},outdoorSens:0.9,accessRestricted:false,restricted:false,eligibleDays:null,transportAccess:['walk','taxi','transit'],booking:null},
  ];

  // ── Day pools (10-13 places per day) ─────────────────────────────────────
  const dayPools = [
    // Day 0 – Central Delhi monuments (2026-09-29, Mon: some places closed)
    ['red_fort','jama_masjid','chandni_chowk','india_gate','national_museum',
     'rajghat','craft_museum','national_gallery_modern_art','agrasen_baoli',
     'must_visit_place','karim_hotel','dl_restaurant_veg','daryaganj_book_market'],
    // Day 1 – South Delhi + heritage (2026-09-30)
    ['humayun_tomb','lodhi_garden','safdarjung','qutub_minar','iskcon_temple',
     'dilli_haat','sunder_nursery','hazrat_nizamuddin','national_rail_museum',
     'saravana_bhavan','indian_accent','selected_artworks'],
    // Day 2 – North + East Delhi (2026-10-01)
    ['akshardham','old_delhi_walk','purana_qila','rajghat','pragati_maidan',
     'national_science_museum','jama_masjid','walled_city_haveli',
     'dastarkhwan_restaurant','triveni_kala_sangam','lal_quila_museum',
     'bangla_sahib_dhabha','yamuna_ghat'],
    // Day 3 – Safety alert + storm prep (2026-10-02)
    ['qutub_minar','mehrauli_complex','garden_of_five_senses','hauz_khas',
     'chhatarpur_temple','tughlaqabad','blocked_place','storm_outdoor',
     'road_close_a','road_close_b','lotus_temple','mehrauli_village'],
    // Day 4 – Storm day (outdoors blocked) (2026-10-03)
    ['national_museum','national_gallery_modern_art','craft_museum',
     'national_handicrafts','nehru_memorial','national_science_museum',
     'delhi_art_gallery','sabarmati_ashram_delhi','swaminarayan_akshardham_e',
     'triveni_kala_sangam','dl_restaurant_veg','bukhara_restaurant',
     'metro_dependent'],
    // Day 5 – West + rain day (2026-10-04)
    ['jantar_mantar','sikh_gurdwara','rashtrapati','parliament_house',
     'jantar_mantar','tibetan_colony','nature_walk_1','coronation_park',
     'delhi_haat_pitampura','chhatarpur_temple','access_restricted_place',
     'khan_market','ambedkar_memorial'],
    // Day 6 – Final day (2026-10-05)
    ['india_gate','india_gate','lodhi_garden','hauz_khas','double_storey',
     'yamuna_ghat','shanti_van','dilli_haat','must_visit_place',
     'national_rail_museum','sabarmati_ashram_delhi','dastarkhwan_restaurant'],
  ];

  // Collect all IDs used in pools (+ hotel IDs)
  const hotelIds = [...new Set(hotels.map((h) => h.id))];
  const poolIds  = [...new Set(dayPools.flat())];
  // Filter places to only those referenced in pools
  const usedPlaces = places.filter((p) => poolIds.includes(p.id));

  // All locations for matrix
  const allLocations = [
    ...hotels.filter((h, i, a) => a.findIndex((x) => x.id === h.id) === i),
    ...usedPlaces,
  ];

  const travelMatrix = buildMockMatrix(allLocations);

  // ── Days ─────────────────────────────────────────────────────────────────
  const dates = [
    '2026-09-29','2026-09-30','2026-10-01',
    '2026-10-02','2026-10-03','2026-10-04','2026-10-05',
  ];
  const dayObjs = dates.map((date, i) => ({
    dayIndex: i,
    date,
    dayStart: '08:00',
    dayEnd:   '20:00',
    startLocation: hotels[i],
    endLocation:   hotels[i],
    dailyBudget: i === 3 ? 3000 : null,   // Day 3 has a tight daily budget
    pool: [...dayPools[i]],               // intentional dupes retained for dedup test
  }));

  // ── Context ───────────────────────────────────────────────────────────────
  // Day 3 (2026-10-02): safety alert on blocked_place + road closure
  // Day 4 (2026-10-03): STORM day (blocks outdoor places + walk mode)
  // Day 5 (2026-10-04): rain day + transit suspension
  const context = {
    weather: {
      '2026-09-29': { condition: 'clear',      tempC: 32, rain: 0.0, wind: 0.1 },
      '2026-09-30': { condition: 'cloudy',     tempC: 30, rain: 0.1, wind: 0.2 },
      '2026-10-01': { condition: 'clear',      tempC: 31, rain: 0.0, wind: 0.1 },
      '2026-10-02': { condition: 'rain',       tempC: 28, rain: 0.5, wind: 0.3 },
      '2026-10-03': { condition: 'storm',      tempC: 26, rain: 1.0, wind: 0.9 },
      '2026-10-04': { condition: 'heavy_rain', tempC: 27, rain: 0.8, wind: 0.5 },
      '2026-10-05': { condition: 'cloudy',     tempC: 29, rain: 0.1, wind: 0.2 },
    },
    closures: [
      { placeId: 'blocked_place', date: '2026-10-02' },
    ],
    safetyAlerts: [
      { placeId: 'blocked_place',    date: '2026-10-02', level: 'block' },
    ],
    environmentalRestrictions: [
      { placeId: 'access_restricted_place', date: '2026-10-04' },
    ],
    roadClosures: [
      { fromId: 'road_close_a', toId: 'road_close_b', date: '2026-10-02' },
    ],
    transportSuspensions: [
      { mode: 'transit', date: '2026-10-04', from: '14:00', to: '18:00' },
    ],
    events: [
      { placeId: 'hazrat_nizamuddin', date: '2026-09-30', note: 'Weekly Qawwali night' },
    ],
  };

  const full = {
    trip: {
      tripId: 'trip_full_delhi_001',
      currency: 'INR',
      totalBudget: 80000,
      partySize: 2,
      bookingTime: '2026-09-28T07:00:00+05:30',
    },
    user: {
      interests: { history: 0.9, architecture: 0.8, museum: 0.7, food: 0.7, nature: 0.5, art: 0.5, religious: 0.4, shopping: 0.2 },
      explicitInterests: ['mughal', 'UNESCO', 'heritage', 'fort', 'monument'],
      dislikes: ['shopping', 'market'],
      modePreference: { taxi: 'preferred', transit: 'acceptable', walk: 'low' },
      allowedModes: ['walk', 'taxi', 'transit'],
      comfortPreference: 'standard',
      transferTolerance: 2,
      maxWalkKm: 1.5,
      waitingToleranceMin: 20,
      weather: { tempPrefMin: 20, tempPrefMax: 32, coldTol: 8, heatTol: 8, rainTol: 0.5, windTol: 0.4 },
      costPreference: 'balanced',
      preferredCostRange: null,
      meals: {
        lunch: {
          windowStart: '12:00', windowEnd: '14:30', preferredTime: '13:00',
          timeTolerance: 60, durationMin: 45, durationTolerance: 30,
          diet: 'nonveg', cuisines: ['mughlai', 'north_indian', 'south_indian'],
          locationPref: 'near_next_attraction', avgCost: 600,
        },
        dinner: {
          windowStart: '19:00', windowEnd: '21:30', preferredTime: '20:00',
          timeTolerance: 60, durationMin: 60, durationTolerance: 30,
          diet: 'nonveg', cuisines: ['north_indian', 'mughlai'],
          locationPref: 'near_next_attraction', avgCost: 1000,
        },
      },
      mustVisit: ['red_fort', 'must_visit_place', 'humayun_tomb', 'qutub_minar'],
      mustAvoid: ['access_restricted_place'],
      mandatoryGroups: [
        { category: 'museum', count: 2, mode: 'atLeast' },
      ],
      forbiddenCategories: [],
      minPlacesPerDay: 3,
      maxPlacesPerDay: 7,
    },
    days: dayObjs,
    places: usedPlaces,
    travelMatrix,
    transportServices: {
      walk:    { open: '05:00', close: '23:59' },
      transit: { open: '06:00', close: '22:00', transferMin: 10,
                 departures: ['06:00','06:30','07:00','07:30','08:00','08:30',
                              '09:00','09:30','10:00','10:30','11:00','11:30',
                              '12:00','12:30','13:00','13:30','14:00','14:30',
                              '15:00','15:30','16:00','16:30','17:00','17:30',
                              '18:00','18:30','19:00','19:30','20:00','20:30'] },
      taxi:    { open: '00:00', close: '23:59' },
    },
    context,
  };

  return full;
}

// ── Write files ────────────────────────────────────────────────────────────────

mkdirSync(__dir, { recursive: true });
const small = generateSmall();
const full  = generateFull();
save('trip_small.json', small);
save('trip_full.json',  full);
console.log('Done.');
