const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/content/bc_enhance.js'), 'utf8');
const start = source.indexOf('  const CREATED_WHSE_BUTTON_CLASS');
const end = source.indexOf('  chrome.runtime.onMessage.addListener', start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);

const context = {
  alert(message) { context.alerts.push(message); },
  alerts: [],
  bcDiagnostic() {},
  chrome: { runtime: { lastError: null, sendMessage(message, callback) {
    context.sentMessages.push(message);
    callback(context.backgroundResponse);
  } } },
  backgroundResponse: { ok: true },
  sentMessages: []
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
vm.runInContext('globalThis.testTargets = CREATED_DOCUMENT_TARGETS; globalThis.testAnalyze = analyzeCreatedDocument; globalThis.testOpen = openCreatedDocument;', context);

const cases = [
  {kind:'posted-transfer-shipment', pageId:'5743', table:'Transfer Shipment Header', field:'Transfer Order No.', edit:false,
    text:'Ordine di trasferimento registrato numero TR-12/3.4_A'},
  {kind:'posted-warehouse-shipment', pageId:'7337', table:'Posted Whse. Shipment Header', field:'No.', edit:false,
    text:'Spedizione warehouse registrata numero WH-12/3.4_A'},
  {kind:'posted-sales-shipment', pageId:'130', table:'Sales Shipment Header', field:'Order No.', edit:false,
    text:'Ordine registrato numero SO-12/3.4_A'},
  {kind:'released-production-order', pageId:'99000831', table:'Production Order', field:'No.', edit:true,
    text:'Rilasciato ordine produzione creato numero PROD-12/3.4_A'},
  {kind:'warehouse-shipment', pageId:'7335', table:'Warehouse Shipment Header', field:'No.', edit:true,
    text:'Spedizione warehouse creata numero WS-12/3.4_A'},
  {kind:'pick', pageId:'5779', table:'Warehouse Activity Header', field:'No.', edit:true,
    text:'Attivita prelievo creata numero PICK-12/3.4_A'},
  {kind:'put-away', pageId:'5770', table:'Warehouse Activity Header', field:'No.', edit:true,
    text:'Attivita stoccaggio creata numero PUT-12/3.4_A'}
];

async function run() {
  assert.equal(context.testTargets.length, cases.length);
  for (let index = 0; index < cases.length; index++) {
    const expected = cases[index];
    const target = context.testTargets[index];
    assert.deepEqual([target.kind, target.pageId, target.table, target.filterField, target.edit],
      [expected.kind, expected.pageId, expected.table, expected.field, expected.edit]);

    const analyzed = context.testAnalyze({innerText: expected.text});
    assert.equal(analyzed.info.kind, expected.kind);
    assert.equal(analyzed.info.table, expected.table);
    assert.equal(analyzed.info.number, expected.text.split('numero ')[1]);

    let okClicks = 0;
    await context.testOpen({click() { okClicks++; }}, {...analyzed.info, number:"A-1/2.3_B'Q"});
    const message = context.sentMessages.at(-1);
    assert.equal(message.type, 'BC_TOOLS_OPEN_BUSINESS_CENTRAL_URL');
    assert.equal(message.component, 'created-document');
    assert.equal(message.options.set.page, expected.pageId);
    assert.equal(message.options.set.filter, `'${expected.table}'.'${expected.field}' IS 'A-1/2.3_B''Q'`);
    assert.equal(message.options.set.dc, '0');
    assert.equal(message.options.set.mode, expected.edit ? 'Edit' : undefined);
    assert.deepEqual(Array.from(message.options.remove), ['table', 'filter', 'mode', 'dc', 'bookmark']);
    assert.equal(message.options.hash, '');
    assert.equal(okClicks, 1);
  }

  const negative = context.testAnalyze({innerText:'Ordine di trasferimento non e stato registrato numero TR-4'});
  assert.equal(negative.info, null);
  assert.equal(negative.reason, 'negative-outcome');
  const missingNumber = context.testAnalyze({innerText:'Attivita prelievo creata'});
  assert.equal(missingNumber.info, null);
  assert.equal(missingNumber.reason, 'missing-number');

  let okClicks = 0;
  context.backgroundResponse = {ok: false, error: 'tab-open-failed'};
  await context.testOpen({click() { okClicks++; }}, {
    kind:'pick', pageId:'5779', table:'Warehouse Activity Header', filterField:'No.', edit:true, number:'PICK-1'
  });
  assert.equal(okClicks, 0);
  assert.equal(context.alerts.length, 1);

  context.chrome.runtime.lastError = {message:'unavailable'};
  await context.testOpen({click() { okClicks++; }}, {
    kind:'pick', pageId:'5779', table:'Warehouse Activity Header', filterField:'No.', edit:true, number:'PICK-2'
  });
  assert.equal(okClicks, 0);
  assert.equal(context.alerts.length, 2);
  console.log('Created-document tests passed: seven targets, qualified filters, edit modes, escaping, outcome rejection, and background failures.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});