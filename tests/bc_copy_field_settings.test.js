const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/content/bc_enhance.js'), 'utf8');
const settingsStart = source.indexOf('  function pageFieldCopyEnabled(value) {');
const settingsEnd = source.indexOf('\n\n  // ── stato enforce', settingsStart);
const eligibilityStart = source.indexOf('  function copyFieldEligible(type, key, legacyKey, globalKey = null, globalLegacyKey = null) {');
const eligibilityEnd = source.indexOf('\n  function saveCopyFieldVisibility', eligibilityStart);
const visibilityStart = eligibilityEnd + 1;
const visibilityEnd = source.indexOf('\n  function closeCopyActionsPanel', visibilityStart);
assert.notEqual(settingsStart, -1);
assert.notEqual(settingsEnd, -1);
assert.notEqual(eligibilityStart, -1);
assert.notEqual(eligibilityEnd, -1);
assert.notEqual(visibilityEnd, -1);

let savedVisibility;
let refreshedKey;
let refreshedGrid;
const context = {
  settings: {},
  hiddenCopyFieldKeys: new Set(),
  shownCopyFieldKeys: new Set(),
  hiddenGlobalCopyFieldKeys: new Set(),
  shownGlobalCopyFieldKeys: new Set(),
  chrome: {
    runtime: { lastError:null },
    storage: { local: { set(value, callback) { savedVisibility = value; callback(); } } }
  },
  bcDiagnostic() {},
  refreshCopyFieldColumn(key, grid) {
    refreshedKey = key;
    refreshedGrid = grid;
  }
};
vm.createContext(context);
vm.runInContext(
  "const HIDDEN_COPY_FIELDS_KEY = 'bcToolsHiddenCopyFields';"
    + "const SHOWN_COPY_FIELDS_KEY = 'bcToolsShownCopyFields';"
    + "const GLOBAL_HIDDEN_COPY_FIELDS_KEY = 'bcToolsHiddenCopyFieldsGlobal';"
    + "const GLOBAL_SHOWN_COPY_FIELDS_KEY = 'bcToolsShownCopyFieldsGlobal';"
    + source.slice(settingsStart, settingsEnd)
    + source.slice(eligibilityStart, eligibilityEnd)
    + source.slice(visibilityStart, visibilityEnd)
    + '\nglobalThis.copySettings = { enabled:pageFieldCopyEnabled, mode:pageFieldCopyMode };'
    + '\nglobalThis.isCopyFieldEligible = copyFieldEligible;'
    + '\nglobalThis.setCopyFieldHidden = setCopyFieldHidden;',
  context
);

const { enabled, mode } = context.copySettings;
const allOff = {
  showPageFieldCopyButton:true,
  pageFieldCopyEnabled:true,
  pageFieldCopyClickable:false,
  pageFieldCopyFlowField:false,
  pageFieldCopyMode:'none'
};
assert.equal(enabled(allOff), true, 'master enable stays active when both field types are off');
assert.equal(mode(allOff), 'none', 'no field type is enabled by default');
context.settings = allOff;
assert.equal(context.isCopyFieldEligible('underlined', 'copy-one'), false);
context.shownCopyFieldKeys.add('copy-one');
assert.equal(context.isCopyFieldEligible('underlined', 'copy-one'), true, 'manual show overrides default type selection');
context.hiddenCopyFieldKeys.add('copy-one');
assert.equal(context.isCopyFieldEligible('underlined', 'copy-one'), false, 'manual hide takes precedence');

const onlyClickable = { ...allOff, pageFieldCopyClickable:true, pageFieldCopyMode:'underlined' };
context.settings = onlyClickable;
context.hiddenCopyFieldKeys.clear();
context.shownCopyFieldKeys.clear();
assert.equal(context.isCopyFieldEligible('underlined', 'copy-two'), true);
assert.equal(context.isCopyFieldEligible('teal', 'copy-three'), false);
context.shownCopyFieldKeys.add('copy-legacy-index');
assert.equal(context.isCopyFieldEligible('underlined', 'copy-stable-column', 'copy-legacy-index'), true, 'legacy index-based preferences remain recognized');
context.shownCopyFieldKeys.clear();

