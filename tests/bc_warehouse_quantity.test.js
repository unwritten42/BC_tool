const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/content/bc_enhance.js'), 'utf8');

function section(startMarker, endMarker, content = source) {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker, start);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return content.slice(start, end);
}

const headers = [
  ['Nr. movimento', 1],
  ['Quantità', 4],
  ['Cod. variante', 3],
  ['Numero articolo', 2],
  ['Cod. unità di misura', 5],
].map(([label, column]) => ({
  label,
  cellIndex: column - 1,
  getAttribute(name) {
    if (name === 'aria-colindex') return String(column);
    if (name === 'title') return label;
    return null;
  }
}));

const diagnostics = [];
const context = {
  SALDO_ARTICOLO: { maxAutoscrollRounds: 60, maxAutoscrollNoProgressRounds: 6 },
  isTopFrame: true,
  headersOf: root => root && root.snapshot ? root.snapshot().headers : root && root.headers || headers,
  textOf: cell => cell.label || cell.text || '',
  normalizedGridLabel: value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(),
  bcDiagnostic: (event, details) => diagnostics.push({ event, details }),
  tableExportRowElements: root => root && root.snapshot ? root.snapshot().rows : root.rows,
  tableExportCellElements: row => row.cells,
  tableExportCellText: cell => cell.text,
  tableExportVisible: () => true,
  tableExportRowKey: row => `row:${row.rowIndex}`,
  findHeaderRow: root => root.headerRow,
  tableExportBusy: () => false,
  tableExportWait: async () => {},
  getLock: () => ({ running: true }),
  saldoViewFingerprint: root => root && root.filterChanges && (root.horizontalScroller?.scrollLeft || root.verticalScroller?.scrollTop) ? 'changed' : 'initial',
  tableExportRoots: doc => doc.roots || [],
  window: { document: { roots: [] }, frames: [] },
  tableExportReadRows: root => root.hasRows ? [{ values: [] }] : [],
  bcDiagnostic: (event, details) => diagnostics.push({ event, details }),
};

vm.createContext(context);
vm.runInContext([
  section('  function buildSaldoGridInfo(root, headersOverride) {', '  function extractSaldoMovementsFromRows'),
  section('  function extractSaldoMovementsFromRows(rows, gridInfo, seenMovementIds) {', '  function normalizeCellText'),
  section('  function normalizeCellText(s) {', '  function saldoMovementsSignature'),
  section('  function buildSaldoGroups(movements) {', '  function renderSaldoSummary'),
  section('  function renderSaldoSummary(summaryEl, groups) {', '  function attachSaldoGroupHandlers'),
  section('  function ensureSaldoCss() {', '  function getCurrentTopPageId()'),
  section('  function saldoDetailMetrics() {', '  function escapeHtml(s) {'),
  section('  function escapeHtml(s) {', '  function formatSignedNumber(n) {'),
  section('  function formatSignedNumber(n) {', '  function snapshotLayoutKeys()'),
  section('  function tableExportCellIndex(cell,fallback){', '  function tableExportReadRows'),
  section('  function tableExportReadRows(root,headerRow,headers){', '  function tableExportRowKey'),
  section('  async function captureSaldoGrid(root, initialViewFp) {', '  function locateMovimentiWarehouseGrid()'),
  section('  function locateMovimentiWarehouseGrid() {', '  function findHeaderRow(root) {'),
  section('  function isArticleGridLabel(label){', '  function statusColumnFor(root){'),
  'globalThis.buildGridInfo = buildSaldoGridInfo;'
    + 'globalThis.extractMovements = extractSaldoMovementsFromRows;'
    + 'globalThis.readGridRows = tableExportReadRows;'
    + 'globalThis.captureGrid = captureSaldoGrid;'
    + 'globalThis.locateGrid = locateMovimentiWarehouseGrid;'
    + 'globalThis.groupMovements = buildSaldoGroups;'
    + 'globalThis.renderSummary = renderSaldoSummary;'
    + 'globalThis.buildDetailGroups = buildSaldoDetailGroups;'
    + 'globalThis.renderDetail = renderSaldoDetail;'
    + 'globalThis.ensureSaldoStyle = ensureSaldoCss;'
    + 'tableExportReadRows = (root, headerRow, columnHeaders) => root.snapshot ? root.snapshot().rows.map((row, index) => ({ key:"row:" + index, values:row.cells.map(cell => cell.text) })) : root.hasRows ? [{ values:[] }] : [];'
    + 'globalThis.parseQuantity = parseSignedNumber;'
].join('\n'), context);

function gridRow(rowIndex, movementId, quantity) {
  const byColumn = [movementId, 'ITEM-1', 'BLUE', quantity, 'PCS'];
  return {
    rowIndex,
    cells: byColumn.map((text, index) => ({
      text,
      cellIndex: index,
      getAttribute(name) { return name === 'aria-colindex' ? String(index + 1) : null; }
    })),
    querySelector() { return null; },
    closest() { return null; }
  };
}

const headerRow = { cells: headers, querySelector() { return null; }, closest() { return null; } };
const gridInfo = context.buildGridInfo({});
assert.equal(gridInfo.idx.qtyIndex, 1, 'quantity follows its current header position, not a fixed index');

