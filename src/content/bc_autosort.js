// bc_autosort.js — Ordina automaticamente la PRIMA colonna delle liste BC.
//
// METODO: nessun localStorage, nessuna chiave. Si guarda il DOM e si clicca
// l'intestazione, esattamente come farebbe l'utente.
//
// AMBITO (ALLOWLIST): il sort NON si applica ovunque. Si ordina SOLO sulle
// pagine che l'utente sceglie (Opzioni → "Pagine incluse", elenco di ID). Se la
// pagina corrente non e' in elenco — o non e' identificabile — non si tocca
// nulla. L'ID pagina in BC sta nel query string come ?page=NNNN.
//
// UNA VOLTA PER PAGINA: raggiunto l'obiettivo (o esauriti i click) la pagina si
// chiude. Se poi l'utente riordina a mano non gli si va contro. La "pagina" e'
// identificata da page + company: cambiando societa' si ricomincia.
//
// SOLO LISTE: sulle schede con piu' di una griglia (subform, FactBox) la "prima
// colonna" sarebbe ambigua, quindi non si ordina niente. Si agisce solo quando
// c'e' una sola griglia visibile.
//
// DIREZIONE: impostabile (crescente / decrescente). BC al primo click su una
// colonna non ordinata mette SEMPRE crescente, quindi il decrescente costa due
// click.
//
// LINGUA: aria-sort in BC e' localizzato ("Crescente", non "ascending"). Per non
// dipendere da una lista di traduzioni, la stringa del crescente si IMPARA: il
// valore che compare dopo il click su una colonna non ordinata e' per
// definizione il crescente di questo tenant. Da li' in poi, qualunque altro
// valore e' decrescente. La lista di stringhe note serve solo da innesco.
//
// SICUREZZA: prima di un secondo click si aspetta che aria-sort CAMBI davvero,
// non un timer fisso: su un server lento due click ravvicinati riporterebbero
// la colonna al punto di partenza.
//
// Il content script gira gia' con all_frames:true, quindi questo codice e'
// dentro l'iframe del client: `document` e' gia' quello giusto. L'ID pagina,
// invece, sta nell'URL della finestra piu' in alto raggiungibile.