const disabledMaster = { ...onlyClickable, pageFieldCopyEnabled:false };
context.settings = disabledMaster;
context.shownCopyFieldKeys.add('copy-three');
assert.equal(enabled(disabledMaster), false);
assert.equal(mode(disabledMaster), 'none');
assert.equal(context.isCopyFieldEligible('teal', 'copy-three'), false, 'disabled master hides even manually shown fields');

context.hiddenCopyFieldKeys.clear();
context.shownCopyFieldKeys.clear();
context.setCopyFieldHidden('copy-four', false);
assert.deepEqual(Array.from(context.shownCopyFieldKeys), ['copy-four']);
assert.deepEqual(Array.from(savedVisibility.bcToolsShownCopyFields), ['copy-four'], 'manual show is persisted');
assert.equal(refreshedKey, 'copy-four');
const savedBeforeRepeatedShow = savedVisibility;
refreshedKey = null;
const selectedGrid = {};
context.setCopyFieldHidden('copy-four', false, selectedGrid);
assert.equal(refreshedKey, 'copy-four', 'repeating show refreshes the column even when its preference is already saved');
assert.equal(savedVisibility, savedBeforeRepeatedShow, 'repeating show does not rewrite unchanged preferences');
assert.equal(refreshedGrid, selectedGrid, 'refresh stays inside the grid where the context menu was opened');
assert.equal(refreshedGrid, selectedGrid, 'refresh stays inside the grid where the context menu was opened');
context.setCopyFieldHidden('copy-four', true);
assert.deepEqual(Array.from(context.hiddenCopyFieldKeys), ['copy-four']);
assert.deepEqual(Array.from(context.shownCopyFieldKeys), []);
assert.deepEqual(Array.from(savedVisibility.bcToolsHiddenCopyFields), ['copy-four'], 'manual hide is persisted');
context.setCopyFieldHidden('copy-five', false, null, 'copy-five-legacy');
assert.deepEqual(Array.from(context.shownCopyFieldKeys).sort(), ['copy-five', 'copy-five-legacy']);
context.setCopyFieldHidden('copy-five', true, null, 'copy-five-legacy');
assert.deepEqual(Array.from(context.hiddenCopyFieldKeys).sort(), ['copy-five', 'copy-five-legacy', 'copy-four']);

const refreshStart = source.indexOf('  function refreshCopyFieldColumn(key, grid = null) {');
const refreshEnd = source.indexOf('\n  function copyFieldEligible', refreshStart);
assert.notEqual(refreshStart, -1);
assert.notEqual(refreshEnd, -1);
const refreshedCells = [];
const visitedFields = [];
const makeField = (key, cell) => ({ key, children:[], closest() { return cell; } });
const selectedCell = {
  columnIndex:8,
  matches() { return false; }
};
const otherCell = {
  columnIndex:6,
  matches() { return false; }
};
const selectedField = makeField('copy-target', selectedCell);
const otherField = makeField('copy-other', otherCell);
const refreshGrid = { isConnected:true, querySelectorAll() { visitedFields.push(selectedField, otherField); return visitedFields; } };
const refreshContext = {
  document: { querySelectorAll() { throw new Error('column refresh scanned the whole document'); } },
  copyFieldIdentity(field) { return { key:field.key, legacyKey:field.key }; },
  pageFieldType() { return 'underlined'; },
  copyFieldEligible() { return true; },
  addCopyButton(cell) { refreshedCells.push(cell); }
};
vm.createContext(refreshContext);
vm.runInContext(
  "const COPY_CELL_SELECTOR = 'td,[role=gridcell],[role=cell]';"
    + source.slice(refreshStart, refreshEnd)
    + '\nglobalThis.refresh = refreshCopyFieldColumn;',
  refreshContext
);
refreshContext.refresh('copy-target', refreshGrid);
assert.deepEqual(refreshedCells, [selectedCell], 'refresh only adds a button to the field with the selected stable identity');
assert.deepEqual(visitedFields, [selectedField, otherField], 'refresh inspects the selected grid but not the whole document');

