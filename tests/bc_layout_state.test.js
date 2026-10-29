const assert = require('node:assert/strict');
const fs = require('node:fs');
const fixLayoutState = require('../src/content/bc_layout_state.js');
const manifest = JSON.parse(fs.readFileSync(require.resolve('../manifest.json'), 'utf8'));

{
  const result = fixLayoutState('{"FactboxTabSelectedKey":"Details"}', {
    layoutEnabled: true,
    factboxEnabled: true
  });

  assert.deepEqual(JSON.parse(result), {
    FactboxTabSelectedKey: 'Details',
    PageLayoutExpanded: true,
    AsideAreaRightExpanded: false
  });
}

{
  assert.equal(fixLayoutState('{"PageLayoutExpanded":true,"AsideAreaRightExpanded":false}', {
    layoutEnabled: true,
    factboxEnabled: true
  }), null);
}

{
  const result = fixLayoutState('{"PageLayoutExpanded":false,"AsideAreaRightExpanded":true,"custom":"keep"}', {
    layoutEnabled: true,
    factboxEnabled: true
  });

  assert.deepEqual(JSON.parse(result), {
    PageLayoutExpanded: true,
    AsideAreaRightExpanded: false,
    custom: 'keep'
  });
}

{
  assert.equal(fixLayoutState('not-json'), null);
  assert.equal(fixLayoutState('{"custom":1}'), null);
  assert.equal(fixLayoutState('{"PageLayoutExpanded":false,"AsideAreaRightExpanded":true}', {
    layoutEnabled: false,
    factboxEnabled: false
  }), null);
  assert.deepEqual(JSON.parse(fixLayoutState('{"custom":1}', { layoutEnabled: true })), {
    custom: 1,
    PageLayoutExpanded: true,
  });
  assert.deepEqual(JSON.parse(fixLayoutState('{"custom":1}', { factboxEnabled: true })), {
    custom: 1,
    AsideAreaRightExpanded: false
  });
}

{
  const fixed = fixLayoutState('{"PageLayoutExpanded":false,"AsideAreaRightExpanded":true}', {
    layoutEnabled: false,
    factboxEnabled: true
  });
  assert.deepEqual(JSON.parse(fixed), {
    PageLayoutExpanded: false,
    AsideAreaRightExpanded: false
  });
}

{
  const contentScript = manifest.content_scripts.find(script => script.js.includes('src/content/bc_enhance.js'));
  assert.ok(contentScript);
  assert.deepEqual(contentScript.matches, ['https://businesscentral.dynamics.com/*']);
  assert.equal(contentScript.all_frames, true);
  assert.equal(contentScript.run_at, 'document_start');
  assert.ok(contentScript.js.indexOf('src/content/bc_layout_state.js') < contentScript.js.indexOf('src/content/bc_enhance.js'));
}

{
  const state = { layoutEnabled: true, layoutMode: 'normal', factboxEnabled: true, factboxMode: 'open' };
  const fixed = fixLayoutState('{"PageLayoutExpanded":true,"AsideAreaRightExpanded":false,"custom":"keep"}', state);
  assert.deepEqual(JSON.parse(fixed), {
    PageLayoutExpanded: false,
    AsideAreaRightExpanded: true,
    custom: 'keep'
  });
  assert.equal(fixLayoutState(fixed, state), null);
}