(function () {
  'use strict';

  const SORT_DEFAULTS = {
    autoSortFirstColumn: false,
    sortDirection: 'desc',     // 'asc' | 'desc'
    includedPages: ''          // ID pagine su cui ordinare, separati da virgola
  };

  const DEBOUNCE_MS = 250;    // attesa dopo l'ultima mutazione del DOM
  const NAV_POLL_MS = 250;    // rileva la navigazione interna BC anche senza mutazioni nel frame
  const POLL_MS     = 120;    // cadenza con cui si controlla se aria-sort e' cambiato
  const CHANGE_MS   = 6000;   // attesa massima della risposta del server
  const MAX_CLICKS  = 3;      // cap (da non-ordinata a decrescente ne bastano 2)
  const ONLY_SINGLE_GRID = true;
  const SORT_BRIDGE_SESSION_KEY = 'bcToolsAutoSortBridge';
  const SORT_BRIDGE_ACTIVE_TTL_MS = 25000;
  const SORT_BRIDGE_GRACE_MS = 8000;

  const ASC_KNOWN  = ['crescente', 'ascendente', 'ascending', 'asc', 'croissant', 'aufsteigend'];
  const DESC_KNOWN = ['decrescente', 'discendente', 'descending', 'desc', 'decroissant', 'absteigend'];

  const DEBUG = true;
  const LOG_LIMIT = 200;
  const diagnosticLog = [];
  function log(event, details) {
    if (!DEBUG) return;
    const entry = { at: new Date().toISOString(), event, details: details || {} };
    diagnosticLog.push(entry);
    if (diagnosticLog.length > LOG_LIMIT) diagnosticLog.shift();
    console.info('%c[BC-SORT]', 'color:#0a7;font-weight:600', entry);
    try {
      chrome.runtime.sendMessage({ type:'BC_TOOLS_DIAGNOSTIC_APPEND', component:'autosort', entry }, () => {
        if (typeof chrome !== 'undefined' && chrome.runtime) void chrome.runtime.lastError;
      });
    } catch (_) { /* resta il log in console */ }
  }
  // Disponibile nella console del frame del content script per copiare i log.
  globalThis.__bcToolsAutoSortDiagnostics = {
    get: () => diagnosticLog.slice(),
    clear: () => { diagnosticLog.length = 0; }
  };

  // minuscole, senza accenti, spazi normalizzati
  const norm = s => (s || '').replace(/\u00a0/g, ' ').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  let settings      = Object.assign({}, SORT_DEFAULTS);
  let enabled       = false;
  let direction     = 'desc';
  let includedPages = new Set();
  let learnedAsc    = null;           // stringa aria-sort del crescente, appresa
  let observer      = null;
  let debounceT     = null;
  let navigationT   = null;
  let observedContextHref = null;
  let awaitingPageDom = false;
  let lastSkipKey = null;
  let sortState     = { key: null, done: false, busy: false };
  let sortBridgeSequence = 0;

  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function waitUntil(test, timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) { if (test()) return true; await wait(POLL_MS); }
    return false;
  }

  function parseList(raw) {
    const set = new Set();
    String(raw || '').split(/[\s,;]+/).forEach(tok => {
      const t = tok.trim();
      if (/^\d+$/.test(t)) set.add(t);
    });
    return set;
  }

  function sameSet(a, b) {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
  }

  // ── Contesto della pagina (page / company) ──────────────────────────────────
  // Il content script gira in ogni frame. Il frame corrente e' il contesto
  // autorevole: quando BC apre una seconda o successiva pagina, il suo URL cambia
  // anche se l'URL top resta sulla pagina sottostante. L'URL top e' solo fallback.
  // Limite noto: se la pagina e' aperta via bookmark (?bookmark=...) l'ID non e'
  // nell'URL e la pagina non viene ordinata.
  function contextHref(doc) {
    const win = doc.defaultView || window;
    const hrefs = [];
    try { hrefs.push(win.location.href); } catch (_) {}
    try {
      if (win.top && win.top !== win && win.top.location) hrefs.push(win.top.location.href);
    } catch (_) {}
    for (const h of hrefs) {
      try { if (new URL(h).searchParams.get('page')) return h; } catch (_) {}
    }
    return hrefs[0] || '';
  }

  function currentPageId(doc) {
    try {
      const p = new URL(contextHref(doc)).searchParams.get('page');
      return (p && /^\d+$/.test(p.trim())) ? p.trim() : null;
    } catch (_) { return null; }
  }

  function pageKey(doc) {
    try {
      const u = new URL(contextHref(doc));
      u.hash = '';
      return u.href;
    } catch (_) { return 'n/a'; }
  }

  function sortBridgeContext(doc) {
    try {
      const url = new URL(contextHref(doc));
      const value = (...keys) => keys.map(key => url.searchParams.get(key)).find(item => item !== null) || '';
      return {
        route: `${url.origin}${url.pathname.replace(/\/+$/, '') || '/'}`,
        company: value('company', 'Company'),
        page: value('page', 'Page', 'pageId', 'pageid')
      };
    } catch (_) { return null; }
  }

  function sortBridgeStorage(doc) {
    const win = doc.defaultView || window;
    try { return win.top.sessionStorage; } catch (_) {
      try { return win.sessionStorage; } catch (_) { return null; }
    }
  }

  function markSortBridge(doc, id) {
    const context = sortBridgeContext(doc);
    const storage = sortBridgeStorage(doc);
    if (!context || !context.page || !storage) return;
    try {
      let previous = null;
      try { previous = JSON.parse(storage.getItem(SORT_BRIDGE_SESSION_KEY) || 'null'); } catch (_) {}
      const sameOperation = previous && previous.id === id
        && previous.route === context.route && previous.company === context.company && previous.page === context.page;
      const now = Date.now();
      storage.setItem(SORT_BRIDGE_SESSION_KEY, JSON.stringify({
        ...context,
        id,
        startedAt: sameOperation ? previous.startedAt : now,
        expiresAt: now + SORT_BRIDGE_ACTIVE_TTL_MS,
        revision: sameOperation ? (Number(previous.revision) || 0) + 1 : 1
      }));
    } catch (_) {}
  }

  function finishSortBridge(doc, id) {
    const storage = sortBridgeStorage(doc);
    if (!storage) return;
    try {
      const marker = JSON.parse(storage.getItem(SORT_BRIDGE_SESSION_KEY) || 'null');
      if (!marker || marker.id !== id) return;
      marker.expiresAt = Date.now() + SORT_BRIDGE_GRACE_MS;
      storage.setItem(SORT_BRIDGE_SESSION_KEY, JSON.stringify(marker));
    } catch (_) {}
  }

  // ── Individuazione della griglia e della prima colonna ──────────────────────
  function headerTables(doc) {
    return Array.from(doc.querySelectorAll('table.ms-nav-grid-header-table'))
      .filter(table => table.offsetParent && !table.closest('[aria-hidden="true"]'));
  }

  function sortAnchor(th) {
    return Array.from(th.querySelectorAll('a'))
      .find(a => !/ctxmenuarrow/i.test(String(a.className || ''))) || null;
  }

  // NON "il primo th" (l'indice 0 e' la icon-column di servizio) ne' "il primo
  // con aria-sort" (quella e' la colonna ORDINATA, non la prima). La prima
  // colonna vera e' il primo header con una caption e un link cliccabile.
  function firstSortableTh(table) {
    if (!table) return null;
    for (const th of table.querySelectorAll('th')) {
      if (!th.offsetParent) continue;
      if (!th.querySelector('.columncaption')) continue;
      if (sortAnchor(th)) return th;
    }
    return null;
  }

  function headerTh(doc) {
    const tables = headerTables(doc);
    if (!tables.length) return null;
    if (ONLY_SINGLE_GRID && tables.length > 1) {
      for (let i=tables.length-1; i>=0; i--) {
        const th = firstSortableTh(tables[i]);
        if (th) return th;
      }
      return null;
    }
    return firstSortableTh(tables[0]);
  }

  // ── Interpretazione di aria-sort ────────────────────────────────────────────
  // aria-sort normalizzato, '' se la colonna non e' ordinata
  function rawDir(th) {
    const s = norm(th.getAttribute('aria-sort'));
    return (!s || s === 'none') ? '' : s;
  }

  function readDir(th) {
    const s = rawDir(th);
    if (DESC_KNOWN.includes(s)) return 'desc';
    if (ASC_KNOWN.includes(s)) return 'asc';
    if (s && learnedAsc) return (s === learnedAsc) ? 'asc' : 'desc';
    const ind = th.querySelector('.sorting-indicator');
    if (ind && ind.offsetParent) {
      if (/sortarrowdown/i.test(ind.className)) return 'desc';
      if (/sortarrowup/i.test(ind.className)) return 'asc';
    }
    return null;
  }

  // ── Un click per volta, poi si aspetta l'esito ──────────────────────────────
  async function applySort(doc, expectedKey, expectedPageId, bridgeId) {
    for (let i = 0; i < MAX_CLICKS; i++) {
      const pid = currentPageId(doc);
      if (pageKey(doc) + '#' + direction !== expectedKey || pid !== expectedPageId || !includedPages.has(pid)) {
        log('sort-aborted-context-changed', { expectedKey, expectedPageId, currentKey: pageKey(doc), currentPageId: pid });
        return false;
      }
      const th = headerTh(doc);
      if (!th) return false;
      const cur = readDir(th);
      if (cur === direction) return true;
      const link = sortAnchor(th);
      if (!link) return false;

      const before = rawDir(th);
      log('sort-click', { pageId: expectedPageId, attempt: i + 1, direction, before });
      markSortBridge(doc, bridgeId);
      link.click();
      const ok = await waitUntil(() => {
        if (pageKey(doc) + '#' + direction !== expectedKey) return true;
        const t = headerTh(doc);
        return t && rawDir(t) !== before;
      }, CHANGE_MS);
      if (!ok) return false;
      const currentPid = currentPageId(doc);
      if (pageKey(doc) + '#' + direction !== expectedKey || currentPid !== expectedPageId || !includedPages.has(currentPid)) {
        log('sort-aborted-after-click', { expectedKey, expectedPageId, currentKey: pageKey(doc), currentPageId: currentPid });
        return false;
      }

      // Se la colonna non era ordinata, il valore appena comparso E' il crescente
      // di questo tenant: da qui in poi la lingua non serve piu'.
      const t2 = headerTh(doc);
      const after = t2 ? rawDir(t2) : '';
      if (!before && after && !ASC_KNOWN.includes(after) && !DESC_KNOWN.includes(after)) {
        learnedAsc = after;
        log('aria-sort crescente appreso:', after);
      }
    }
    const th = headerTh(doc);
    return !!th && readDir(th) === direction;
  }

  function trySort(doc) {
    if (!enabled || awaitingPageDom) return;

    const key = pageKey(doc) + '#' + direction;
    if (sortState.key !== key) sortState = { key, done: false, busy: false };
    if (sortState.busy || sortState.done) return;   // una sola esecuzione per questo URL/direzione

    // ALLOWLIST: si ordina SOLO sulle pagine scelte. Se l'ID non e' ancora
    // disponibile o non e' incluso, si resta in attesa: il polling rivaluta il
    // frame anche quando una nuova pagina viene aperta molto tempo dopo.
    const pid = currentPageId(doc);
    if (!pid || !includedPages.has(pid)) {
      if (lastSkipKey !== key) {
        lastSkipKey = key;
        log('sort-skipped-not-allowed', { pageId: pid, key, includedPages: [...includedPages] });
      }
      return;
    }

    // Griglia non ancora pronta o piu' di una: non si marca done, puo' comparire dopo.
    if (!headerTh(doc)) return;

    lastSkipKey = null;
    sortState.busy = true;
    const runKey = key;
    const bridgeId = `${Date.now()}-${++sortBridgeSequence}`;
    log('sort-start', { pageId: pid, key: runKey, direction });
    applySort(doc, runKey, pid, bridgeId)
      .then(achieved => {
        if (sortState.key === runKey) sortState.done = !!achieved;
        log(achieved ? 'sort-complete' : 'sort-not-completed', { pageId: pid, key: runKey });
      })
      .catch(err => console.error('[BC-SORT]', err))
      .finally(() => {
        finishSortBridge(doc, bridgeId);
        if (sortState.key !== runKey) return;
        sortState.busy = false;
      });
  }

  // ── Observer: niente setInterval ────────────────────────────────────────────
  function schedule() {
    clearTimeout(debounceT);
    debounceT = setTimeout(() => trySort(document), DEBOUNCE_MS);
  }

  function checkNavigation() {
    const href = contextHref(document);
    if (href === observedContextHref) return false;
    const previousHref = observedContextHref;
    observedContextHref = href;
    log('navigation-detected', { previousHref, href, pageId: currentPageId(document) });
    awaitingPageDom = false;
    sortState = { key: null, done: false, busy: false };
    clearTimeout(debounceT);
    return true;
  }

  function onDomChanged() {
    checkNavigation();
    if (awaitingPageDom) awaitingPageDom = false;
    schedule();
  }

  function start() {
    if (observer) return;
    observedContextHref = contextHref(document);
    awaitingPageDom = false;
    observer = new MutationObserver(onDomChanged);
    try {
      observer.observe(document.documentElement || document, { childList: true, subtree: true });
    } catch (_) { /* noop */ }
    navigationT = setInterval(() => {
      checkNavigation();
      awaitingPageDom = false;
      trySort(document);
    }, NAV_POLL_MS);
    schedule();
  }

  function stop() {
    if (observer) { observer.disconnect(); observer = null; }
    if (navigationT) { clearInterval(navigationT); navigationT = null; }
    observedContextHref = null;
    awaitingPageDom = false;
    clearTimeout(debounceT);
  }

  function applySortSettings(s) {
    const want = !!s.autoSortFirstColumn;
    const dir  = (s.sortDirection === 'asc') ? 'asc' : 'desc';
    const newIncluded = parseList(s.includedPages);
    const includedChanged = !sameSet(includedPages, newIncluded);

    if (want === enabled && dir === direction && !includedChanged) return;

    includedPages = newIncluded;
    if (dir !== direction || includedChanged) {     // cambiata direzione o allowlist: si rivaluta
      direction = dir;
      sortState = { key: null, done: false, busy: false };
    }

    enabled = want;
    // Si osserva solo se il sort e' attivo E c'e' almeno una pagina in elenco:
    // con l'allowlist vuota non c'e' nulla da fare, inutile tenere un observer.
    if (enabled && includedPages.size) start(); else stop();
  }

  function initSort() {
    try {
      const UI_BACKUP_KEY = 'bcToolsUiSettings';
      let settingsRevision = 0;
      const loadRevision = settingsRevision;
      chrome.storage.sync.get(SORT_DEFAULTS, synced => {
        if (chrome.runtime.lastError) return;
        chrome.storage.local.get([UI_BACKUP_KEY, ...Object.keys(SORT_DEFAULTS)], local => {
          if (chrome.runtime.lastError) return;
          const backup = local[UI_BACKUP_KEY] && typeof local[UI_BACKUP_KEY] === 'object' ? local[UI_BACKUP_KEY] : {};
          const direct = Object.fromEntries(Object.keys(SORT_DEFAULTS)
            .filter(key => Object.prototype.hasOwnProperty.call(local, key))
            .map(key => [key, local[key]]));
          if (loadRevision !== settingsRevision) {
            log('settings-initial-load-discarded', { loadRevision, settingsRevision });
            return;
          }
          settings = Object.assign({}, SORT_DEFAULTS, backup, direct, synced);
          log('settings-loaded', { enabled: !!settings.autoSortFirstColumn, direction: settings.sortDirection, includedPages: [...parseList(settings.includedPages)] });
          applySortSettings(settings);
        });
      });
      chrome.storage.onChanged.addListener((changes, ns) => {
        let touched = false;
        if (ns === 'sync') {
          for (const k of Object.keys(SORT_DEFAULTS)) {
            if (!changes[k]) continue;
            settings[k] = changes[k].newValue === undefined ? SORT_DEFAULTS[k] : changes[k].newValue;
            touched = true;
          }
        } else if (ns === 'local') {
          for (const k of Object.keys(SORT_DEFAULTS)) {
            if (!changes[k]) continue;
            settings[k] = changes[k].newValue === undefined ? SORT_DEFAULTS[k] : changes[k].newValue;
            touched = true;
          }
          if (!touched && changes[UI_BACKUP_KEY]) {
            const backup = changes[UI_BACKUP_KEY].newValue || {};
            for (const k of Object.keys(SORT_DEFAULTS)) {
              if (!Object.prototype.hasOwnProperty.call(backup, k)) continue;
              settings[k] = backup[k];
              touched = true;
            }
          }
        }
        if (touched) {
          settingsRevision++;
          log('settings-changed', { namespace: ns, direction: settings.sortDirection, includedPages: [...parseList(settings.includedPages)] });
          applySortSettings(settings);
        }
      });
    } catch (_) { /* storage non disponibile */ }
  }

  if (document.body) initSort();
  else document.addEventListener('DOMContentLoaded', initSort);
})();