const identityStart = source.indexOf('  function copyFieldHash(value) {');
const identityEnd = source.indexOf('\n  function validHiddenCopyFieldKeys', identityStart);
assert.notEqual(identityStart, -1);
assert.notEqual(identityEnd, -1);
const identityContext = {
  URL,
  settings:{},
  location:{ href:'https://businesscentral.dynamics.com/Production?company=FMI&page=7335&bookmark=record-one' },
  headersOf(grid) { return grid.headers; },
  textOf(header) { return header.label; },
  normLabel(label) { return String(label).trim().toLowerCase(); },
  copyColumnIndex(cell) { return cell.index; }
};
vm.createContext(identityContext);
vm.runInContext(
  source.slice(identityStart, identityEnd)
    + '\nglobalThis.identify = copyFieldIdentity;',
  identityContext
);
const firstGrid = { headers:[{cellIndex:4,label:'Nr. articolo'}] };
const firstCell = { cellIndex:4, closest() { return firstGrid; } };
const firstIdentity = identityContext.identify(null, firstCell);
identityContext.location.href = 'https://businesscentral.dynamics.com/Production?company=FMI&page=7335&bookmark=record-two';
const nextGrid = { headers:[{cellIndex:8,label:'Nr. articolo'}] };
const nextCell = { cellIndex:8, closest() { return nextGrid; } };
const nextIdentity = identityContext.identify(null, nextCell);
assert.equal(nextIdentity.key, firstIdentity.key, 'same page and column share a preference across records and column positions');
assert.notEqual(nextIdentity.legacyKey, firstIdentity.legacyKey, 'legacy keys retain the old column-index distinction');
identityContext.location.href = 'https://businesscentral.dynamics.com/Production?company=FMI&page=7336&bookmark=record-two';
assert.notEqual(identityContext.identify(null, nextCell).key, firstIdentity.key, 'different BC pages retain separate preferences');
identityContext.settings.pageFieldCopyGlobalPreferences = true;
identityContext.location.href = 'https://businesscentral.dynamics.com/Production?company=FMI&page=7335';
identityContext.settings.pageFieldCopyGlobalPreferences = false;
const contextualIdentity = identityContext.identify(null, firstCell);
context.settings = { showPageFieldCopyButton:true, pageFieldCopyEnabled:true, pageFieldCopyGlobalPreferences:false };
context.setCopyFieldHidden(contextualIdentity.key, false, null, contextualIdentity.legacyKey, false);
identityContext.settings.pageFieldCopyGlobalPreferences = true;
const globalIdentity = identityContext.identify(null, firstCell);
identityContext.location.href = 'https://businesscentral.dynamics.com/Sandbox?company=CRONUS&page=7335';
const otherCompanyGlobalIdentity = identityContext.identify(null, nextCell);
assert.equal(otherCompanyGlobalIdentity.key, globalIdentity.key, 'global preference key ignores environment and company');
assert.equal(otherCompanyGlobalIdentity.globalScope, true);
identityContext.location.href = 'https://businesscentral.dynamics.com/Sandbox?company=CRONUS&page=7336';
assert.notEqual(identityContext.identify(null, nextCell).key, globalIdentity.key, 'global preference remains isolated by Page ID');
identityContext.location.href = 'https://businesscentral.dynamics.com/Sandbox?company=CRONUS&page=7335';
identityContext.settings.pageFieldCopyGlobalPreferences = false;
assert.notEqual(identityContext.identify(null, nextCell).key, globalIdentity.key, 'contextual mode selects its separately stored key');
identityContext.settings.pageFieldCopyGlobalPreferences = true;
context.settings = { showPageFieldCopyButton:true, pageFieldCopyEnabled:true, pageFieldCopyGlobalPreferences:true };
context.setCopyFieldHidden(globalIdentity.key, false, null, globalIdentity.legacyKey, globalIdentity.globalScope);
const expectedGlobalKeys = [globalIdentity.key, globalIdentity.legacyKey].sort();
assert.deepEqual(Array.from(context.shownGlobalCopyFieldKeys).sort(), expectedGlobalKeys);
assert.deepEqual(Array.from(savedVisibility.bcToolsShownCopyFieldsGlobal).sort(), expectedGlobalKeys, 'global Show is stored under its own key');
assert.equal(Object.prototype.hasOwnProperty.call(savedVisibility, 'bcToolsShownCopyFields'), false, 'global Show does not overwrite contextual storage');
assert.equal(context.isCopyFieldEligible('', otherCompanyGlobalIdentity.key, otherCompanyGlobalIdentity.legacyKey, otherCompanyGlobalIdentity.globalKey, otherCompanyGlobalIdentity.globalLegacyKey), true, 'global Show applies in another environment and company');
context.setCopyFieldHidden(otherCompanyGlobalIdentity.key, true, null, otherCompanyGlobalIdentity.legacyKey, otherCompanyGlobalIdentity.globalScope);
assert.equal(context.isCopyFieldEligible('', globalIdentity.key, globalIdentity.legacyKey, globalIdentity.globalKey, globalIdentity.globalLegacyKey), false, 'global Hide applies in the other company');
context.setCopyFieldHidden(globalIdentity.key, false, null, globalIdentity.legacyKey, globalIdentity.globalScope);
const contextualShownBeforeGlobalMode = Array.from(context.shownCopyFieldKeys);
context.settings.pageFieldCopyGlobalPreferences = false;
assert.deepEqual(Array.from(context.shownCopyFieldKeys), contextualShownBeforeGlobalMode, 'switching back retains contextual preferences');
assert.equal(context.isCopyFieldEligible('', contextualIdentity.key, contextualIdentity.legacyKey, contextualIdentity.globalKey, contextualIdentity.globalLegacyKey), true, 'the previous contextual Show becomes active again');
assert.deepEqual(Array.from(context.shownGlobalCopyFieldKeys).sort(), expectedGlobalKeys, 'switching modes retains global preferences');
context.settings = { ...onlyClickable, pageFieldCopyGlobalPreferences:true };
assert.equal(context.isCopyFieldEligible('underlined', 'copy-auto1', null, 'copy-auto2'), true, 'automatic field-type defaults remain global and unchanged');
assert.equal(context.isCopyFieldEligible('teal', 'copy-auto3', null, 'copy-auto4'), false);
identityContext.location.href = 'https://businesscentral.dynamics.com/Production?company=FMI&page=7335&bookmark=record-two';
const duplicateGrid = { headers:[{cellIndex:4,label:'Codice'},{cellIndex:8,label:'Codice'}] };
const duplicateFirst = identityContext.identify(null, { cellIndex:4, closest() { return duplicateGrid; } });
const duplicateSecond = identityContext.identify(null, { cellIndex:8, closest() { return duplicateGrid; } });
assert.notEqual(duplicateFirst.key, duplicateSecond.key, 'duplicate captions remain distinguishable by column index');
identityContext.settings.pageFieldCopyGlobalPreferences = true;
assert.notEqual(identityContext.identify(null, { cellIndex:4, closest() { return duplicateGrid; } }).key,
  identityContext.identify(null, { cellIndex:8, closest() { return duplicateGrid; } }).key,
  'global preferences also distinguish duplicate captions');
