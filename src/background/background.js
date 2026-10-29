// background.js — service worker MV3.
// Relay saldo articolo al frame principale di Business Central.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'saldo-articolo') {
        // Backward-compat: payload legacy (ora usiamo BC_TOOLS_SALDO_ARTICOLO)
        sendResponse({ status: 'ignored' });
        return;
    }

    if (message && message.type === 'BC_TOOLS_SALDO_ARTICOLO') {
      const diagnostic = (event, details) => {
        try {
          self.bcToolsBackgroundDiagnostics?.appendDiagnostic({
            component: 'background',
            entry: { event, details }
          }, null);
        } catch (_) {}
      };
      diagnostic('saldo-message-received', {});
        // Relay verso content script sulla scheda attiva.
        (async () => {
            try {
          const tabs = await new Promise((resolve, reject) => chrome.tabs.query({ active: true, currentWindow: true }, result => {
            if (chrome.runtime.lastError) reject(new Error('active-tab-query-failed'));
            else resolve(result);
          }));
                const tab = (tabs && tabs[0]) || null;
                if (!tab || !tab.id) {
            diagnostic('saldo-command-error', { reason: 'no-active-tab' });
            sendResponse({ ok: false, error: 'no-active-tab' });
                    return;
                }

          diagnostic('saldo-message-forwarded', { frame: 'top' });
                chrome.tabs.sendMessage(tab.id, {
                    type: 'BC_TOOLS_SALDO_ARTICOLO',
                    expectedPageId: '7318'
                }, { frameId: 0 }, (resp) => {
                    if (chrome.runtime.lastError) {
              diagnostic('saldo-command-error', { reason: 'content-script-unavailable' });
              sendResponse({ ok: false, error: 'content-script-unavailable' });
                        return;
                    }
                    if (!resp) {
                        diagnostic('saldo-command-error', { reason: 'empty-response' });
                        sendResponse({ ok: false, error: 'empty-response' });
                        return;
                    }
                    const knownErrors = ['wrong-page','running','grid-not-found','required-columns-missing','no-scroller','header-row-not-found','view-changed','cancelled','command-failed'];
                    const error = knownErrors.includes(resp.error) ? resp.error : resp.error ? 'other' : null;
                    diagnostic('saldo-response-relayed', { ok: !!resp.ok, error });
                    sendResponse(resp);
                });
            } catch (e) {
          const reason = e && e.message === 'active-tab-query-failed' ? 'active-tab-query-failed' : 'relay-failed';
          diagnostic('saldo-command-error', { reason });
          sendResponse({ ok: false, error: reason });
            }
        })();
        return true; // keep sendResponse alive
    }

    if (message && message.type === 'BC_TOOLS_OPEN_BUSINESS_CENTRAL_URL') {
        (async () => {
            let url;
            try {
              const source = BcToolsUrlContext.sourceFromSender(sender);
              const context = await BcToolsUrlContext.resolve(source);
            url = BcToolsUrlContext.build(context, message.options || {});
            } catch (error) {
                BcToolsUrlContext.reportError(message.component, error);
                sendResponse({ ok: false, error: error && error.code || 'context-unavailable' });
                return;
            }
            try {
                await chrome.tabs.create({ url, active:true });
                sendResponse({ ok:true });
            } catch (_) {
                BcToolsUrlContext.reportError(message.component, {code:'tab-open-failed'});
                sendResponse({ ok:false, error:'tab-open-failed' });
            }
        })();
        return true;
      }
});
//  1) menu contestuale "cerca <selezione>" costruito dalle righe di Ricerca/Filtri.
//
// Il menu riusa le stesse righe del popup (label, page, field, astLeft/astRight).
// Le voci NON sopravvivono al riavvio del service worker: vanno ricostruite su install/avvio
// e ogni volta che i filtri cambiano.

// ── Comando da tastiera: delegato al content script della scheda BC attiva ────
if (chrome.commands) {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle-wide') return;
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab || !tab.id || !/\.dynamics\.com\//.test(tab.url || '')) return;
      await chrome.tabs.sendMessage(tab.id, { type: 'bcTools_toggleWideOff' });
    } catch (_) { /* nessun content script in ascolto sulla scheda */ }
  });
}

// Salvataggio impostazioni e diagnostica sono delegati a moduli importati nel service worker.
// NB: importScripts è supportato da MV3 service worker.
importScripts('features/settings.js');
importScripts('features/diagnostics.js');
importScripts('../shared/bc_url_context.js');

// Avvia i listener lato background (uno per responsabilità) senza cambiare payload/messaggi.
self.bcToolsBackgroundSettings && self.bcToolsBackgroundSettings.initBackgroundSettingsSaver &&
  self.bcToolsBackgroundSettings.initBackgroundSettingsSaver();

self.bcToolsBackgroundDiagnostics && self.bcToolsBackgroundDiagnostics.initBackgroundDiagnostics &&
  self.bcToolsBackgroundDiagnostics.initBackgroundDiagnostics();

// ping options resta qui (non separato nella Tranche 2) per ridurre rischio su tempi/ordine listener.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if(message&&message.type==='BC_TOOLS_OPTIONS_PING'){sendResponse({ok:true});return;}
});