const detailHeaders = ['Nr. articolo', 'Quantità', 'Cod. unità di misura', 'Cod. ubicazione', 'Cod. collocazione',
  'Tipo documento whse.', 'Nr. documento whse.', 'Nr. riga origine', 'Source Document', 'Source No.',
  'Source Document Warehouse', 'Source No. warehouse'].map((label, cellIndex) => ({
  label, cellIndex, getAttribute(name) { return name === 'title' ? label : null; }
}));
const detailInfo = context.buildGridInfo({}, detailHeaders);
assert.ok(detailInfo.idx.locationCodeIndex >= 0 && detailInfo.idx.binCodeIndex >= 0);
assert.equal(detailInfo.idx.sourceDocumentIndex, 8, 'Source Document requires an exact normalized caption');
assert.equal(detailInfo.idx.sourceNoIndex, 9, 'Source No. requires an exact normalized caption');
const italianDetailHeaders = detailHeaders.map((header, index) => {
  const label = index === 8 ? 'Documento origine' : index === 9 ? 'Nr. Origine' : header.label;
  return { ...header, label, getAttribute(name) { return name === 'title' ? label : null; } };
});
const italianDetailInfo = context.buildGridInfo({}, italianDetailHeaders);
assert.equal(italianDetailInfo.idx.sourceDocumentIndex, 8, 'Documento origine maps to Source Document');
assert.equal(italianDetailInfo.idx.sourceNoIndex, 9, 'Nr. Origine maps to Source No.');
const italianSourceMovements = context.extractMovements([
  { key:'italian-row-1', values:['ITEM-1', '3', 'PCS', 'WH-A', 'BIN-A', '', '', '', 'Ordine vendita', 'SO-IT-1'] },
  { key:'italian-row-2', values:['ITEM-1', '-3', 'PCS', 'WH-A', 'BIN-A', '', '', '', 'Ordine vendita', 'SO-IT-1'] }
], italianDetailInfo, new Set());
assert.equal(italianSourceMovements[0].sourceDocument, 'Ordine vendita');
assert.equal(italianSourceMovements[0].sourceNo, 'SO-IT-1');
const italianSourceGroups = context.buildDetailGroups(italianSourceMovements, 0);
assert.equal(italianSourceGroups.locations.get('"WH-A"').bins.get('["WH-A","BIN-A"]').documents.size, 1,
  'Italian source captions feed the existing Source Document + Source No. grouping');
const sameDocument = context.extractMovements([
  { key:'logical-row-1', values:['ITEM-1', '1', 'PCS', 'WH-A', 'BIN-A', 'Tipo warehouse', 'WAREHOUSE-PO', '10', 'Ordine vendita', 'SO-1', '', ''] },
  { key:'logical-row-2', values:['ITEM-1', '-1', 'PCS', 'WH-A', 'BIN-A', 'Tipo warehouse', 'WAREHOUSE-PO', '20', 'Ordine vendita', 'SO-2', '', ''] },
  { key:'logical-row-3', values:['ITEM-1', '0', 'PCS', 'WH-A', 'BIN-A', 'Tipo warehouse', 'WAREHOUSE-PO', '30', '(Vuoto)', '(Vuoto)', '', ''] }
], detailInfo, new Set());
assert.equal(sameDocument.length, 3, 'same document number does not identify or deduplicate movement rows');
assert.equal(JSON.stringify(sameDocument[0].src), JSON.stringify({ type:'Tipo warehouse', docNo:'WAREHOUSE-PO', lineNo:'10' }));
assert.equal(sameDocument[0].sourceDocument, 'Ordine vendita');
assert.equal(sameDocument[0].sourceNo, 'SO-1');
assert.equal(sameDocument[0].sourceFieldsAvailable, true);
assert.equal(sameDocument[2].sourceDocument, '');
assert.equal(sameDocument[2].sourceNo, '');
const sourceGroups = context.buildDetailGroups(sameDocument, 0);
assert.equal(sourceGroups.locations.get('"WH-A"').bins.get('["WH-A","BIN-A"]').documents.size, 2,
  'Source Document and Source No. form separate document groups');
assert.equal(sourceGroups.locations.get('"WH-A"').bins.get('["WH-A","BIN-A"]').unknownLineNos.has('30'), true,
  'empty source values are not replaced with warehouse document values');
assert.deepEqual(sameDocument[0] && [sameDocument[0].locationCode, sameDocument[0].binCode], ['WH-A', 'BIN-A']);

const firstBatch = [gridRow(1, 'MOVE-1', '1'), gridRow(2, 'MOVE-2', '−1'), gridRow(3, 'MOVE-3', '77')];
const secondBatch = [gridRow(3, 'MOVE-3', '77'), gridRow(4, 'MOVE-4', '-1'), gridRow(5, 'MOVE-5', '1')];
const seenIds = new Set();
const movements = [];
for (const batch of [firstBatch, secondBatch]) {
  const rows = context.readGridRows({ rows: [headerRow, ...batch] }, headerRow, headers);
  movements.push(...context.extractMovements(rows, gridInfo, seenIds));
}
assert.deepEqual(Array.from(movements, movement => movement.quantita), [1, -1, 77, -1, 1]);
assert.deepEqual(Array.from(movements, movement => movement.movementId), ['MOVE-1', 'MOVE-2', 'MOVE-3', 'MOVE-4', 'MOVE-5']);
assert.equal(movements.length, 5, 'equal quantities on distinct records are retained in row order');

assert.equal(context.parseQuantity('1.234,50'), 1234.5);
assert.equal(context.parseQuantity('-0,25'), -0.25);
assert.equal(context.parseQuantity('0'), 0);
assert.ok(Number.isNaN(context.parseQuantity('')));
assert.ok(Number.isNaN(context.parseQuantity('non numerico')));