identityContext.settings.pageFieldCopyGlobalPreferences = false;

const topLocation = { href:'https://businesscentral.dynamics.com/tenant/Sandbox?company=CRONUS&page=21' };
identityContext.window = { top:{ location:topLocation } };
identityContext.location.href = 'https://businesscentral.dynamics.com/tenant/Sandbox?runinframe=1';
function framedCell(pageId) {
  return {
    cellIndex:4,
    closest(selector) {
      return selector === '[data-page-id]'
        ? { getAttribute() { return pageId; } }
        : firstGrid;
    }
  };
}
const customersColumn = identityContext.identify(null, framedCell('22'));
const itemsColumn = identityContext.identify(null, framedCell('31'));
assert.notEqual(customersColumn.key, itemsColumn.key, 'same caption in different DOM pages must not share a preference when the iframe URL has no page');
assert.notEqual(customersColumn.legacyKey, itemsColumn.legacyKey, 'legacy aliases must also remain page-specific');
const ambiguousIdentity = identityContext.copyFieldPreferenceKeys('https://businesscentral.dynamics.com/tenant/Sandbox||', 'nr. articolo', 4, false);
context.settings = allOff;
context.hiddenCopyFieldKeys.clear();
context.shownCopyFieldKeys.clear();
context.shownCopyFieldKeys.add(ambiguousIdentity.key);
context.shownCopyFieldKeys.add(ambiguousIdentity.legacyKey);
assert.equal(context.isCopyFieldEligible('', customersColumn.key, customersColumn.legacyKey), false, 'unscoped legacy preferences are not inherited by a DOM page');
context.shownCopyFieldKeys.clear();
context.setCopyFieldHidden(customersColumn.key, false, null, customersColumn.legacyKey);
assert.equal(context.isCopyFieldEligible('', itemsColumn.key, itemsColumn.legacyKey), false, 'manual Show must not leak into another iframe page');
context.setCopyFieldHidden(customersColumn.key, true, null, customersColumn.legacyKey);
context.settings = onlyClickable;
assert.equal(context.isCopyFieldEligible('underlined', itemsColumn.key, itemsColumn.legacyKey), true, 'manual Hide must not leak into another iframe page');
topLocation.href = 'https://businesscentral.dynamics.com/tenant/Sandbox?company=CRONUS&page=31&bookmark=other';
assert.equal(identityContext.identify(null, framedCell('22')).key, customersColumn.key, 'underlying DOM pages keep their identity when top navigation changes');
identityContext.location.href = 'https://businesscentral.dynamics.com/tenant/Sandbox?Company=CRONUS&Page=22';
assert.equal(identityContext.identify(null, firstCell).key, customersColumn.key, 'direct and iframe navigation use the same identity, including URL aliases');
identityContext.location.href = 'https://businesscentral.dynamics.com/tenant/Sandbox?company=CRONUS&page=21';
assert.equal(identityContext.identify(null, framedCell('22')).key, customersColumn.key, 'DOM page ID overrides an iframe URL pointing at another SPA page');
identityContext.location.href = 'https://businesscentral.dynamics.com/tenant/Sandbox?runinframe=1';
assert.equal(identityContext.identify(null, firstCell).key, itemsColumn.key, 'top URL supplies page and company when no DOM page ID is available');
topLocation.href = 'https://businesscentral.dynamics.com/tenant/Sandbox?company=OTHER&page=31';
assert.notEqual(identityContext.identify(null, framedCell('22')).key, customersColumn.key, 'companies remain isolated when resolved from the top URL');
identityContext.location.href = 'https://businesscentral.dynamics.com/tenant/Sandbox?Company=CRONUS&pageId=22';
Object.defineProperty(identityContext.window, 'top', { get() { throw new Error('Cross-origin access denied'); } });
assert.equal(identityContext.identify(null, firstCell).key, customersColumn.key, 'cross-origin top access falls back to the current frame context');
delete identityContext.window;

