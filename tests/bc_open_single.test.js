const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/content/bc_enhance.js'), 'utf8');
const actionStart = source.indexOf('  function secondaryAction(el){');
const actionEnd = source.indexOf('  function singleResultFocusMetadata(target){', actionStart);
const activationStart = source.indexOf('  function activateSingle(row,target,onAttempt){');
const activationEnd = source.indexOf('  function claimSingleResultJob(job){', activationStart);
assert.notEqual(actionStart, -1);
assert.notEqual(actionEnd, -1);
assert.notEqual(activationStart, -1);
assert.notEqual(activationEnd, -1);

const context = {
  document: { activeElement: null },
  window: { top: { location: { href: 'https://businesscentral.test/?page=42#bc-tools-open-single' } } },
  location: { href: 'https://businesscentral.test/?page=42#bc-tools-open-single' },
  URL,
  currentPageId: () => '42',
  KeyboardEvent: class KeyboardEvent {
    constructor(type, options) { this.type = type; Object.assign(this, options); }
  },
  singleVisible: element => !!element.visible
};
vm.createContext(context);
vm.runInContext([
  source.slice(actionStart, actionEnd),
  source.slice(activationStart, activationEnd),
  'globalThis.testActionFor = actionFor; globalThis.testActivate = activateSingle; globalThis.testSnapshot = singleNavigationSnapshot;'
].join('\n'), context);

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

assert.equal(context.testSnapshot().href, 'https://businesscentral.test/?page=42', 'hash is excluded from navigation snapshot');
context.window.top.location.href = 'https://businesscentral.test/?page=42#bc-tools-open-single';
assert.equal(context.testSnapshot().href, 'https://businesscentral.test/?page=42', 'hash-only difference is not navigation');
context.window.top.location.href = 'https://businesscentral.test/?page=42&filter=active#bc-tools-open-single';
assert.notEqual(context.testSnapshot().href, 'https://businesscentral.test/?page=42', 'real URL change remains detectable');

console.log('Open-single tests passed: focus-gated target selection, lost-focus cancellation, and normalized navigation URL.');