const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/shared/bc_update_check.js'), 'utf8');
const context = { fetch:null };
context.globalThis = context;
vm.runInNewContext(source, context);

const updateCheck = context.BcToolsUpdateCheck;

async function run(){
  assert.equal(updateCheck.compareVersions('3.10', '3.2'), 1);
  assert.equal(updateCheck.compareVersions('3.2.0', '3.2'), 0);
  assert.equal(updateCheck.compareVersions('3.1', '3.2'), -1);
  assert.throws(() => updateCheck.compareVersions('3.x', '3.2'), /invalid-extension-version/);

  let request;
  context.fetch = async (...args) => {
    request = args;
    return { ok:true, async json(){ return { version:'3.3' }; } };
  };
  const update = await updateCheck.check('3.2');
  assert.equal(update.version, '3.3');
  assert.equal(update.changesUrl, 'https://github.com/unwritten42/BC_tool/commits/main/');
  assert.equal(request[0], 'https://raw.githubusercontent.com/unwritten42/BC_tool/main/manifest.json');
  assert.equal(request[1].cache, 'no-store');

  context.fetch = async () => ({ ok:true, async json(){ return { version:'3.2' }; } });
  assert.equal(await updateCheck.check('3.2'), null);
  context.fetch = async () => ({ ok:false });
  await assert.rejects(updateCheck.check('3.2'), /update-check-http-error/);
  context.fetch = async () => ({ ok:true, async json(){ return {}; } });
  await assert.rejects(updateCheck.check('3.2'), /invalid-remote-manifest/);
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