diagnostics.length = 0;
const invalidRows = [gridRow(6, 'MOVE-6', ''), gridRow(7, 'MOVE-7', 'non numerico'), gridRow(8, 'MOVE-8', '0')];
const invalidBatch = context.readGridRows({ rows: [headerRow, ...invalidRows] }, headerRow, headers);
const afterAnomalies = context.extractMovements(invalidBatch, gridInfo, new Set());
assert.deepEqual(Array.from(afterAnomalies, movement => movement.quantita), [0]);
assert.deepEqual(diagnostics.map(entry => entry.details.reason), ['empty', 'non-numeric']);
assert.equal(JSON.stringify(diagnostics).includes('non numerico'), false, 'diagnostics must not contain cell contents');
assert.equal(JSON.stringify(diagnostics).includes('ITEM-1'), false, 'diagnostics must not contain record data');
const emptyPlaceholder = context.extractMovements([
  { key:'aria-rowindex:99', values:Array(5).fill('') }
], gridInfo, new Set());
assert.equal(emptyPlaceholder.length, 0, 'fully empty virtual placeholder rows are ignored');
assert.throws(() => context.extractMovements([
  { key:'aria-rowindex:42', values:['MOVE-42', '1', 'BLUE', '', 'PCS'] }
], gridInfo, new Set()), /Campo obbligatorio mancante: numero articolo \(riga 42\)/,
'a real movement without article remains an actionable error');

const commandSource = section('  async function handleSaldoArticoloCommand(_message, onStarted) {', '  async function captureSaldoGrid(root, initialViewFp) {');
assert.match(commandSource, /captureSaldoGrid\(gridRoot, initialViewFp\)/);

function captureContext(filterChanges) {
  const scroller = { scrollTop: 0, scrollHeight: 200, clientHeight: 100 };
  const busy = { textContent: '' };
  const summary = { innerHTML: '', querySelector: () => null };
  const detail = { innerHTML: '' };
  const loadedRows = [
    ['MOVE-1', '1'], ['MOVE-2', '−1'], ['MOVE-3', '77'], ['MOVE-4', '-1'], ['MOVE-5', '1']
  ].map(([id, quantity]) => ({ values: [id, quantity, 'BLUE', 'ITEM-1', 'PCS'] }));
  const visitedScrollTops = [];
  const capturedMovements = [];
  const startEvents = [];
  let lockRunning = false;
  let fingerprintCalls = 0;
  const capture = {
    SALDO_ARTICOLO: {
      expectedPageId: '7318', panelId: 'panel', busyId: 'busy', panelFpKey: 'fp',
      maxAutoscrollRounds: 60, maxAutoscrollNoProgressRounds: 6
    },
    getCurrentTopPageId: () => '7318',
    getLock: () => ({ running: lockRunning }),
    setLock: value => { lockRunning = value.running; },
    clearSaldoHighlights() {},
    detachSaldoRowListeners() {},
    removeSaldoPanel() {},
    getAccessibleBusyPanel() {},
    document: { getElementById(id) { return ({ busy, 'panel-summary': summary, 'panel-detail': detail })[id] || null; } },
    locateMovimentiWarehouseGrid: () => ({}),
    buildSaldoGridInfo: () => gridInfo,
    async captureSaldoGrid() {
      startEvents.push('capture');
      if (filterChanges) throw new Error('view-changed');
      return { rows: loadedRows.map((row, index) => ({ ...row, key: `row:${index}` })), gridInfo };
    },
    extractSaldoMovementsFromRows: (...args) => context.extractMovements(...args),
    saldoMovementsSignature: rows => `${rows.length}|${rows.slice(-3).map(row => row.movementId).join('|')}`,
    saldoViewFingerprint() {
      fingerprintCalls++;
      return filterChanges && fingerprintCalls > 1 ? 'changed-filter' : 'initial-filter';
    },
    sleep: async () => {},
    buildSaldoGroups(rows) {
      capturedMovements.push(...rows);
      return new Map([['ITEM-1', {}]]);
    },
    sharedSessionStorageJsonGet: () => ({ fp: null }),
    sharedSessionStorageJsonSet() {},
    renderSaldoSummary() {},
  };
  vm.createContext(capture);
  vm.runInContext(`${commandSource}; globalThis.runCommand = handleSaldoArticoloCommand;`, capture);
  return { capture, visitedScrollTops, capturedMovements, startEvents };
}

const wrongPageContext = { SALDO_ARTICOLO: { expectedPageId: '7318' }, getCurrentTopPageId: () => '42' };
vm.createContext(wrongPageContext);
vm.runInContext(`${commandSource}; globalThis.runCommand = handleSaldoArticoloCommand;`, wrongPageContext);
wrongPageContext.runCommand({}).then(result => {
  assert.equal(result.error, 'wrong-page');

  const loadedGrid = captureContext(false);
  return loadedGrid.capture.runCommand({}, () => loadedGrid.startEvents.push('started')).then(captureResult => {
    assert.deepEqual(loadedGrid.startEvents, ['started', 'capture'], 'the popup receives the start acknowledgement before grid capture');
    assert.equal(captureResult.movementsCount, 5, JSON.stringify(captureResult));
    assert.deepEqual(Array.from(loadedGrid.capturedMovements, movement => movement.quantita), [1, -1, 77, -1, 1]);
    assert.equal(loadedGrid.capturedMovements.length, 5, 'each logical row is extracted once');

    const changedGrid = captureContext(true);
    return changedGrid.capture.runCommand({}).then(changedResult => {
      assert.equal(changedResult.error, 'view-changed', 'a filter update must stop capture of the stale view');

      const popupSource = fs.readFileSync(path.join(__dirname, '../src/popup/popup.js'), 'utf8');
      const gating = section('  const saldoActive = !!cfg.saldoArticoloMovimentiWarehouse;', '  const filters =', popupSource);
      assert.match(gating, /if\s*\(response\.started\)\s*\{\s*window\.close\(\);\s*return;\s*\}/,
        'only a started calculation closes the popup');
      for (const [enabled, pageId, expected] of [[false, '7318', false], [true, '42', false], [true, '7318', true]]) {
        const popupContext = {
          cfg: { saldoArticoloMovimentiWarehouse: enabled },
          activePageId: pageId,
          document: { getElementById: () => null }
        };
        vm.createContext(popupContext);
        vm.runInContext(`${gating}; globalThis.showSaldoButton = showSaldoButton;`, popupContext);
        assert.equal(popupContext.showSaldoButton, expected, 'disabled and off-page activation remain unchanged');
      }

      return runGridCaptureTests().then(() => {
        console.log('Warehouse quantity tests passed: 2D virtualization, identity merge, exact scroll restoration, frame lookup, filter changes, moved columns, signed quantities, locale decimals, zero, and invalid cells.');
      });
    });
  });
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});

