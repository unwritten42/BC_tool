const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/content/bc_enhance.js'), 'utf8');
const scopeStart = source.indexOf('  function singleResultSearchScope(href){');
const scopeEnd = source.indexOf('  function createSingleResultJob(href){', scopeStart);
const actionStart = source.indexOf('  function secondaryAction(el){');
const actionEnd = source.indexOf('  function singleResultFocusMetadata(target){', actionStart);
const inspectionStart = source.indexOf('  function inspectSingle(){');
const inspectionEnd = source.indexOf('  function activateSingle(row,target,onAttempt){', inspectionStart);
const activationStart = source.indexOf('  function activateSingle(row,target,onAttempt){');
const activationEnd = source.indexOf('  function claimSingleResultJob(job){', activationStart);
const confirmationStart = source.indexOf('  async function activateAndConfirmSingle(job,current){');
const confirmationEnd = source.indexOf('  async function processSingleResult(){', confirmationStart);
const processStart = source.indexOf('  async function processSingleResult(){');
const processEnd = source.indexOf("  if(document.readyState==='loading')", processStart);
assert.notEqual(scopeStart, -1);
assert.notEqual(scopeEnd, -1);
assert.notEqual(actionStart, -1);
assert.notEqual(actionEnd, -1);
assert.notEqual(inspectionStart, -1);
assert.notEqual(inspectionEnd, -1);
assert.notEqual(activationStart, -1);
assert.notEqual(activationEnd, -1);
assert.notEqual(confirmationStart, -1);
assert.notEqual(confirmationEnd, -1);
assert.notEqual(processStart, -1);
assert.notEqual(processEnd, -1);

const context = {
  document: { activeElement: null },
  window: { top: { location: { href: 'https://businesscentral.test/?page=42#bc-tools-open-single' } } },
  location: { href: 'https://businesscentral.test/?page=42#bc-tools-open-single' },
  URL,
  SINGLE_RESULT_AUTOSORT_KEY: 'bcToolsAutoSortBridge',
  currentPageId: () => '42',
  KeyboardEvent: class KeyboardEvent {
    constructor(type, options) { this.type = type; Object.assign(this, options); }
  },
  singleVisible: element => !!element.visible
};
vm.createContext(context);
vm.runInContext([
  source.slice(scopeStart, scopeEnd),
  source.slice(actionStart, actionEnd),
  source.slice(inspectionStart, inspectionEnd),
  source.slice(activationStart, activationEnd),
  'globalThis.testScope = singleResultSearchScope; globalThis.testIdentity = singleResultSearchIdentity; globalThis.testMismatch = singleResultSearchMismatch; globalThis.testBridge = singleResultAutoSortBridge;',
  'globalThis.testActionFor = actionFor; globalThis.testInspect = inspectSingle; globalThis.testActivate = activateSingle; globalThis.testSnapshot = singleNavigationSnapshot;'
].join('\n'), context);

function searchUrl(filter, page = '9305', company = 'CRONUS') {
  const url = new URL('https://businesscentral.test/tenant/Sandbox');
  url.searchParams.set('company', company);
  url.searchParams.set('page', page);
  if (filter) url.searchParams.set('filter', filter);
  return url.href;
}

function mismatch(initial, current, page, company) {
  const original = searchUrl(initial);
  return context.testMismatch({
    scope: context.testScope(original),
    identity: context.testIdentity(original)
  }, searchUrl(current, page, company));
}

