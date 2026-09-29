#!/usr/bin/env node
/**
 * src/cli.js
 * ─────────────────────────────────────────────────────────────────────────────
 * KroTravel Algorithm B – CLI Runner.
 *
 * Usage:
 *   node src/cli.js <input.json> [--out <output.json>] [--seed <number>]
 */

import { readFileSync, writeFileSync } from 'fs';
import { planTrip } from './index.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
KroTravel Algorithm B – Daily Optimization Engine

Usage:
  node src/cli.js <path-to-trip.json> [options]

Options:
  --out <file>    Write JSON output to a file instead of stdout
  --seed <number> Override RNG seed for deterministic runs
  --help, -h      Show this help message

Examples:
  node src/cli.js data/trip_small.json
  node src/cli.js data/trip_full.json --out output.json
`);
    process.exit(0);
  }

  const inputPath = args[0];
  let outPath = null;
  let seedOverride = null;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) {
      outPath = args[++i];
    } else if (args[i] === '--seed' && args[i + 1]) {
      seedOverride = Number(args[++i]);
    }
  }

  let rawJson;
  try {
    const content = readFileSync(inputPath, 'utf8');
    rawJson = JSON.parse(content);
  } catch (err) {
    console.error(`❌ Error reading input file "${inputPath}":\n   ${err.message}`);
    process.exit(1);
  }

  try {
    const configOverride = {};
    if (seedOverride !== null && !isNaN(seedOverride)) {
      configOverride.seed = seedOverride;
    }

    const result = await planTrip(rawJson, configOverride);
    const jsonStr = JSON.stringify(result, null, 2);

    if (outPath) {
      writeFileSync(outPath, jsonStr, 'utf8');
      console.log(`✅ Itinerary successfully written to ${outPath}`);
    } else {
      console.log(jsonStr);
    }
  } catch (err) {
    console.error(`❌ Planning failed:\n   ${err.message}`);
    if (err.issues) {
      console.error('Validation issues:');
      err.issues.forEach((issue) => console.error(`  - ${issue}`));
    }
    process.exit(1);
  }
}

main();