async function runGridCaptureTests() {
  const labels = {
    movimentoId: 'Nr. movimento', articolo: 'Nr. articolo', qty: 'Quantità',
    uom: 'Cod. unità di misura', variante: 'Cod. variante', srcDocNo: 'Nr. documento whse.',
    locationCode:'Cod. ubicazione', binCode:'Cod. collocazione', srcType:'Tipo documento whse.', srcDocNo:'Nr. documento whse.', srcLineNo:'Nr. riga origine',
    sourceDocument:'Source Document', sourceNo:'Source No.'
  };
  const fieldOrder = ['qty', 'movimentoId', 'articolo', 'uom', 'srcType', 'srcDocNo', 'srcLineNo', 'sourceDocument', 'sourceNo', 'locationCode', 'binCode', 'variante', 'extra1', 'extra2', 'extra3'];
  const quantities = [4, -4, 4, -4, -4, 4];

  function makeGrid({ vertical, horizontal, virtualColumns = false, filterChanges = false, duplicateCells = false, recycledAria = false, fallbackIdentity = false, noDataId = false, inconsistentAria = false, optionalColumns = true, sourceColumns = true, emptySourceValues = false, badSourceAssociation = false, missingSourceAria = false, italianSourceHeaders = false, articleCaption = '', missingArticleAria = false, mismatchedArticleIndex = false }) {
    const verticalScroller = vertical ? {
      scrollTop: 37, scrollHeight: 300, clientHeight: 200,
      style: { overflowY: 'auto' }, getBoundingClientRect: () => ({ top: 0 })
    } : null;
    const horizontalScroller = horizontal ? {
      scrollLeft: 77, scrollWidth: 1200, clientWidth: 300,
      style: { overflowX: 'auto' }, getBoundingClientRect: () => ({ top: 0 })
    } : null;
    const view = {
      getComputedStyle: node => node.style || { overflowX: 'visible', overflowY: 'visible' }
    };
    const doc = { body: null, defaultView: view, scrollingElement: null };
    const data = quantities.map((quantity, index) => ({
      movementId: duplicateCells && index < 2 ? 'SAME-MOVE' : `MOVE-${index + 1}`,
      articolo: 'ITEM-1', qty: duplicateCells && index < 2 ? 4 : quantity,
      uom: 'PCS', variante: 'BLUE', srcType:'Ordine vendita', srcDocNo: 'DOC-1', srcLineNo:String(index + 1),
      sourceDocument:emptySourceValues ? '' : 'Sales Order', sourceNo:emptySourceValues ? '' : `SO-${index + 1}`, locationCode:'WH-A', binCode:'BIN-A'
    }));
    const root = {
      ownerDocument: doc,
      isConnected: true,
      parentElement: null,
      verticalScroller,
      horizontalScroller,
      filterChanges,
      querySelectorAll: selector => selector === '*' ? [verticalScroller, horizontalScroller].filter(Boolean) : [],
      snapshot() {
        const visibleOrder = (optionalColumns ? fieldOrder : ['articolo', 'qty', 'uom'])
          .filter(field => sourceColumns || !['srcType', 'srcDocNo', 'srcLineNo', 'sourceDocument', 'sourceNo'].includes(field));
        const maxScroll = horizontalScroller ? horizontalScroller.scrollWidth - horizontalScroller.clientWidth : 0;
        const startColumn = virtualColumns && maxScroll > 0
          ? Math.round(horizontalScroller.scrollLeft / maxScroll * (visibleOrder.length - 3)) : 0;
        const shownFields = virtualColumns ? visibleOrder.slice(startColumn, startColumn + 3) : visibleOrder;
        const headers = shownFields.map((field, index) => ({
          label: italianSourceHeaders && field === 'sourceDocument' ? 'Documento origine'
            : italianSourceHeaders && field === 'sourceNo' ? 'Nr. Origine'
              : field === 'articolo' && articleCaption ? articleCaption : labels[field],
          cellIndex: mismatchedArticleIndex && field === 'articolo' ? fieldOrder.indexOf(field) + 10 : index,
          getAttribute(name) {
            if (name === 'title') return field === 'sourceDocument' ? 'Generic document caption'
              : field === 'articolo' && articleCaption ? articleCaption : labels[field];
            if (name === 'aria-label') return field === 'articolo' && articleCaption ? articleCaption : labels[field];
            if (name === 'aria-colindex') return (missingArticleAria && field === 'articolo')
              || (missingSourceAria && ['sourceDocument', 'sourceNo'].includes(field))
              ? null : String(fieldOrder.indexOf(field) + 1);
            return null;
          }
        }));
        const firstRow = vertical && verticalScroller ? Math.floor(verticalScroller.scrollTop / 50) : 0;
        const visibleRows = vertical && verticalScroller ? data.slice(firstRow, firstRow + 4) : data;
        const rows = visibleRows.map((record, visibleIndex) => {
          const dataIndex = data.indexOf(record);
          const cells = shownFields.map((field, index) => ({
            text: String(record[field] ?? ''), cellIndex: badSourceAssociation && field === 'sourceDocument' ? -1
              : mismatchedArticleIndex && field === 'articolo' ? fieldOrder.indexOf(field) + 10 : index,
            getAttribute(name) {
              if (name !== 'aria-colindex') return null;
              return badSourceAssociation && field === 'sourceDocument' || missingArticleAria && field === 'articolo'
                ? null : String(fieldOrder.indexOf(field) + 1);
            }
          }));
          if (mismatchedArticleIndex) cells.push({ text:'', cellIndex:99, getAttribute:() => null });
          return {
            cells,
            querySelector: () => null,
            closest: () => null,
            getAttribute(name) {
              if (name === 'data-id') return fallbackIdentity || noDataId ? null : `ROW-${dataIndex + 1}`;
              if (name === 'data-row-key') return null;
              if (name === 'aria-rowindex') {
                if (fallbackIdentity) return null;
                const index = recycledAria && dataIndex === 1 ? 2 : dataIndex + 2;
                return String(index + (inconsistentAria && verticalScroller?.scrollTop > 0 ? 100 : 0));
              }
              return null;
            },
            getBoundingClientRect: () => ({ top: dataIndex * 50 - (verticalScroller?.scrollTop || 0) })
          };
        });
        return { headers, rows };
      },
      headerRow: { querySelector: () => ({}) }
    };
    return { root, verticalScroller, horizontalScroller };
  }

  async function capture(options) {
    const grid = makeGrid(options);
    context.window.document.roots = [grid.root];
    const result = await context.captureGrid(grid.root, 'initial');
    if (grid.verticalScroller) assert.equal(grid.verticalScroller.scrollTop, 37, 'vertical position is restored exactly');
    if (grid.horizontalScroller) assert.equal(grid.horizontalScroller.scrollLeft, 77, 'horizontal position is restored exactly');
    return { ...grid, result };
  }

  const captures = [];
  for (const options of [
    { vertical: true, horizontal: true, virtualColumns: true },
    { vertical: false, horizontal: true, virtualColumns: true },
    { vertical: true, horizontal: false },
    { vertical: false, horizontal: false },
    { vertical: true, horizontal: true, virtualColumns: true, fallbackIdentity: true, duplicateCells: true },
    { vertical: false, horizontal: false, optionalColumns: false },
    { vertical: true, horizontal: true, virtualColumns: true, sourceColumns: false },
    { vertical: true, horizontal: true, virtualColumns: true, emptySourceValues: true },
    { vertical: true, horizontal: true, virtualColumns: true, badSourceAssociation: true },
    { vertical: false, horizontal: false, missingSourceAria: true },
    { vertical: true, horizontal: true, virtualColumns: true, italianSourceHeaders: true },
    { vertical: true, horizontal: true, virtualColumns: true, articleCaption:'Codice articolo', missingArticleAria:true, mismatchedArticleIndex:true }
  ]) captures.push(await capture(options));
  captures.forEach(({ result }, index) => {
      const moves = context.extractMovements(result.rows, result.gridInfo, new Set());
      const scanDiag = diagnostics.filter(entry => entry.event === 'saldo-grid-scan').at(-1)?.details;
      assert.equal(moves.length, 6, `all six rows survive scroller configuration ${index}; captured=${result.rows.map(row => row.key).join(',')}; scan=${JSON.stringify(scanDiag)}`);
      const expected = index === 4 ? [4, 4, 4, -4, -4, 4] : quantities;
      assert.deepEqual(Array.from(moves, move => move.quantita), expected);
      if (index < 4 || index >= 6) assert.equal(moves.reduce((sum, move) => sum + move.quantita, 0), 0, 'six signed quantities produce saldo zero');
      if (index === 5) assert.ok(moves.every(move => move.movementId === '' && move.variante === ''), 'movement ID and variant are optional');
      if (index === 0) {
        assert.ok(moves.every(move => move.locationCode === 'WH-A' && move.binCode === 'BIN-A'), 'virtualized location and bin columns are acquired');
        assert.ok(moves.every(move => move.sourceDocument === 'Sales Order' && move.sourceNo.startsWith('SO-')), 'exact Source captions are acquired across horizontal windows');
        assert.ok(moves.every(move => move.variante === 'BLUE'), 'the trailing column is read for every vertical window');
      }
      if (index === 6) assert.ok(moves.every(move => move.sourceFieldsAvailable === false), 'unobserved source columns are not misclassified as internal');
      if (index === 7) assert.ok(moves.every(move => !move.sourceDocument && !move.sourceNo), 'real empty source values stay empty');
      if (index === 8) assert.ok(moves.every(move => !move.sourceDocument), 'an unassociated source cell is not read positionally');
      if (index === 9) assert.ok(moves.every(move => move.sourceDocument === 'Sales Order' && move.sourceNo.startsWith('SO-')),
        'Source columns map by cellIndex when aria-colindex is unavailable');
      if (index === 10) assert.ok(moves.every(move => move.sourceDocument === 'Sales Order' && move.sourceNo.startsWith('SO-')),
        'Italian source captions map row values during combined virtual scrolling');
      if (index === 10) assert.ok(moves.every(move => move.variante === 'BLUE'), 'Italian source scans also reach trailing fields');
      if (index === 11) assert.ok(moves.every(move => move.articolo === 'ITEM-1'),
        'Codice articolo maps correctly across virtual columns without aria-colindex');
    });
    assert.ok(captures[0].horizontalScroller.scrollLeft < captures[0].horizontalScroller.scrollWidth - captures[0].horizontalScroller.clientWidth,
      'horizontal scan stops before the right edge once required columns are found');
    assert.ok(diagnostics.some(entry => entry.event === 'saldo-grid-scan'
      && entry.details.logicalRowsCreated === 6 && entry.details.horizontalWindows > 1));
    assert.ok(diagnostics.some(entry => entry.event === 'saldo-grid-scan'
      && entry.details.identityStrategies.includes('vertical-window-position')));
    assert.ok(diagnostics.some(entry => entry.event === 'saldo-source-column-missing' && entry.details.column === 'sourceDocument'));
    assert.ok(diagnostics.some(entry => entry.event === 'saldo-source-values-empty' && entry.details.column === 'sourceDocument' && entry.details.rows === 6));
    assert.ok(diagnostics.some(entry => entry.event === 'saldo-source-values-empty' && entry.details.column === 'sourceNo' && entry.details.rows === 6));
    assert.ok(diagnostics.some(entry => entry.event === 'saldo-source-cell-association-error' && entry.details.column === 'sourceDocument' && entry.details.rows === 6));

    const childHeaders = [{ label:'Nr. movimento', cellIndex:0, getAttribute(name) { return name === 'title' ? this.label : null; } }];
    const childRow = {
      cells: [{ text:'MOVE-1', cellIndex:0, getAttribute:() => null }],
      querySelector: () => null, closest: () => null
    };
    const childGrid = { headers:childHeaders, headerRow:{}, rows:[childRow], hasRows:true };
    context.isTopFrame = false;
    context.window = {
      document: { roots: [] },
      frames: [{ document: { roots: [childGrid] }, frames: [] }]
    };
    assert.equal(context.locateGrid(), childGrid, 'grid lookup traverses an accessible child frame');

    const filtered = makeGrid({ vertical: true, horizontal: true, virtualColumns: true, filterChanges: true });
    return assert.rejects(context.captureGrid(filtered.root, 'initial'), /view-changed/).then(() => {
      assert.equal(filtered.verticalScroller.scrollTop, 37, 'vertical position restores after a filter change');
      assert.equal(filtered.horizontalScroller.scrollLeft, 77, 'horizontal position restores after a filter change');

      const recycled = makeGrid({ vertical: false, horizontal: false, recycledAria: true });
      return assert.rejects(context.captureGrid(recycled.root, 'initial'), /aria-rowindex-recycled/).then(() => {
        assert.equal(recycled.root.horizontalScroller, null);
      });
    }).then(() => {
      const inconsistent = makeGrid({ vertical: true, horizontal: false, noDataId: true, inconsistentAria: true });
      const combinedScroll = makeGrid({ vertical: true, horizontal: true, virtualColumns: true, inconsistentAria: true });
      return context.captureGrid(combinedScroll.root, 'initial').then(result => {
        const recoveredMovements = context.extractMovements(result.rows, result.gridInfo, new Set());
        assert.equal(recoveredMovements.length, 6, 'stable row identity tolerates changing ARIA indexes across 2D windows');
        const scan = diagnostics.filter(entry => entry.event === 'saldo-grid-scan').at(-1).details;
        assert.ok(scan.verticalWindows > 1 && scan.horizontalWindows > scan.verticalWindows,
          'combined scan advances through multiple vertical and horizontal windows');
        assert.ok(scan.horizontalWindows <= scan.verticalWindows * 6,
          'bottom-boundary waits do not repeat complete horizontal scans');
        assert.ok(scan.horizontalWindows >= scan.verticalWindows * 4,
          'each vertical window is followed by a complete horizontal scan');
        assert.equal(combinedScroll.verticalScroller.scrollTop, 37, 'vertical position restores after combined scrolling');
        assert.equal(combinedScroll.horizontalScroller.scrollLeft, 77, 'horizontal position restores after combined scrolling');
        return assert.rejects(context.captureGrid(inconsistent.root, 'initial'), /aria-rowindex-inconsistent/).then(() => {
          assert.equal(inconsistent.verticalScroller.scrollTop, 37, 'ARIA-only identity still rejects inconsistent physical positions');
        });
      });
    }).then(() => {
      assert.equal(JSON.stringify(diagnostics).includes('ITEM-1'), false, 'scan diagnostics contain no row values');
      runDetailAggregationTests();
  });
}