context.settings = allOff;
context.hiddenCopyFieldKeys.clear();
context.shownCopyFieldKeys.clear();
for (const pageId of [42, 50, 7335]) {
  identityContext.location.href = `https://businesscentral.dynamics.com/tenant/Production?company=FMI&page=${pageId}&bookmark=document-one&filter=first`;
  const documentOne = identityContext.identify(null, firstCell);
  context.setCopyFieldHidden(documentOne.key, false, null, documentOne.legacyKey);
  const persistedShow = JSON.parse(JSON.stringify(savedVisibility));
  context.hiddenCopyFieldKeys = new Set(persistedShow.bcToolsHiddenCopyFields);
  context.shownCopyFieldKeys = new Set(persistedShow.bcToolsShownCopyFields);

  identityContext.location.href = `https://businesscentral.dynamics.com/tenant/Production?company=FMI&page=${pageId}&bookmark=document-two&filter=second&mode=edit#different-record`;
  const documentTwo = identityContext.identify(null, nextCell);
  assert.equal(documentTwo.key, documentOne.key, `page ${pageId}: document, filter and mode do not change the saved column preference`);
  assert.equal(context.isCopyFieldEligible('', documentTwo.key, documentTwo.legacyKey), true, `page ${pageId}: another document inherits Show after reloading saved preferences, even with automatic types disabled`);

  identityContext.location.href = `https://businesscentral.dynamics.com/tenant/Production?company=FMI&page=${pageId + 10000}&bookmark=document-two`;
  const differentPage = identityContext.identify(null, nextCell);
  assert.equal(context.isCopyFieldEligible('', differentPage.key, differentPage.legacyKey), false, 'the same column caption on another page does not inherit the preference');

  context.setCopyFieldHidden(documentTwo.key, true, null, documentTwo.legacyKey);
  const persistedHide = JSON.parse(JSON.stringify(savedVisibility));
  context.hiddenCopyFieldKeys = new Set(persistedHide.bcToolsHiddenCopyFields);
  context.shownCopyFieldKeys = new Set(persistedHide.bcToolsShownCopyFields);
  assert.equal(context.isCopyFieldEligible('teal', documentOne.key, documentOne.legacyKey), false, `page ${pageId}: Hide also applies to the other document after reloading saved preferences`);
}