const orderFilter = "'No.' IS 'S-ORD101001'";
assert.equal(mismatch(orderFilter, orderFilter), '', 'unchanged filters remain valid');
assert.equal(mismatch(orderFilter, "'Sales Header'.'No.' IS 'S-ORD101001'"), '', 'BC may qualify the original field with its table');
assert.equal(mismatch(orderFilter, "'O''Brien'.'No.' IS 'S-ORD101001'"), '', 'escaped table names remain valid');
assert.equal(mismatch("'No.' IS 'O''Brien'", "'Sales Header'.'No.' IS 'O''Brien'"), '', 'escaped search values are preserved');
assert.equal(mismatch(orderFilter, "'Sales Header'.'No.' IS 'S-ORD101002'"), 'filter-changed', 'another value cancels the job');
assert.equal(mismatch(orderFilter, "'Sales Header'.'Customer No.' IS 'S-ORD101001'"), 'filter-changed', 'another field cancels the job');
assert.equal(mismatch(orderFilter, "'Sales Header'.'No.' IS 'S-ORD101001' AND 'Status' IS 'Open'"), 'filter-changed', 'additional conditions cancel the job');
assert.equal(mismatch("'Sales Header'.'No.' IS 'S-ORD101001'", "'Sales Line'.'No.' IS 'S-ORD101001'"), 'filter-changed', 'changing an already qualified table cancels the job');
assert.equal(mismatch(orderFilter, '', '9305', 'CRONUS'), '', 'existing support for a removed URL filter is preserved');
assert.equal(mismatch(orderFilter, "'Sales Header'.'No.' IS 'S-ORD101001'", '42'), 'page-changed', 'another page still cancels the job');
assert.equal(mismatch(orderFilter, "'Sales Header'.'No.' IS 'S-ORD101001'", '9305', 'OTHER'), 'company-changed', 'another company still cancels the job');

const bridgeNow = Date.now();
const bridgeScope = context.testScope(searchUrl(orderFilter));
const bridgeJob = { createdAt: bridgeNow - 100 };
const bridgeMarker = { ...bridgeScope, startedAt: bridgeNow, expiresAt: bridgeNow + 10000, active: true };
const bridgeStore = marker => ({ getItem: () => JSON.stringify(marker) });
assert.equal(context.testBridge(bridgeJob, searchUrl(orderFilter), bridgeStore(bridgeMarker)).marker.active, true);
assert.equal(context.testBridge(bridgeJob, searchUrl(orderFilter), bridgeStore({ ...bridgeMarker, page: '42' })), null, 'another page cannot block opening');
assert.equal(context.testBridge(bridgeJob, searchUrl(orderFilter), bridgeStore({ ...bridgeMarker, startedAt: bridgeJob.createdAt - 1 })), null, 'an earlier sort cannot block opening');
assert.equal(context.testBridge(bridgeJob, searchUrl(orderFilter), bridgeStore({ ...bridgeMarker, expiresAt: bridgeNow - 1 })), null, 'expired sorts cannot block opening');

function makeAction(label = 'Open') {
  return {
    isConnected: true,
    visible: true,
    disabled: false,
    events: [],
    getAttribute(name) { return name === 'aria-label' ? label : null; },
    closest() { return null; },
    matches() { return false; },
    contains(element) { return this.children?.includes(element) || false; },
    focus() { this.focusCalled = true; },
    dispatchEvent(event) { this.events.push(event.type); }
  };
}

function makeRow(children = []) {
  return {
    isConnected: true,
    visible: true,
    events: [],
    querySelectorAll() { return children; },
    contains(element) { return element === this || children.includes(element); },
    focus() { this.focusCalled = true; },
    dispatchEvent(event) { this.events.push(event.type); }
  };
}

const outsideTarget = {};
context.document.activeElement = outsideTarget;
const link = makeAction();
const button = makeAction('Open');
const cell = {
  isConnected: true,
  visible: true,
  events: [],
  dispatchEvent(event) { this.events.push(event.type); }
};
const uniqueRow = makeRow([link, button, cell]);
assert.equal(context.testActionFor(uniqueRow), null, 'external focus must keep waiting');

let attempts = 0;
context.document.activeElement = cell;
const action = context.testActionFor(uniqueRow);
assert.equal(action.target, cell, 'a focused row cell is the only valid target');
assert.equal(action.strategy, 'focused-enter');
assert.equal(action.count, 0);
assert.equal(context.testActivate(uniqueRow, cell, () => attempts++), true);
assert.equal(cell.focusCalled, undefined, 'activation must not move focus');
assert.deepEqual(cell.events, ['keydown', 'keypress', 'keyup']);
assert.equal(attempts, 1);

