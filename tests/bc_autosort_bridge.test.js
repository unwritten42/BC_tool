const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/content/bc_autosort.js'), 'utf8');
const start = source.indexOf('  function sortBridgeContext(doc) {');
const end = source.indexOf('  function headerTables(doc) {', start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);

let now = 1000;
const values = new Map();
const storage = {
  getItem: key => values.get(key) || null,
  setItem: (key, value) => values.set(key, value)
};
const top = { sessionStorage: storage };
const context = {
  URL,
  Date: { now: () => now },
  SORT_BRIDGE_SESSION_KEY: 'bcToolsAutoSortBridge',
  SORT_BRIDGE_ACTIVE_TTL_MS: 25000,
  SORT_BRIDGE_GRACE_MS: 8000,
  contextHref: () => 'https://businesscentral.test/tenant/Sandbox?company=CRONUS&page=9305'
};
vm.createContext(context);
vm.runInContext(source.slice(start, end) + '\nglobalThis.mark = markSortBridge; globalThis.finish = finishSortBridge;', context);
const doc = { defaultView: { top } };
const marker = () => JSON.parse(storage.getItem('bcToolsAutoSortBridge'));

context.mark(doc, 'sort-1');
assert.equal(marker().active, true, 'a started sort is marked active');
assert.equal(marker().expiresAt, now + 25000);
now += 100;
context.mark(doc, 'sort-1');
assert.equal(marker().startedAt, 1000, 'multiple clicks retain the operation start');
assert.equal(marker().revision, 2, 'multiple clicks update the existing revision');
context.finish(doc, 'other-sort');
assert.equal(marker().active, true, 'another sort cannot finish the current marker');
now += 500;
context.finish(doc, 'sort-1');
assert.equal(marker().active, false, 'a completed sort clears its active state');
assert.equal(marker().expiresAt, now + 8000, 'the existing reconciliation grace period remains');
context.mark(doc, 'sort-2');
assert.equal(marker().active, true, 'a subsequent sort marks itself active again');
context.finish(doc, 'sort-1');
assert.equal(marker().active, true, 'a stale sort cannot release a newer operation');

console.log('Autosort bridge tests passed.');
