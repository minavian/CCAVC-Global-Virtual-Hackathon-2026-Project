// Runs the lab's checks (tests/lab-cases.mjs) with Node's test runner: `node --test` from the
// project's folder (Node 22.12 or newer, which loads the lab's ES module files as they are). The
// same checks run in the browser at tests/index.html.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// The lab finds the physics engine where the page puts it.
globalThis.RFID = { physics: require('../js/rfid/physics.js') };
const L = await import('../js/intro/lab-model.js');
const { labCases } = await import('./lab-cases.mjs');
for (const [name, fn] of labCases(assert, L)) test(name, fn);