context.document.activeElement = uniqueRow;
assert.equal(context.testActionFor(uniqueRow).target, uniqueRow, 'row focus is valid');
assert.equal(context.testActivate(uniqueRow, uniqueRow, () => attempts++), true, 'focused row receives Enter');
assert.deepEqual(uniqueRow.events, ['keydown', 'keypress', 'keyup']);
assert.equal(context.testActivate(uniqueRow, cell, () => attempts++), false, 'lost focus cancels activation');
assert.equal(attempts, 2, 'lost focus must not call onAttempt');
assert.deepEqual(cell.events, ['keydown', 'keypress', 'keyup'], 'lost focus must send no events');

const noLinkRow = makeRow([]);
context.document.activeElement = noLinkRow;
assert.equal(context.testActionFor(noLinkRow).target, noLinkRow, 'focused row works without links');
const checkbox = makeAction();
const menu = makeAction();
const secondaryRow = makeRow([checkbox, menu]);
context.document.activeElement = checkbox;
assert.equal(context.testActionFor(secondaryRow).target, checkbox, 'Business Central focused target is respected');

function makeOpenRecord(no) {
  const el = makeAction();
  el.getAttribute = name => name === 'title' ? `Apri record "${no}"` : null;
  el.click = () => el.events.push('click');
  return el;
}
const openLink = makeOpenRecord('S-ORD101001');
const linkRow = makeRow([openLink, cell]);
context.document.activeElement = outsideTarget;
const linkAction = context.testActionFor(linkRow);
assert.equal(linkAction.target, openLink, 'unique Open record link is used even when focus is outside the row');
assert.equal(linkAction.strategy, 'open-record-click');
assert.equal(context.testActivate(linkRow, openLink, () => attempts++), true);
assert.deepEqual(openLink.events, ['click']);
assert.equal(context.testActionFor(makeRow([makeOpenRecord('A'), makeOpenRecord('B')])), null, 'ambiguous Open record links never open');
const hiddenLink = makeOpenRecord('X'); hiddenLink.visible = false;
context.document.activeElement = outsideTarget;
assert.equal(context.testActionFor(makeRow([hiddenLink])), null, 'hidden link is ignored');
const disabledLink = makeOpenRecord('X'); disabledLink.disabled = true;
assert.equal(context.testActionFor(makeRow([disabledLink])), null, 'disabled link is ignored');
const englishLink = makeOpenRecord('X');
englishLink.getAttribute = name => name === 'title' ? 'Open record "X"' : null;
assert.equal(context.testActionFor(makeRow([englishLink])).target, englishLink, 'English record links are supported');
const detachedLink = makeOpenRecord('X'); detachedLink.isConnected = false;
assert.equal(context.testActivate(makeRow([detachedLink]), detachedLink), false, 'detached links are never clicked');

let grids = [];
context.resultGrids = () => grids;
context.scopedBusy = () => false;
context.scopedTerminal = () => false;
context.cellsOf = () => [{ visible: true, value: 'order' }];
context.cellValue = item => item.value;
context.textOf = item => item.value;
assert.equal(context.testInspect().status, 'no-row', 'no rows never open');
grids = [{ headers: [], rows: [linkRow] }];
assert.equal(context.testInspect().status, 'ready', 'one row with one open link is ready');
grids = [{ headers: [], rows: [linkRow, uniqueRow] }];
assert.equal(context.testInspect().status, 'multiple-rows', 'multiple rows in one grid never open');
grids = [{ headers: [], rows: [linkRow] }, { headers: [], rows: [uniqueRow] }];
assert.equal(context.testInspect().status, 'multiple-rows', 'multiple grids are counted together');