{
  const action = (label, state, attributes = {}) => fixLayoutState.layoutToggleAction({
    getAttribute(name) { return ({ 'aria-label':label, ...attributes })[name] ?? null; }
  }, state);
  const wide = { layoutEnabled:true, layoutMode:'wide' };
  const normal = { layoutEnabled:true, layoutMode:'normal' };
  const open = { factboxEnabled:true, factboxMode:'open' };
  const closed = { factboxEnabled:true, factboxMode:'closed' };
  assert.equal(action('Expand page', wide).click, true);
  assert.equal(action('Collapse page', wide).click, false);
  assert.equal(action('Comprimi pagina', normal).click, true);
  assert.equal(action('Espandi pagina', normal).click, false);
  const liveWide = { title:'Mostra la visualizzazione a layout ampio', 'aria-pressed':'false', class:'ms-nav-layout-wide-toggle-button' };
  assert.equal(action('Attiva/Disattiva layout ampio', wide, liveWide).click, true);
  assert.equal(action('Attiva/Disattiva layout ampio', normal, liveWide).click, false);
  assert.equal(action('Attiva/Disattiva layout ampio', normal, { ...liveWide, 'aria-pressed':'true' }).click, true);
  assert.equal(fixLayoutState.layoutToggleAction({ closest() { return {}; } }, wide), null, 'background inert pages must be ignored');
  assert.equal(action('Show FactBox', open).click, true);
  assert.equal(action('Hide FactBox', open).click, false);
  assert.equal(action('Nascondi riquadro dettagli', closed).click, true);
  assert.equal(action('FactBox', closed, { 'aria-expanded':'true' }).click, true);
  assert.equal(action('FactBox', open, { 'aria-expanded':'true' }).click, false);
  const liveFactbox = { id:'b9j_factBoxToggle', title:'Espande il riquadro Dettaglio informazioni', 'aria-checked':'false' };
  assert.equal(action('Attiva/Disattiva Dettaglio informazioni', open, liveFactbox).click, true);
  assert.equal(action('Attiva/Disattiva Dettaglio informazioni', closed, liveFactbox).click, false);
  assert.equal(action('Attiva/Disattiva Dettaglio informazioni', closed, { ...liveFactbox, 'aria-checked':'true' }).click, true);
  assert.equal(action('Attiva/Disattiva filtro', open, { id:'b9j_filterPaneToggle', title:'Mostra riquadro Filtri', 'aria-checked':'false' }), null);
  assert.equal(action('FactBox', open), null, 'unknown state must never toggle blindly');
  assert.equal(action('Expand page', {}), null, 'disabled forcing must not click');
  assert.equal(action('Show FactBox', wide), null, 'the two forcing flags are independent');
  assert.equal(action('Expand row', wide), null);
  assert.equal(action('Espandi', wide), null, 'generic section expanders must not be clicked');
  assert.equal(action('Apri documento', open), null);
  assert.equal(action('Page', wide, { 'aria-keyshortcuts':'Control+F12', 'aria-expanded':'false' }).click, true);
}

{
  const isShowMore = label => fixLayoutState.isShowMoreControl({
    getAttribute(name) { return ({ 'aria-label':label })[name] ?? null; },
    innerText:'', textContent:'',
    closest() { return null; }
  });
  assert.equal(isShowMore('Mostra il resto'), true);
  assert.equal(isShowMore('Mostra di più'), true);
  assert.equal(isShowMore('Show more'), true);
  assert.equal(isShowMore('Show the rest'), true);
  assert.equal(isShowMore('Espandi riepilogo'), false);
  assert.equal(fixLayoutState.isShowMoreControl({
    getAttribute(name) { return name === 'aria-label' ? 'Mostra il resto' : null; },
    innerText:'', textContent:'',
    closest(selector) { return selector.includes('[inert]') ? {} : null; }
  }), false, 'controls from an inert background page must be ignored');
  assert.equal(fixLayoutState.isShowMoreControl({
    getAttribute(name) { return name === 'aria-expanded' ? 'true' : null; },
    innerText:'Mostra il resto', textContent:'',
    closest() { return null; }
  }), false, 'already expanded command must not be clicked again');

  const customers = 'https://businesscentral.dynamics.com/Sandbox?company=CRONUS&page=22&bookmark=record-one';
  const sameCustomers = 'https://businesscentral.dynamics.com/Sandbox?company=CRONUS&page=22&bookmark=record-two';
  const customerCard = 'https://businesscentral.dynamics.com/Sandbox?company=CRONUS&page=21';
  const customersKey = fixLayoutState.showMorePageKey(customers);
  assert.equal(fixLayoutState.showMorePageKey(sameCustomers), customersKey,
    'bookmark changes on the same BC page must not reset the manual-collapse latch');
  assert.notEqual(fixLayoutState.showMorePageKey(customerCard), customersKey,
    'SPA navigation to another BC page must reset the per-page latch');
  const state = { pageKey:'', opened:false };
  const control = label => ({
    getAttribute(name) { return name === 'aria-label' ? label : null; },
    innerText:'', textContent:'', closest() { return null; }
  });
  assert.equal(fixLayoutState.claimShowMoreAutoOpen(control('Mostra il resto'), state, customersKey), true);
  assert.equal(state.opened, true);
  assert.equal(fixLayoutState.claimShowMoreAutoOpen(control('Mostra di più'), state, fixLayoutState.showMorePageKey(sameCustomers)), false,
    'manual Show less must not be reversed by automatic re-opening');
  assert.equal(fixLayoutState.claimShowMoreAutoOpen(control('Mostra il resto'), state, fixLayoutState.showMorePageKey(customerCard)), true,
    'automatic opening is available again after navigating to another BC page');
}

console.log('Layout-state tests passed.');