const flowHeader = { cellIndex:4, id:'flow-header', label:'Disponibilita', getAttribute() { return null; } };
const headerTable = { headers:[flowHeader], querySelectorAll() { return []; } };
const flowGrid = {
  isConnected:true,
  headers:[flowHeader],
  querySelectorAll() { return [flowField]; }
};
const gridParent = selector => selector === '.ms-nav-grid-container' ? flowGrid : headerTable;
flowHeader.closest = gridParent;
const flowCell = {
  cellIndex:8,
  getAttribute(name) { return name === 'aria-labelledby' ? 'flow-header flow-value' : null; },
  closest:gridParent
};
const flowField = {
  innerText:'0',
  children:[],
  classList:{ contains() { return false; } },
  getAttribute() { return null; },
  closest(selector) { return selector.startsWith('td,') ? flowCell : flowGrid; }
};
const flowCopies = [];
const flowTimers = [];
Object.assign(identityContext, {
  settings:{},
  hiddenCopyFieldKeys:new Set(),
  shownCopyFieldKeys:new Set(),
  pageFieldCopyEnabled() { return true; },
  pageFieldCopyMode() { return 'none'; },
  visible() { return true; },
  getComputedStyle() { return {cursor:'pointer', color:'rgb(0, 120, 130)'}; },
  addCopyButton(cell, label, eligible, type, field, key) { flowCopies.push({cell, eligible, type, field, key}); },
  closeCopyActionsPanel() {},
  addCopyActionsToContextMenu() {},
  setTimeout(callback) { flowTimers.push(callback); }
});
const contextStart = source.indexOf('  function handleCopyContextMenu(event) {');
const contextEnd = source.indexOf("\n  document.addEventListener('contextmenu'", contextStart);
const valueStart = source.indexOf('  function copyablePageFieldText(field) {');
const valueEnd = source.indexOf('\n  async function writeClipboardText', valueStart);
const typeStart = source.indexOf('  function pageFieldType(element) {');
const typeEnd = source.indexOf('\n  function enhanceClickablePageFields', typeStart);
for (const boundary of [contextStart, contextEnd, valueStart, valueEnd, typeStart, typeEnd]) assert.notEqual(boundary, -1);
vm.runInContext(
  'let pendingCopyColumn = null;'
    + source.slice(valueStart, valueEnd)
    + source.slice(typeStart, typeEnd)
    + source.slice(refreshStart, refreshEnd)
    + source.slice(eligibilityStart, eligibilityEnd)
    + source.slice(contextStart, contextEnd)
    + '\nglobalThis.openCopyContext = handleCopyContextMenu;'
    + '\nglobalThis.pendingCopyTarget = () => pendingCopyColumn;'
    + '\nglobalThis.refreshFlowColumn = refreshCopyFieldColumn;',
  identityContext
);
identityContext.openCopyContext({ target:{ closest() { return flowHeader; } }, clientX:20, clientY:30 });
const flowTarget = identityContext.pendingCopyTarget();
assert.equal(flowTarget.grid, flowGrid, 'context menu must target the outer grid, not its separate header table');
assert.equal(identityContext.identify(flowField, flowCell).key, flowTarget.key, 'FlowField ARIA header reference overrides a mismatched physical index');
identityContext.shownCopyFieldKeys.add(flowTarget.key);
identityContext.refreshFlowColumn(flowTarget.key, flowTarget.grid);
assert.equal(flowCopies.length, 1, 'manual Show refreshes the FlowField synchronously without waiting for storage or timers');
assert.equal(flowCopies[0].eligible, true);
assert.equal(flowCopies[0].type, 'teal');
assert.equal(flowCopies[0].field, flowField, 'zero-valued FlowFields remain copyable');

const enhancementStart = source.indexOf('  function enhanceClickablePageFields(cells = null) {');
const enhancementEnd = source.indexOf('\n  function copyCellsFromMutations', enhancementStart);
assert.notEqual(enhancementStart, -1);
assert.notEqual(enhancementEnd, -1);
identityContext.document = { querySelectorAll() { return [flowField]; } };
vm.runInContext(source.slice(enhancementStart, enhancementEnd)
  + '\nglobalThis.enhanceFields = enhanceClickablePageFields;', identityContext);