test('opening waits for a stable unique result', async () => {
  async function runSequence(sequence, bridgeAt = () => null) {
    let time = 0;
    let index = 0;
    let opens = 0;
    let openedAt = null;
    const processContext = {
      SINGLE_RESULT_PROCESS_TIMEOUT_MS: 1500,
      Date: { now: () => time },
      document: { activeElement: null },
      window: { top: { location: { href: 'https://businesscentral.test/?page=9305' } } },
      isTopFrame: false,
      pendingSingleResult: () => ({}),
      sharedSessionStorage: () => ({}),
      singleResultAutoSortBridge: () => bridgeAt(time),
      inspectSingle: () => sequence[Math.min(index++, sequence.length - 1)],
      singleResultEvent: () => {},
      singleResultFocusMetadata: () => ({}),
      activateAndConfirmSingle: async () => { opens++; openedAt = time; return 'opened'; },
      sleep: async ms => { time += ms; }
    };
    vm.createContext(processContext);
    vm.runInContext(source.slice(processStart, processEnd) + '\nglobalThis.run = processSingleResult;', processContext);
    await processContext.run();
    return { opens, openedAt };
  }

  const ready = {
    status: 'ready',
    gridCount: 1,
    rowCount: 1,
    signature: 'one-order',
    row: { isConnected: true },
    action: { count: 1, target: { isConnected: true }, strategy: 'open-record-click' }
  };
  const multiple = { status: 'multiple-rows', gridCount: 1, rowCount: 2 };
  assert.equal((await runSequence([multiple])).opens, 0, 'multiple results never activate');
  assert.equal((await runSequence([ready, ready, multiple])).opens, 0, 'a growing list resets the unique-result check');
  assert.equal((await runSequence([multiple, ready, ready, ready])).opens, 1, 'a stable unique result activates once');
  const sorting = await runSequence([ready], time => ({ marker: { active: time < 600 } }));
  assert.equal(sorting.opens, 1, 'a single result opens after autosort finishes');
  assert.equal(sorting.openedAt, 1200, 'sorting resets the consecutive stability checks');
  const legacy = await runSequence([ready], time => time < 600 ? { marker: {} } : null);
  assert.equal(legacy.openedAt, 1200, 'an older active marker remains conservative until it expires');
});

test('diagnostics distinguish a record click from Enter', async () => {
  async function eventsFor(strategy) {
    let time = 0;
    const events = [];
    const confirmContext = {
      Date: { now: () => time },
      claimSingleResultJob: () => true,
      singleNavigationSnapshot: () => ({ href: 'same', pageId: '9305' }),
      singleResultFocusMetadata: () => ({}),
      activateSingle: (_row, _target, onAttempt) => { onAttempt(); return true; },
      singleResultEvent: (event, details) => events.push({ event, details }),
      normalizedSingleNavigationHref: () => 'same',
      currentPageId: () => '9305',
      clearSingleResultJob: () => {},
      sleep: async ms => { time += ms; }
    };
    vm.createContext(confirmContext);
    vm.runInContext(source.slice(confirmationStart, confirmationEnd) + '\nglobalThis.run = activateAndConfirmSingle;', confirmContext);
    assert.equal(await confirmContext.run({}, {
      row: {},
      action: { target: {}, count: 1, strategy }
    }), 'no-navigation');
    return events;
  }

  const clickEvents = await eventsFor('open-record-click');
  assert.equal(clickEvents.some(entry => entry.event === 'enter-sent-to-result-target'), false);
  assert.equal(clickEvents.at(-1).details.reason, 'no-navigation-after-open-record-click');
  const enterEvents = await eventsFor('focused-enter');
  assert.equal(enterEvents.some(entry => entry.event === 'enter-sent-to-result-target'), true);
  assert.equal(enterEvents.at(-1).details.reason, 'no-navigation-after-synthetic-enter');
});

assert.equal(context.testSnapshot().href, 'https://businesscentral.test/?page=42', 'hash is excluded from navigation snapshot');
context.window.top.location.href = 'https://businesscentral.test/?page=42#bc-tools-open-single';
assert.equal(context.testSnapshot().href, 'https://businesscentral.test/?page=42', 'hash-only difference is not navigation');
context.window.top.location.href = 'https://businesscentral.test/?page=42&filter=active#bc-tools-open-single';
assert.notEqual(context.testSnapshot().href, 'https://businesscentral.test/?page=42', 'real URL change remains detectable');

console.log('Open-single tests passed: filter matching, unique-row targeting, and navigation safeguards.');