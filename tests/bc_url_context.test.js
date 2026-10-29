const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let activeTab = null;
let queryOptions = null;
let diagnostic = null;
const context = {
  URL,
  URLSearchParams,
  chrome: {
    tabs: {
      query(options, callback) {
        queryOptions = options;
        callback(activeTab ? [activeTab] : []);
      }
    },
    runtime: { lastError:null, sendMessage(message) { diagnostic = message; } }
  }
};
context.globalThis = context;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/shared/bc_url_context.js'), 'utf8'), context);
const resolver = context.BcToolsUrlContext;

async function run() {
  const sources = [
    ['TenantA', 'Production', 'North Wind'],
    ['TenantA', 'Production', 'Fabrikam'],
    ['TenantB', 'Sandbox', 'Contoso'],
    ['TenantB', 'Sandbox', 'Adventure Works']
  ];
  const quote = String.fromCharCode(39);

  for (const [tenant, environment, company] of sources) {
    const source = `https://businesscentral.dynamics.com/${tenant}/${environment}/Company/Deep?company=${encodeURIComponent(company)}&page=31&table=5&filter=old&mode=Edit&dc=1&bookmark=source-record&keep=x&literal=a%2Bb#old`;
    const contextUrl = await resolver.resolve(source);
    const expectedPath = `/${tenant}/${environment}/Company/Deep`;
    assert.equal(contextUrl.pathname, expectedPath);
    assert.equal(contextUrl.searchParams.get('company'), company);
    assert.equal(new URL(resolver.build(contextUrl, {set:{page:'42'}})).hash, '#old');

    for (const value of ['ABC', '*ABC', 'ABC*', '*ABC*']) {
      const filter = `${quote}No.${quote} IS ${quote}${value}${quote}`;
      const result = new URL(resolver.build(contextUrl, {
        set:{page:'5743', filter},
        remove:['table', 'mode', 'dc', 'bookmark'],
        hash:'#bc-tools-open-single'
      }));
      assert.equal(result.pathname, expectedPath);
      assert.equal(result.searchParams.get('company'), company);
      assert.equal(result.searchParams.get('page'), '5743');
      assert.equal(result.searchParams.get('filter'), filter);
      assert.equal(result.searchParams.get('keep'), 'x');
      assert.equal(result.searchParams.get('literal'), 'a+b');
      assert.ok(result.href.includes('literal=a%2Bb'));
      assert.equal(result.searchParams.has('table'), false);
      assert.equal(result.searchParams.has('mode'), false);
      assert.equal(result.searchParams.has('dc'), false);
      assert.equal(result.searchParams.has('bookmark'), false);
      assert.equal(result.hash, '#bc-tools-open-single');
    }

    const table = new URL(resolver.build(contextUrl, {
      set:{table:'5405'}, remove:['page', 'filter', 'mode', 'dc', 'bookmark'], hash:''
    }));
    assert.equal(table.searchParams.get('table'), '5405');
    assert.equal(table.searchParams.has('page'), false);
    assert.equal(table.searchParams.has('bookmark'), false);
    assert.equal(table.hash, '');

    const page = new URL(resolver.build(contextUrl, {
      set:{page:'8700'}, remove:['table', 'filter', 'mode', 'dc', 'bookmark'], hash:''
    }));
    assert.equal(page.searchParams.get('page'), '8700');
    assert.equal(page.searchParams.has('bookmark'), false);
    assert.equal(page.hash, '');
  }

  const sample = await resolver.resolve('https://businesscentral.dynamics.com/a56f8175-87ae-422a-bf73-027157ad82a8/Production?company=F.M.I.+Franceschi&page=9305&bookmark=23_mBwAAAJ7_zIANgBTAFcAUAAtADAAMAA0ADcAMgA5&filter=%27No.%27+IS+%27*26ODV-035780%27#bc-tools-open-single');
  const sampleFilter = `${quote}No.${quote} IS ${quote}*26ODV-035780${quote}`;
  const sampleUrl = resolver.build(sample, {
    set:{page:'9305',filter:sampleFilter},
    remove:['bookmark'],
    hash:'#bc-tools-open-single'
  });
  assert.ok(sampleUrl.includes('company=F.M.I.%20Franceschi'));
  assert.ok(sampleUrl.includes('filter=%27No.%27%20IS%20%27*26ODV-035780%27'));
  assert.equal(sampleUrl.includes('bookmark='), false);
  assert.equal(sampleUrl.includes('+'), false);

  const dialogNumber = 'PICK-000123';
  const documentUrl = new URL(resolver.build(sample, {
    set:{page:'5779',mode:'Edit',filter:`${quote}No.${quote} IS ${quote}${dialogNumber}${quote}`,dc:'0'},
    remove:['table','bookmark'],
    hash:''
  }));
  assert.equal(documentUrl.pathname, '/a56f8175-87ae-422a-bf73-027157ad82a8/Production');
  assert.equal(documentUrl.searchParams.get('company'), 'F.M.I. Franceschi');
  assert.equal(documentUrl.searchParams.get('page'), '5779');
  assert.equal(documentUrl.searchParams.get('mode'), 'Edit');
  assert.equal(documentUrl.searchParams.get('filter'), `${quote}No.${quote} IS ${quote}${dialogNumber}${quote}`);
  assert.equal(documentUrl.searchParams.get('filter').includes('Warehouse Activity Header'), false);
  assert.equal(documentUrl.searchParams.has('bookmark'), false);
  assert.equal(documentUrl.hash, '');

  activeTab = {id:7, url:'https://businesscentral.dynamics.com/TenantC/Test?company=Current'};
  const active = await resolver.resolveTab();
  assert.equal(active.tab.id, 7);
  assert.equal(active.url.searchParams.get('company'), 'Current');
  assert.equal(queryOptions.active, true);
  assert.equal(queryOptions.currentWindow, true);
  const sourceTab = {id:10,url:'https://businesscentral.dynamics.com/TenantA/Production?company=Source'};
  const source = resolver.sourceFromSender({url:'https://businesscentral.dynamics.com/frame-without-tenant',tab:sourceTab});
  assert.equal(source.id, 10);
  assert.equal((await resolver.resolve(source)).searchParams.get('company'), 'Source');
  queryOptions = null;
  activeTab = {id:8, url:'https://businesscentral.dynamics.com/frame-without-tenant'};
  const explicitSource = await resolver.resolve('https://businesscentral.dynamics.com/TenantA/Production?company=Dialog%20Company');
  assert.equal(explicitSource.searchParams.get('company'), 'Dialog Company');
  assert.equal(queryOptions, null);
  activeTab = {id:9, url:'https://businesscentral.dynamics.com/TenantC/Test/Company/Deep#source'};
  const noCompany = await resolver.resolveTab();
  const noCompanyTarget = new URL(resolver.build(noCompany.url, {set:{page:'8700'}}));
  assert.equal(noCompanyTarget.pathname, '/TenantC/Test/Company/Deep');
  assert.equal(noCompanyTarget.searchParams.has('company'), false);
  assert.equal(noCompanyTarget.hash, '#source');

  activeTab = {id:8, url:'https://example.com/Tenant/Production/'};
  await assert.rejects(resolver.resolve(), error => error.code === 'invalid-business-central-context');
  await assert.rejects(resolver.resolve('https://businesscentral.dynamics.com/'), error => error.code === 'invalid-business-central-context');
  await assert.rejects(resolver.resolve('not a URL'), error => error.code === 'invalid-url');
  activeTab = null;
  await assert.rejects(resolver.resolve(), error => error.code === 'context-unavailable');
  resolver.reportError('popup-filter', Object.assign(new Error('sensitive URL and filter'), {code:'invalid-url'}));
  assert.equal(diagnostic.component, 'url-context');
  assert.equal(diagnostic.entry.details.component, 'popup-filter');
  assert.equal(diagnostic.entry.details.cause, 'invalid-url');
  assert.equal(JSON.stringify(diagnostic).includes('sensitive'), false);

  console.log('URL context tests passed.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
