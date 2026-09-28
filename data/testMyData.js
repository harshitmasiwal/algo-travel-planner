/**
 * data/testMyData.js
 * ─────────────────────────────────────────────────────────────────────────
 * Apna data file validate karne ke liye run karo:
 *
 *   node data/testMyData.js data/trip_small.json
 *   node data/testMyData.js data/trip_full.json
 *   node data/testMyData.js data/my_real_trip.json
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from 'fs';
import { validateInput } from '../src/validateInput.js';
import { normalizeInput } from '../src/normalizeInput.js';

// ── File kahan se leni hai ────────────────────────────────────────────────
const filePath = process.argv[2];

if (!filePath) {
  console.error('❌ File path do!\n');
  console.error('   Usage: node data/testMyData.js data/trip_small.json\n');
  process.exit(1);
}

console.log(`\n📂 Testing file: ${filePath}\n`);
console.log('─'.repeat(50));

// ── Step 1: File Padhna ───────────────────────────────────────────────────
let raw;
try {
  const content = readFileSync(filePath, 'utf8');
  raw = JSON.parse(content);
  console.log('✅ Step 1: JSON file padh li (no syntax errors)');
} catch (e) {
  console.error(`❌ Step 1 FAILED: JSON parse error\n   ${e.message}`);
  process.exit(1);
}

// ── Step 2: Validation ────────────────────────────────────────────────────
try {
  validateInput(raw);
  console.log('✅ Step 2: Validation PASSED (sab fields sahi hain)');
} catch (e) {
  console.error('❌ Step 2 FAILED: Validation errors:\n');
  if (e.issues) {
    e.issues.forEach((issue, i) => {
      console.error(`   ${i + 1}. ${issue}`);
    });
  } else {
    console.error(`   ${e.message}`);
  }
  process.exit(1);
}

// ── Step 3: Normalize ─────────────────────────────────────────────────────
let norm;
try {
  norm = normalizeInput(raw);
  console.log('✅ Step 3: Normalization PASSED (data internally convert hua)');
} catch (e) {
  console.error(`❌ Step 3 FAILED: ${e.message}`);
  process.exit(1);
}

// ── Summary Report ────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(50));
console.log('📊  DATA SUMMARY');
console.log('─'.repeat(50));

console.log(`\n🧳 TRIP`);
console.log(`   ID:       ${norm.trip.tripId}`);
console.log(`   Budget:   ₹${norm.trip.totalBudget}`);
console.log(`   Party:    ${norm.trip.partySize} log`);
console.log(`   Currency: ${norm.trip.currency}`);

console.log(`\n📅 DAYS (${norm.days.length} din)`);
norm.days.forEach((d) => {
  const start = d.dayStart;
  const end   = d.dayEnd;
  const sh = String(Math.floor(start / 60)).padStart(2, '0');
  const sm = String(start % 60).padStart(2, '0');
  const eh = String(Math.floor(end / 60)).padStart(2, '0');
  const em = String(end % 60).padStart(2, '0');
  console.log(`   Day ${d.dayIndex}: ${d.date}  ${sh}:${sm}–${eh}:${em}  (${d.pool.length} places in pool)`);
  if (d.dailyBudget) console.log(`          Daily budget: ₹${d.dailyBudget}`);
});

console.log(`\n📍 PLACES (${norm.places.size} total)`);
const byCategory = {};
norm.places.forEach((p) => {
  byCategory[p.category] = (byCategory[p.category] || 0) + 1;
});
Object.entries(byCategory).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
  console.log(`   ${cat.padEnd(20)} → ${count} place(s)`);
});

// Must-visit check
if (norm.user.mustVisit.length > 0) {
  console.log(`\n⭐ MUST VISIT (${norm.user.mustVisit.length} places)`);
  norm.user.mustVisit.forEach((pid) => {
    const p = norm.places.get(pid);
    const status = p ? `✅ Found: ${p.name}` : `❌ NOT FOUND in places!`;
    console.log(`   ${pid} → ${status}`);
  });
}

// Dedup log
if (norm.dedupLog.length > 0) {
  console.log(`\n⚠️  DUPLICATES REMOVED (${norm.dedupLog.length})`);
  norm.dedupLog.forEach((msg) => console.log(`   ${msg}`));
}

// Travel matrix check
const matModes = Object.keys(norm.travelMatrix.modes);
console.log(`\n🚗 TRAVEL MATRIX`);
console.log(`   Locations: ${norm.travelMatrix.ids.length}`);
console.log(`   Modes:     ${matModes.join(', ')}`);

// Sample distances (first hotel to first place)
const firstHotelId = norm.days[0]?.startLocation?.id;
const firstPlaceId = norm.days[0]?.pool?.[0];
if (firstHotelId && firstPlaceId) {
  console.log(`\n   Sample distances (${firstHotelId} → ${firstPlaceId}):`);
  for (const mode of matModes) {
    const info = norm.travelMatrix.lookup(firstHotelId, firstPlaceId, mode);
    if (info) {
      console.log(`   ${mode.padEnd(10)}: ${info.minutes.toFixed(1)} min  |  ${info.km.toFixed(2)} km`);
    }
  }
}

console.log('\n' + '─'.repeat(50));
console.log('🎉  Data is READY for the optimizer!');
console.log('─'.repeat(50));
console.log('\n⏭️  Next: Phase 2-5 complete hone ke baad ye command chalega:');
console.log(`   node src/cli.js ${filePath}\n`);