identityContext.settings = { pageFieldCopyGlobalPreferences:true };
const reloadedGlobalIdentity = identityContext.identify(flowField, flowCell);
const persistedGlobalShow = JSON.stringify([reloadedGlobalIdentity.key, reloadedGlobalIdentity.legacyKey]);
identityContext.hiddenGlobalCopyFieldKeys = new Set();
identityContext.shownGlobalCopyFieldKeys = new Set(JSON.parse(persistedGlobalShow));
identityContext.hiddenCopyFieldKeys = new Set();
identityContext.shownCopyFieldKeys = new Set();
flowCopies.length = 0;
identityContext.enhanceFields();
assert.equal(flowCopies.at(-1).eligible, true, 'initial enhancement restores global Show from persisted keys after reload');
identityContext.hiddenGlobalCopyFieldKeys = new Set(JSON.parse(persistedGlobalShow));
identityContext.shownGlobalCopyFieldKeys.clear();
identityContext.pageFieldCopyMode = () => 'both';
identityContext.enhanceFields();
assert.equal(flowCopies.at(-1).eligible, false, 'initial enhancement restores global Hide even with automatic field types enabled');
identityContext.settings.pageFieldCopyGlobalPreferences = false;
identityContext.pageFieldCopyMode = () => 'none';
const reloadedContextualIdentity = identityContext.identify(flowField, flowCell);
identityContext.shownCopyFieldKeys = new Set([reloadedContextualIdentity.key]);
identityContext.enhanceFields();
assert.equal(flowCopies.at(-1).eligible, true, 'switching back restores contextual Show independently of global Hide');

const ariaGrid = { headers:[{cellIndex:2, label:'Saldo', getAttribute() { return '9'; }}] };
const ariaCell = {cellIndex:5, getAttribute(name) { return name === 'aria-colindex' ? '9' : null; }, closest() { return ariaGrid; }};
const ariaHeaderIdentity = identityContext.identify(null, {...ariaGrid.headers[0], closest() { return ariaGrid; }});
assert.equal(identityContext.identify(null, ariaCell).key, ariaHeaderIdentity.key, 'ARIA column indices take precedence over differing table positions');

const panelElements = [];
const menuActions = [];
const panelContext = {
  document:{
    body:{ appendChild() {} },
    createElement() {
      const element = {
        dataset:{}, style:{}, children:[], listeners:{},
        setAttribute() {},
        addEventListener(name, listener) { this.listeners[name] = listener; },
        appendChild(child) { this.children.push(child); },
        getBoundingClientRect() { return {height:80}; }
      };
      panelElements.push(element);
      return element;
    }
  },
  window:{innerWidth:1200, innerHeight:800},
  dismissCopyActionsPanel() { menuActions.push('dismiss'); },
  setCopyFieldHidden(...args) { menuActions.push(args); }
};
vm.createContext(panelContext);
const panelStart = source.indexOf('  function showCopyActionsPanel(');
const panelEnd = source.indexOf('\n  function addCopyActionsToContextMenu', panelStart);
assert.notEqual(panelStart, -1);
assert.notEqual(panelEnd, -1);
vm.runInContext(
  'let copyActionsGrid, copyActionsLegacyKey, copyActionsPanel, copyActionsMenu;'
    + source.slice(panelStart, panelEnd)
    + '\nglobalThis.showPanel = showCopyActionsPanel;',
  panelContext
);
panelContext.showPanel({getBoundingClientRect() { return {left:100, right:300, top:100}; }}, 'copy-flow', 'copy-old', flowGrid);
const showButton = panelElements[1];
let pointerDefaultPrevented = false;
let pointerStopped = false;
showButton.listeners.pointerdown({
  preventDefault() { pointerDefaultPrevented = true; },
  stopPropagation() { pointerStopped = true; }
});
assert.equal(pointerDefaultPrevented, true, 'pressing Show must not move focus away and dismiss the BC menu');
assert.equal(pointerStopped, true, 'BC must not receive pointerdown from the custom menu actions');
assert.equal(menuActions.length, 0, 'pointerdown must not apply the action twice');
showButton.listeners.click({preventDefault() {}, stopPropagation() {}});
assert.equal(menuActions[0], 'dismiss');
assert.deepEqual(Array.from(menuActions[1]), ['copy-flow', false, flowGrid, 'copy-old', false], 'click applies Show synchronously to the captured grid and scope');

console.log('Copy-field settings tests passed.');