function runDetailAggregationTests() {
  function movement(locationCode, binCode, quantita, src, id, sourceDocument = src?.type || '', sourceNo = src?.docNo || '') {
    return { movementId:id, articolo:'ITEM-1', variante:'', uom:'PCS', locationCode, binCode, quantita, src,
      sourceDocument, sourceNo, sourceFieldsAvailable:true, originFieldsAvailable:true };
  }
  const coherent = [
    movement('WH-A', 'CARICO', 100, { type:'Tipo warehouse', docNo:'WAREHOUSE-OA', lineNo:'10000' }, 'M1', 'Ordine di acquisto', 'OA-100'),
    movement('WH-A', 'CARICO', -100, null, 'M2'),
    movement('WH-A', 'G', 50, { type:'Transfer', docNo:'WH-TR-1', lineNo:'1' }, 'M3', 'Transfer Order', 'TR-1'),
    movement('WH-A', 'SPED', 50, { type:'Transfer', docNo:'WH-TR-1', lineNo:'2' }, 'M4', 'Transfer Order', 'TR-1'),
    movement('WH-A', 'SPED', 20, { type:'Tipo warehouse', docNo:'WH-SO-1', lineNo:'1' }, 'M5', 'Ordine vendita', 'OV-001'),
    movement('WH-A', 'SPED', 20, { type:'Tipo warehouse', docNo:'WH-SO-2', lineNo:'2' }, 'M6', 'Ordine vendita', 'OV-002'),
    movement('WH-A', 'SPED', -20, { type:'Tipo warehouse', docNo:'WH-SO-2', lineNo:'2' }, 'M7', 'Ordine vendita', 'OV-002'),
    movement('WH-A', 'SPED', 10, { type:'Tipo warehouse', docNo:'WH-SO-3', lineNo:'3' }, 'M8', 'Ordine vendita', 'OV-003'),
    movement('WH-A', 'SPED', -50, { type:'Tipo warehouse', docNo:'WH-SO-4', lineNo:'4' }, 'M9', 'Ordine vendita', 'OV-004')
  ];
  const groups = context.groupMovements(coherent);
  const key = 'ITEM-1||||PCS';
  const breakdown = context.buildDetailGroups(coherent, groups.get(key).saldo);
  assert.equal(breakdown.ok, true);
  assert.equal(breakdown.article.saldo, 80);
  assert.equal(breakdown.locations.get('"WH-A"').metrics.saldo, 80);
  assert.equal(breakdown.locations.get('"WH-A"').bins.get('["WH-A","CARICO"]').metrics.saldo, 0);
  assert.equal(breakdown.locations.get('"WH-A"').bins.get('["WH-A","G"]').metrics.saldo, 50);
  assert.equal(breakdown.locations.get('"WH-A"').bins.get('["WH-A","SPED"]').metrics.saldo, 30);
  const ov002 = breakdown.locations.get('"WH-A"').bins.get('["WH-A","SPED"]').documents.get('["Ordine vendita","OV-002"]').metrics;
  assert.deepEqual({ saldo:ov002.saldo, positive:ov002.positive, negative:ov002.negative }, { saldo:0, positive:20, negative:20 });
  assert.equal(breakdown.internalTotal.saldo, 0);

  const badLiteral = coherent.slice(0, -1).concat(movement('WH-A', 'SPED', -20,
    { type:'Tipo warehouse', docNo:'WH-SO-4', lineNo:'4' }, 'M9', 'Ordine vendita', 'OV-004'));
  assert.equal(context.groupMovements(badLiteral).get(key).saldo, 110, 'the literal -20 acceptance example totals 110');
  const rejected = context.buildDetailGroups(badLiteral, 80);
  assert.deepEqual({ ok:rejected.ok, reason:rejected.reason }, { ok:false, reason:'location-article-imbalance' });

  const partialSources = [
    movement('WH-A', 'SAME', 0.1, { type:'Ordine di acquisto', docNo:'', lineNo:'' }, 'P1'),
    movement('WH-A', 'SAME', 0.2, { type:'', docNo:'DOC-ONLY', lineNo:'7' }, 'P2', '', ''),
    movement('WH-A', 'SAME', -0.3, { type:'', docNo:'', lineNo:'8' }, 'P3'),
    movement('WH-B', 'SAME', 1.25, null, 'P4')
  ];
  const partialGroups = context.groupMovements(partialSources);
  const partialKey = 'ITEM-1||||PCS';
  const partialResult = context.buildDetailGroups(partialSources, partialGroups.get(partialKey).saldo);
  assert.equal(partialResult.ok, true, 'decimal sums and same-named bins in different locations reconcile');
  assert.equal(partialResult.locations.size, 2);
  assert.equal(partialResult.article.positive, 1.55);
  assert.equal(partialResult.article.negative, 0.3);
  assert.equal(partialResult.locations.get('"WH-A"').bins.has('["WH-A","SAME"]'), true);
  assert.equal(partialResult.locations.get('"WH-B"').bins.has('["WH-B","SAME"]'), true);

  const rendered = { innerHTML:'', textContent:'', children:[], appendChild(child) { this.children.push(child); } };
  context.document = { createElement() { return { style:{}, innerHTML:'', textContent:'', children:[], setAttribute() {}, appendChild(child) { this.children.push(child); } }; } };
  context.document.getElementById = () => null;
  context.document.documentElement = { appendChild(node) { this.styleNode = node; } };
  context.ensureSaldoStyle();
  for (const [state, light, dark] of [
    ['zero', '#705400', '#f5d547'], ['positive', '#137333', '#63d992'], ['negative', '#b3261e', '#ff8a80']
  ]) {
    assert.ok(context.document.documentElement.styleNode.textContent.includes(`light-dark(${light}, ${dark})`), `${state} uses readable Light/Dark colors`);
    assert.ok(contrastRatio(light, '#ffffff') >= 4.5, `${state} Light text contrast meets WCAG AA`);
    assert.ok(contrastRatio(dark, '#1f1f1f') >= 4.5, `${state} Dark text contrast meets WCAG AA`);
  }
  context.renderDetail(rendered, coherent, groups, key);
  const markup = flatten(rendered);
  for (const expected of ['Ubicazione: WH-A', 'Collocazione: CARICO', 'Collocazione: G', 'Collocazione: SPED', 'Ordine di acquisto · OA-100', 'Ordine vendita · OV-002', 'Movimentazione interna', 'Movimentazione interna complessiva (informativa, non disponibilità)']) {
    assert.ok(markup.includes(expected), `rendered hierarchy includes ${expected}`);
  }
  assert.equal(markup.includes('M1'), false, 'movement identifiers are not shown');
  assert.equal(markup.includes('Ordine vendita</div>'), false, 'document caption is not hard-coded');
  assert.ok(markup.includes('Saldo: <span class="bc-tools-saldo-balance-zero">0</span>'), 'zero balance stays yellow and textual');
  assert.ok(markup.includes('Saldo: <span class="bc-tools-saldo-balance-positive">80</span>'), 'positive balance stays green and textual');
  assert.ok(markup.includes('Saldo: <span class="bc-tools-saldo-balance-negative">-50</span>'), 'negative balance stays red and textual');
  assert.ok(markup.includes('>+250</span> / <span class="bc-tools-saldo-balance-negative">-170</span>'), 'positive and negative metrics retain explicit signs and values');
  assert.ok(markup.includes('>+20</span> / <span class="bc-tools-saldo-balance-negative">-20</span>'), 'zero document balance retains signed movement totals');
  assert.equal(markup.includes('Righe origine'), false, 'origin line counts are not displayed');
  assert.equal(markup.includes('WAREHOUSE-OA'), false, 'warehouse document numbers are not used for grouping or display');
  assert.ok(markup.includes('bc-tools-saldo-balance-zero') && markup.includes('bc-tools-saldo-balance-positive') && markup.includes('bc-tools-saldo-balance-negative'), markup);
  assert.ok(markup.includes('Dettaglio: ITEM-1 - PCS'), 'empty variant has no parentheses');
  assert.ok(markup.includes('Ordine di acquisto · OA-100'), 'Source Document and Source No. drive document grouping');
  assert.equal(markup.includes('WAREHOUSE-OA'), false, 'warehouse values are never substituted for source captions');

  const partialRendered = { innerHTML:'', textContent:'', children:[], appendChild(child) { this.children.push(child); } };
  context.renderDetail(partialRendered, partialSources, partialGroups, partialKey);
  const partialMarkup = flatten(partialRendered);
  assert.ok(partialMarkup.includes('Origine non disponibile'), 'empty source pairs use the single unavailable-origin label');
  assert.equal(partialMarkup.includes('DOC-ONLY'), false, 'warehouse document values are not used as source fallbacks');
  assert.equal(partialMarkup.includes('Source Document non disponibile'), false, 'empty source pairs do not render placeholder pairs');
  assert.equal(partialMarkup.includes('Righe origine'), false, 'origin line counts are not displayed');
  assert.ok(partialMarkup.includes('Movimentazione interna'), 'source-free movements remain descriptive internal movements');

  const unobservedOrigin = [movement('WH-A', 'NO-SOURCE', 1, null, 'U1')];
  unobservedOrigin[0].sourceFieldsAvailable = false;
  const unobservedGroups = context.groupMovements(unobservedOrigin);
  const unobservedRendered = { innerHTML:'', textContent:'', children:[], appendChild(child) { this.children.push(child); } };
  context.renderDetail(unobservedRendered, unobservedOrigin, unobservedGroups, partialKey);
  const unobservedMarkup = flatten(unobservedRendered);
  assert.ok(unobservedMarkup.includes('Origine non disponibile'));
  assert.equal(unobservedMarkup.includes('>Movimentazione interna</div>'), false, 'unobserved source columns are not assumed to mean internal');

  const variantMovement = { ...coherent[0], variante:'BLU' };
  const variantKey = 'ITEM-1||BLU||PCS';
  const variantGroups = context.groupMovements([variantMovement]);
  const variantRendered = { innerHTML:'', textContent:'', children:[], appendChild(child) { this.children.push(child); } };
  context.renderDetail(variantRendered, [variantMovement], variantGroups, variantKey);
  assert.ok(flatten(variantRendered).includes('Dettaglio: ITEM-1 (BLU) - PCS'), 'valued variant is parenthesized');

  const vuotoMovement = { ...coherent[0], variante:'Vuoto' };
  const vuotoGroups = context.groupMovements([vuotoMovement]);
  const vuotoKey = 'ITEM-1||Vuoto||PCS';
  const vuotoRendered = { innerHTML:'', textContent:'', children:[], appendChild(child) { this.children.push(child); } };
  context.renderDetail(vuotoRendered, [vuotoMovement], vuotoGroups, vuotoKey);
  assert.ok(flatten(vuotoRendered).includes('Dettaglio: ITEM-1 - PCS'), 'Vuoto variant is omitted from detail title');
  const vuotoSummary = { children:[], appendChild(child) { this.children.push(child); } };
  context.renderSummary(vuotoSummary, vuotoGroups);
  assert.equal(flatten(vuotoSummary).includes('(Vuoto)'), false, 'Vuoto variant is omitted from summary');
  const emptySummary = { children:[], appendChild(child) { this.children.push(child); } };
  context.renderSummary(emptySummary, context.groupMovements([{ ...coherent[0], variante:'' }]));
  assert.equal(flatten(emptySummary).includes('()'), false, 'empty variant is omitted from summary');

  const invalid = { innerHTML:'', textContent:'', children:[], appendChild(child) { this.children.push(child); } };
  context.renderDetail(invalid, badLiteral, new Map([[key, { saldo:80, articolo:'ITEM-1', variante:'', uom:'PCS' }]]), key);
  assert.match(invalid.textContent, /non disponibile/);
  assert.ok(diagnostics.some(entry => entry.event === 'saldo-detail-imbalance' && entry.details.reason === 'location-article-imbalance'));

  const unavailable = { innerHTML:'', textContent:'', children:[], appendChild(child) { this.children.push(child); } };
  const noLocation = [movement(null, null, 1, null, 'N1')];
  context.renderDetail(unavailable, noLocation, context.groupMovements(noLocation), key);
  assert.match(unavailable.textContent, /colonne ubicazione o collocazione/);
  assert.ok(diagnostics.some(entry => entry.event === 'saldo-detail-unavailable' && entry.details.reason === 'location-columns-unavailable'));

  function flatten(node) {
    return [node.textContent || '', node.innerHTML || '', ...(node.children || []).map(flatten)].join(' ');
  }

  function contrastRatio(foreground, background) {
    const luminance = color => {
      const channels = color.match(/[a-f\d]{2}/gi).map(channel => parseInt(channel, 16) / 255);
      const linear = channels.map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
      return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
    };
    const first = luminance(foreground), second = luminance(background);
    return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
  }
}