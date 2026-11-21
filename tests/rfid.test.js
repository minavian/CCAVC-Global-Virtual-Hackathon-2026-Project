// Runs tests/cases.js with Node's built-in test runner: node --test tests/
const { test } = require('node:test');
for (const [name, fn] of require('./cases.js')) test(name, fn);