// Dopo il reload di un'estensione unpacked, una pagina Opzioni gia' aperta
// puo' restare visibile nel vecchio contesto: DOM presente, ma chrome.storage e
// listener non piu' operativi. Il nuovo service worker ricarica direttamente le
// sole schede Opzioni dell'estensione, senza richiedere il permesso "tabs".
async function reloadOpenOptionsPages() {
  const optionsUrl = chrome.runtime.getURL('src/options/index.html');
  const tabIds = new Set();

  // Metodo nativo MV3: individua i contesti TAB appartenenti all'estensione.
  if (chrome.runtime.getContexts) {
    try {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['TAB'],
        documentUrls: [optionsUrl]
      });
      for (const context of contexts || []) {
        if (Number.isInteger(context.tabId) && context.tabId >= 0) tabIds.add(context.tabId);
      }
    } catch (_) { /* fallback sotto */ }
  }

  // Fallback per versioni/browser in cui getContexts non restituisce il vecchio
  // documento invalidato. La query e' limitata all'URL interno dell'estensione.
  try {
    const tabs = await chrome.tabs.query({ url: `${optionsUrl}*` });
    for (const tab of tabs || []) {
      if (Number.isInteger(tab.id) && tab.id >= 0) tabIds.add(tab.id);
    }
  } catch (_) { /* nessuna scheda Opzioni accessibile */ }

  await Promise.all([...tabIds].map(tabId => chrome.tabs.reload(tabId).catch(() => {})));
}

const CTX_ROOT = 'bcTools_ctx_root';
const CTX_PREFIX = 'bcTools_ctx_';

const normalize = (s) => (s || '').trim();

const validFilters = (arr) => (arr || []).filter(it => it && it.label && it.page && it.field);

// ── Menu contestuale ─────────────────────────────────────────────────────────
// contextMenus.create non è promisificata: il wrapper serve solo a poter
// aspettare la callback (e a consumare lastError senza sporcare la console).
function createMenu(props) {
  return new Promise(resolve => {
    chrome.contextMenus.create(props, () => { void chrome.runtime.lastError; resolve(); });
  });
}

async function rebuildMenus() {
  await chrome.contextMenus.removeAll();
  const data = await chrome.storage.sync.get(['quickFilters']);
  const filters = validFilters(data && data.quickFilters);
  if (!filters.length) return;

  await createMenu({ id: CTX_ROOT, title: 'BC_tools: cerca "%s"', contexts: ['selection'], documentUrlPatterns: ['https://businesscentral.dynamics.com/*'] });
  for (let i = 0; i < filters.length; i++) {
    await createMenu({ id: CTX_PREFIX + i, parentId: CTX_ROOT, title: filters[i].label, contexts: ['selection'], documentUrlPatterns: ['https://businesscentral.dynamics.com/*'] });
  }
}

// Le ricostruzioni sono serializzate: due removeAll+create concorrenti
// genererebbero "duplicate id".
let buildChain = Promise.resolve();
function buildMenus() {
  if (!chrome.contextMenus) return;
  buildChain = buildChain.then(rebuildMenus).catch(() => { /* si riprova al prossimo evento */ });
}
async function openOptionsOnFirstInstall(details) {
  const reason = details && details.reason;
  if(reason==='update')return;
  if (reason !== 'install') return;
  await chrome.storage.sync.set({ quickFilters:[], quickTables:[] });
  await chrome.storage.local.set({
    bcToolsOnboardingState:'tour-available',
    bcToolsRecommendedPresetDecision:'pending'
  });
  await chrome.runtime.openOptionsPage();
}

async function openSearch(row, selection, tab) {
  let v = normalize(selection);
  if (!v) return;
  if (row.astLeft && !v.startsWith('*')) v = `*${v}`;
  if (row.astRight && !v.endsWith('*')) v = `${v}*`;

  let url;
  try {
    const context = await BcToolsUrlContext.resolve(tab);
    const filter = `'${row.field}' IS '${v.replace(/'/g, "''")}'`;
    url = BcToolsUrlContext.build(context, {
      set: { page:String(row.page).trim(), filter },
      remove: ['table','mode','dc','bookmark'],
      hash: '#bc-tools-open-single'
    });
  } catch (error) {
    BcToolsUrlContext.reportError('context-menu-filter', error);
    try { await chrome.tabs.sendMessage(tab.id, { type:'BC_TOOLS_URL_CONTEXT_ERROR' }); } catch (_) {}
    return;
  }
  try {
    await chrome.tabs.create({ url });
  } catch (_) {
    BcToolsUrlContext.reportError('context-menu-filter', {code:'tab-open-failed'});
    try { await chrome.tabs.sendMessage(tab.id, { type:'BC_TOOLS_URL_CONTEXT_ERROR' }); } catch (_) {}
  }
}

if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const id = info && info.menuItemId;

    // CTX_ROOT: la voce "BC_tools" deve esistere anche se non ci sono filtri.
    if (id === CTX_ROOT) {
      try {
        const data = await chrome.storage.sync.get(['quickFilters']);
        const filters = validFilters(data && data.quickFilters);
        if (filters && filters.length) {
          // Se esistono filtri, apri il primo come comportamento conservativo.
          await openSearch(filters[0], info.selectionText, tab);
        }
      } catch (_) { /* noop */ }
      return;
    }

    if (typeof id !== 'string' || !id.startsWith(CTX_PREFIX)) return;
    const idx = parseInt(id.slice(CTX_PREFIX.length), 10);
    if (isNaN(idx)) return;
    try {
      const data = await chrome.storage.sync.get(['quickFilters']);
      const row = validFilters(data && data.quickFilters)[idx];
      if (row) await openSearch(row, info.selectionText, tab);
    } catch (_) { /* noop */ }
  });

  // Ricostruisce le voci quando cambiano i filtri nelle Opzioni
  chrome.storage.onChanged.addListener((changes, ns) => {
    if (ns === 'sync' && changes && changes.quickFilters) buildMenus();
  });

  chrome.runtime.onInstalled.addListener(details => {
    buildMenus();
    if(details&&details.reason==='update')reloadOpenOptionsPages();
    openOptionsOnFirstInstall(details).catch(()=>{});
  });
  if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(buildMenus);
}
