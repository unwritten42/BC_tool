const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/content/bc_enhance.js'), 'utf8');
const selectorsStart = source.indexOf('  const COPY_CELL_SELECTOR');
const selectorsEnd = source.indexOf('  const HIDDEN_COPY_FIELDS_KEY', selectorsStart);
const helperStart = source.indexOf('  function copyCellsFromMutations(records) {');
const helperEnd = source.indexOf('  let copyEnhanceTimer', helperStart);
assert.notEqual(selectorsStart, -1);
assert.notEqual(selectorsEnd, -1);
assert.notEqual(helperStart, -1);
assert.notEqual(helperEnd, -1);

const context = {};
vm.createContext(context);
vm.runInContext(
  source.slice(selectorsStart, selectorsEnd)
    + source.slice(helperStart, helperEnd)
    + 'globalThis.collectCopyCells = copyCellsFromMutations;',
  context
);

const cellSelector = 'td,[role="gridcell"],[role="cell"]';
const copyUiSelector = '.bc-tools-copy-page-field,.bc-tools-copy-actions';

function makeElement({isCell = false, isCopyUi = false, cell = null, descendants = []} = {}) {
  return {
    nodeType: 1,
    closest(selector) {
      if (selector === copyUiSelector && isCopyUi) return this;
      if (selector === cellSelector) return isCell ? this : cell;
      return null;
    },
    matches(selector) {
      return selector === cellSelector && isCell;
    },
    querySelectorAll(selector) {
      return selector === cellSelector ? descendants : [];
    }
  };
}

const firstCell = makeElement({isCell:true});
const secondCell = makeElement({isCell:true});
const field = makeElement({cell:firstCell});
const textNode = {nodeType:3, parentElement:field};
const copyButton = makeElement({isCopyUi:true});
const grid = makeElement({descendants:[firstCell, secondCell]});
const addedRow = makeElement({descendants:[secondCell]});

const changedCell = context.collectCopyCells([
  {target:field, removedNodes:[], addedNodes:[textNode]}
]);
assert.deepEqual(Array.from(changedCell), [firstCell], 'text changes only revisit their containing cell');

const changedText = context.collectCopyCells([
  {type:'characterData', target:textNode, removedNodes:[], addedNodes:[]}
]);
assert.deepEqual(Array.from(changedText), [firstCell], 'text-node edits revisit their containing cell');

const addedCopyButton = context.collectCopyCells([
  {target:firstCell, removedNodes:[], addedNodes:[copyButton]}
]);
assert.equal(addedCopyButton.size, 0, 'adding the extension button does not trigger another grid scan');

const changedGrid = context.collectCopyCells([
  {target:{nodeType:9}, removedNodes:[], addedNodes:[grid]}
]);
assert.deepEqual(Array.from(changedGrid), [firstCell, secondCell], 'new grid subtrees revisit only their cells');

const changedRow = context.collectCopyCells([
  {target:grid, removedNodes:[], addedNodes:[addedRow]}
]);
assert.deepEqual(Array.from(changedRow), [secondCell], 'new rows do not rescan unchanged grid cells');

const changedCopyUi = context.collectCopyCells([
  {target:copyButton, removedNodes:[], addedNodes:[field]}
]);
assert.equal(changedCopyUi.size, 0, 'mutations inside extension UI are ignored');

console.log('Copy-field performance tests passed.');
