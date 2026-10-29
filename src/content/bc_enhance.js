// bc_enhance.js — UI tweaks + Layout pagina e FactBox su tutte le pagine BC
// Saldo articolo (Movimenti warehouse)
// Implementazione integrata nel flusso BC_TOOLS_SALDO_ARTICOLO.

// Campi forzati: PageLayoutExpanded (wide=true / normal=false)

// Entry point comando
// (entry point BC_TOOLS_SALDO_ARTICOLO gestito più sotto, evitando doppie registrazioni listener)
//                AsideAreaRightExpanded (aperta=true / chiusa=false)
// NON usa CSS wide né Ctrl+F12. NON hardcoda user/env.
//
// FRAME: lo script gira con all_frames:true. Le classi CSS vanno messe sul body
// di OGNI frame (sono per-documento), mentre localStorage è per-ORIGIN: se ogni
// iframe tenesse il proprio intervallo, N frame rifarebbero N volte lo stesso
// lavoro ogni 500ms. L'enforcement lo fa quindi un frame solo — il più in alto
// raggiungibile con la stessa origin; se il top è cross-origin (BC incorporato
// altrove) se ne occupa il frame corrente.

(function () {
  'use strict';
  const BC_DIAG_COMPONENT = 'bc-content';
  // diagnostica UI condivisa
  function bcDiagnostic(event, details) {
    try {
      window.bcToolsDiagnostic?.sendDiagnostic?.({
        component: BC_DIAG_COMPONENT,
        event,
        details,
      });
    } catch (_) {}
  }
  function bcDiagnosticTarget(target) {
    try { return window.bcToolsDiagnostic?.bcDiagnosticTarget?.(target) || null; } catch (_) { return null; }
  }
  document.addEventListener('click', event => { const target=bcDiagnosticTarget(event.target); if(target) bcDiagnostic('ui-click', target); }, true);
  document.addEventListener('change', event => { const target=bcDiagnosticTarget(event.target); if(target) bcDiagnostic('ui-change', target); }, true);
  document.addEventListener('submit', event => bcDiagnostic('ui-submit', bcDiagnosticTarget(event.target) || {}), true);
  window.addEventListener('error', event => bcDiagnostic('runtime-error', { message:String(event.message || '').slice(0,300), file:String(event.filename || '').split('/').pop(), line:event.lineno || null, column:event.colno || null }));
  window.addEventListener('unhandledrejection', event => bcDiagnostic('unhandled-rejection', { reason:String(event.reason && event.reason.message || event.reason || '').slice(0,300) }));
  const CLS = {
    HIDE_NOTIF:      'bc-tools-hide-notifications-button',
    MONO_VALUES:     'bc-tools-show-values-in-monospace',
    HYPHEN_CAPTIONS: 'bc-tools-show-hyphens-in-column-captions',
    PAGE_FIELD_COPY: 'bc-tools-show-page-field-copy-button'
  };

  function applyNotificationButtonVisibility(enabled) {
    const root = document.documentElement;
    if (root) root.classList.toggle(CLS.HIDE_NOTIF, !!enabled);
  }

  const DEFAULTS = {
    hideNotificationsButton:    false,
    showValuesInMonospace:      false,
    showHyphensInColumnCaptions:false,
    highlightStatusRows:        false,
    autoOpenHomeSearch:       false,
    showPageFieldCopyButton:  false,
    pageFieldCopyEnabled:     null,
    pageFieldCopyClickable:   null,
    pageFieldCopyFlowField:   null,
    pageFieldCopyMode:        null,
    pageFieldCopyGlobalPreferences:true,
    showCreatedDocumentButton:true,
    enableTableExport:false,
    autoShowMore:false,
    autoWide:false,
    layoutMode:'wide',
    forceFactbox:false,
    factboxMode:'closed',
  };

  function pageFieldCopyEnabled(value) {
    const modes = ['none', 'underlined', 'teal', 'both'];
    const legacyMode = modes.includes(value.pageFieldCopyMode)
      ? value.pageFieldCopyMode : (value.showPageFieldCopyButton ? 'both' : 'none');
    if (typeof value.pageFieldCopyEnabled === 'boolean') return value.pageFieldCopyEnabled;
    return legacyMode !== 'none';
  }

  function pageFieldCopyMode(value) {
    const modes = ['none', 'underlined', 'teal', 'both'];
    const legacyMode = modes.includes(value.pageFieldCopyMode)
      ? value.pageFieldCopyMode : (value.showPageFieldCopyButton ? 'both' : 'none');
    if (!pageFieldCopyEnabled(value)) return 'none';
    if (value.pageFieldCopyEnabled !== true) return legacyMode;
    const clickable = typeof value.pageFieldCopyClickable === 'boolean'
      ? value.pageFieldCopyClickable : ['underlined', 'both'].includes(legacyMode);
    const flowField = typeof value.pageFieldCopyFlowField === 'boolean'
      ? value.pageFieldCopyFlowField : ['teal', 'both'].includes(legacyMode);
    return clickable ? (flowField ? 'both' : 'underlined') : (flowField ? 'teal' : 'none');
  }

  // ── stato enforce ────────────────────────────────────────────────────────────
  let settings        = Object.assign({}, DEFAULTS);
  let enforceTimer    = null;
  let layoutEnabled   = false;
  let layoutTarget    = true;    // true=wide, false=normal
  let factboxEnabled  = false;
  let factboxTarget   = false;   // true=aperta, false=chiusa
  let showMoreEnabled = false;
  let showMoreState = { pageKey:'', opened:false };

  document.addEventListener('DOMContentLoaded', () => {
    applyNotificationButtonVisibility(settings.hideNotificationsButton);
  }, { once:true });

  // Un solo frame per origin fa l'enforcement su localStorage.
  const isEnforcerFrame = (() => {
    try { return window.top === window || window.top.location.origin !== location.origin; }
    catch (_) { return true; }   // top cross-origin: questo frame fa da sé
  })();
  const isTopFrame = (() => { try { return window.top === window; } catch (_) { return false; } })();

  // ── helpers localStorage ─────────────────────────────────────────────────────
  function isLayoutKey(key) {
    return typeof key === 'string' && key.toLowerCase().includes(':layout:');
  }

  // ── Saldo articolo (Movimenti warehouse) ─────────────────────────────────────
  const SALDO_ARTICOLO = {
    expectedPageId: '7318',
    panelId: 'bc-tools-saldo-articolo-panel',
    busyId: 'bc-tools-saldo-articolo-status',
    closeBtnId: 'bc-tools-saldo-articolo-close',
    highlightCls: 'bc-tools-saldo-articolo-highlight',
    selectedCls: 'bc-tools-saldo-articolo-selected',
    invalidatedCls: 'bc-tools-saldo-articolo-invalidated',

    lockKey: 'bc-tools-saldo-articolo-lock',
    panelFpKey: 'bc-tools-saldo-articolo-panel-fp',
    maxDetailRows: 200,
    maxAutoscrollRounds: 5000,
    maxAutoscrollNoProgressRounds: 6,
  };

  function ensureSaldoCss() {
    const id = 'bc-tools-saldo-articolo-style';
    if (document.getElementById(id)) return;
    const st = document.createElement('style');
    st.id = id;
    st.textContent = `
      .${SALDO_ARTICOLO.highlightCls} { outline: 2px solid rgba(0,120,212,.85) !important; outline-offset: -2px !important; }
      .${SALDO_ARTICOLO.selectedCls} { outline: 3px solid rgba(0,120,212,1) !important; outline-offset: -3px !important; }
      .${SALDO_ARTICOLO.invalidatedCls} { filter: grayscale(.15); opacity: .92; }
      .bc-tools-saldo-balance-zero { color: light-dark(#705400, #f5d547); }
      .bc-tools-saldo-balance-positive { color: light-dark(#137333, #63d992); }
      .bc-tools-saldo-balance-negative { color: light-dark(#b3261e, #ff8a80); }
    `;
    document.documentElement.appendChild(st);
  }

  function getCurrentTopPageId() {
    let href = '';
    let urlSource = 'top';
    let topUrlAccessible = false;
    try {
      href = window.top.location.href;
      topUrlAccessible = true;
    } catch (_) {}
    if (!topUrlAccessible) {
      urlSource = 'current';
      try { href = window.location.href; } catch (_) {}
    }

    let pageId = '';
    try {
      const params = new URL(href).searchParams;
      const raw = params.get('page') || params.get('Page') || params.get('pageId') || params.get('pageid') || '';
      const match = String(raw).match(/\d+/);
      pageId = match ? match[0] : '';
    } catch (_) {}
    try {
      bcDiagnostic('saldo-page-id-resolved', {
        urlUsed: urlSource === 'top' ? 'window.top.location.href' : 'window.location.href',
        pageId: pageId || null
      });
    } catch (_) {}
    return pageId;
  }

  function getActiveTabGridRoot() {
    // Heuristic: riusa le stesse utilità già presenti per export/autoscroll.
    // tableExportRoots() e tableExportScroller() sono definiti più sotto; qui usiamo i placeholder e
    // recuperiamo i riferimenti quando richiamiamo la pipeline.
    return null;
  }

  function removeSaldoPanel() {
    const el = document.getElementById(SALDO_ARTICOLO.panelId);
    if (el) el.remove();
  }

  let saldoHighlightRoot = null;
  function clearSaldoHighlights(root) {
    const doc = (root || saldoHighlightRoot)?.ownerDocument;
    if (!doc) return;
    for (const cls of [SALDO_ARTICOLO.highlightCls, SALDO_ARTICOLO.selectedCls, SALDO_ARTICOLO.invalidatedCls]) {
      const nodes = Array.from(doc.querySelectorAll('.' + cls));
      nodes.forEach(n => n.classList.remove(cls));
    }
  }

  function sharedSessionStorageJsonGet(key, fallback) {
    try {
      const raw = sharedSessionStorage().getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function sharedSessionStorageJsonSet(key, value) {
    try { sharedSessionStorage().setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function getLock() {
    return sharedSessionStorageJsonGet(SALDO_ARTICOLO.lockKey, { running: false, startedAt: 0 });
  }

  function getPanelFp() {
    const fpStore = sharedSessionStorageJsonGet(SALDO_ARTICOLO.panelFpKey, { fp: null });
    return fpStore && fpStore.fp ? fpStore.fp : null;
  }

  function setPanelFp(fp) {
    if (!fp) return;
    const fpStore = sharedSessionStorageJsonGet(SALDO_ARTICOLO.panelFpKey, { fp: null });
    fpStore.fp = fp;
    sharedSessionStorageJsonSet(SALDO_ARTICOLO.panelFpKey, fpStore);
  }

  function invalidatePanelIfFpChanged(viewFp) {
    const current = getPanelFp();
    if (!current) return false;
    if (String(current) !== String(viewFp)) {
      const panel = document.getElementById(SALDO_ARTICOLO.panelId);
      if (panel) panel.classList.add(SALDO_ARTICOLO.invalidatedCls);
      return true;
    }
    return false;
  }

  function setLock(v) {
    sharedSessionStorageJsonSet(SALDO_ARTICOLO.lockKey, v);
  }

  function getAccessibleBusyPanel(text) {
    let panel = document.getElementById(SALDO_ARTICOLO.panelId);
    const created = !panel;
    if (created) {
      ensureSaldoCss();
      panel = document.createElement('div');
      panel.id = SALDO_ARTICOLO.panelId;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Saldo articolo');
      panel.style.position = 'fixed';
      panel.style.top = '64px';
      panel.style.right = '16px';
      panel.style.maxHeight = 'calc(50vh - 64px)';
      panel.style.overflowY = 'auto';
      panel.style.overscrollBehavior = 'contain';
      panel.style.boxSizing = 'border-box';
      panel.style.zIndex = '2147483000';
      panel.style.maxWidth = '420px';
      panel.style.width = 'calc(100vw - 32px)';
      panel.style.background = 'var(--bc-tools-panel-bg, rgba(255,255,255,.96))';
      panel.style.border = '1px solid rgba(0,0,0,.15)';
      panel.style.borderRadius = '10px';
      panel.style.boxShadow = '0 8px 24px rgba(0,0,0,.12)';
      panel.style.padding = '12px';
      panel.style.display = 'grid';
      panel.style.gap = '10px';

      const close = document.createElement('button');
      close.id = SALDO_ARTICOLO.closeBtnId;
      close.type = 'button';
      close.textContent = '×';
      close.style.position = 'absolute';
      close.style.top = '8px';
      close.style.right = '10px';
      close.style.fontSize = '20px';
      close.style.lineHeight = '20px';
      close.style.background = 'transparent';
      close.style.border = 'none';
      close.style.cursor = 'pointer';
      close.setAttribute('aria-label', 'Chiudi');
      panel.appendChild(close);

      const status = document.createElement('div');
      status.id = SALDO_ARTICOLO.busyId;
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.textContent = text || '';
      panel.appendChild(status);

      const saldoArea = document.createElement('div');
      saldoArea.innerHTML = `
        <div style="font-weight:600;margin-bottom:6px;">Saldo articolo</div>
        <div id="${SALDO_ARTICOLO.panelId}-summary" role="list" tabindex="0"></div>
      `;
      panel.appendChild(saldoArea);

      const selArea = document.createElement('div');
      selArea.innerHTML = `
        <div style="font-weight:600;margin-bottom:6px;">Riga selezionata</div>
        <div id="${SALDO_ARTICOLO.panelId}-detail" role="region" aria-live="polite"></div>
      `;
      panel.appendChild(selArea);

      document.body.appendChild(panel);

      close.addEventListener('click', () => {
        removeSaldoPanel();
        clearSaldoHighlights();
        detachSaldoRowListeners();
      });
    }

    const statusEl = document.getElementById(SALDO_ARTICOLO.busyId);
    if (statusEl) statusEl.textContent = text;
    try { bcDiagnostic('saldo-panel-opened', { created }); } catch (_) {}
    if (!panel.classList.contains(SALDO_ARTICOLO.invalidatedCls)) {
      // stato valido di default; verrà marcato invalido se fingerprint cambia
    }
    return panel;
  }

  let saldoRowCleanup = null;
  function detachSaldoRowListeners() {
    if (saldoRowCleanup) { try { saldoRowCleanup(); } catch (_) {} }
    saldoRowCleanup = null;
  }

  async function handleSaldoArticoloCommand(_message, onStarted) {
    try { bcDiagnostic('saldo-handler-enter', { frame: isTopFrame ? 'top' : 'child' }); } catch (_) {}
    const pageId = getCurrentTopPageId();
    if (String(pageId) !== SALDO_ARTICOLO.expectedPageId) {
      try { bcDiagnostic('saldo-command-error', { reason: 'wrong-page' }); } catch (_) {}
      return { ok: false, error: 'wrong-page' };
    }

    let lockAcquired = false;
    let panel = null;
    try {
      // anti-concorrenza
      const lock = getLock();
      if (lock && lock.running) {
        panel = getAccessibleBusyPanel('Aggiornamento…');
        const runningStatus = document.getElementById(SALDO_ARTICOLO.busyId);
        if (runningStatus) runningStatus.textContent = 'Saldo articolo già in aggiornamento.';
        try { bcDiagnostic('saldo-command-error', { reason: 'running' }); } catch (_) {}
        return { ok: false, error: 'running' };
      }
      setLock({ running: true, startedAt: Date.now() });
      lockAcquired = true;

      clearSaldoHighlights();
      detachSaldoRowListeners();
      removeSaldoPanel();

      // stato iniziale
      panel = getAccessibleBusyPanel('Aggiornamento…');
      const busyEl = document.getElementById(SALDO_ARTICOLO.busyId);
      if (!busyEl) throw new Error('Busy panel non disponibile');

      const gridRoot = locateMovimentiWarehouseGrid();
      if (!gridRoot) {
        saldoHighlightRoot = null;
        busyEl.textContent = 'Impossibile trovare la griglia Movimenti warehouse.';
        return { ok: false, error: 'grid-not-found' };
      }
      saldoHighlightRoot = gridRoot;
      clearSaldoHighlights(gridRoot);
      if (typeof onStarted === 'function') onStarted();

      const initialViewFp = saldoViewFingerprint(gridRoot);
      let capture;
      try {
        capture = await captureSaldoGrid(gridRoot, initialViewFp);
      } catch (error) {
        if (error.message === 'view-changed') {
          clearSaldoHighlights();
          const statusEl = document.getElementById(SALDO_ARTICOLO.busyId);
          if (statusEl) statusEl.textContent = 'Da aggiornare: la vista è cambiata.';
          return { ok: false, error: 'view-changed' };
        }
        if (error.message === 'cancelled') return { ok: false, error: 'cancelled' };
        throw error;
      }

      const gridInfo = capture.gridInfo;
      if (gridInfo.missingColumns.length) {
        try { bcDiagnostic('saldo-required-columns-missing', { missingColumns: gridInfo.missingColumns }); } catch (_) {}
        busyEl.textContent = 'Colonne necessarie non trovate nella griglia';
        return { ok: false, error: 'required-columns-missing' };
      }
      const movements = extractSaldoMovementsFromRows(capture.rows, gridInfo, new Set());

      if (!movements.length) {
        busyEl.textContent = 'Nessun movimento disponibile nella vista filtrata.';
        return { ok: true, empty: true };
      }

      const groups = buildSaldoGroups(movements);

      busyEl.textContent = 'Fatto';
      const summaryEl = document.getElementById(SALDO_ARTICOLO.panelId + '-summary');
      const detailEl = document.getElementById(SALDO_ARTICOLO.panelId + '-detail');
      if (!summaryEl || !detailEl) throw new Error('Elementi pannello mancanti');

      summaryEl.innerHTML = '';
      detailEl.innerHTML = '';

      // fingerprint vista (best-effort, solo struttura/URL)
      const viewFp = saldoViewFingerprint(gridRoot);
      try {
        const fpStore = sharedSessionStorageJsonGet(SALDO_ARTICOLO.panelFpKey, { fp: null });
        fpStore.fp = viewFp;
        sharedSessionStorageJsonSet(SALDO_ARTICOLO.panelFpKey, fpStore);
      } catch (_) {}

      renderSaldoSummary(summaryEl, groups);

      const firstGroupKey = summaryEl.querySelector('[data-saldo-articolo-group]')?.getAttribute('data-saldo-articolo-group');
      if (firstGroupKey) {
        renderSaldoDetail(detailEl, movements, groups, firstGroupKey);
        attachSaldoGroupHandlers(summaryEl, detailEl, movements, groups, gridRoot);
      }

      return { ok: true, movementsCount: movements.length, groupsCount: groups.size };
    } catch (e) {
      const msg = (e && e.message) ? e.message : String(e);
      try { bcDiagnostic('saldo-command-error', { reason: 'exception' }); } catch (_) {}
      let statusEl = null;
      try { statusEl = document.getElementById(SALDO_ARTICOLO.busyId); } catch (_) {}
      if (!statusEl) {
        try {
          panel = getAccessibleBusyPanel('Errore: ' + msg);
          statusEl = document.getElementById(SALDO_ARTICO.busyId);
        } catch (_) {}
      }
      if (statusEl) statusEl.textContent = 'Errore: ' + msg;
      return { ok: false, error: msg };
    } finally {
      if (lockAcquired) setLock({ running: false, startedAt: 0 });
    }
  }

  async function captureSaldoGrid(root, initialViewFp) {
    let doc = root.ownerDocument;
    let verticalScroller = saldoGridScroller(root, doc, 'y');
    let horizontalScroller = saldoGridScroller(root, doc, 'x');
    let scanBidirectionally = !!(verticalScroller && horizontalScroller);
    const refreshSaldoContext = () => {
      const current = root?.isConnected && tableExportVisible(root)
        ? root : locateMovimentiWarehouseGrid();
      if (!current || !current.isConnected) throw new Error('grid-context-lost');
      root = current;
      doc = root.ownerDocument;
      verticalScroller = saldoGridScroller(root, doc, 'y');
      horizontalScroller = saldoGridScroller(root, doc, 'x');
      scanBidirectionally = !!(verticalScroller && horizontalScroller);
      return root;
    };
    const initialTop = verticalScroller ? verticalScroller.scrollTop : null;
    const initialLeft = horizontalScroller ? horizontalScroller.scrollLeft : null;
    const records = new Map();
    const columns = new Map();
    const ariaOwners = new Map();
    const positionAria = new Map();
    const fallbackPositions = new Map();
    const identityStrategies = new Set();
    const sourceColumnStats = new Map(['sourceDocument', 'sourceNo'].map(key => [key, { emptyRows:new Set(), associationErrors:new Set() }]));
    const required = new Set(['articolo', 'qty', 'uom', 'locationCode', 'binCode']);
    const originColumns = new Set(['srcType', 'srcDocNo', 'srcLineNo', 'sourceDocument', 'sourceNo']);
    let verticalWindows = 0;
    let horizontalWindows = 0;
    let rowsCreated = 0;
    let rowsUpdated = 0;
    let duplicatesAvoided = 0;
    let stopReason = 'scan-incomplete';
    let columnInventoryComplete = false;

    const checkCaptureState = () => {
      if (!getLock()?.running) throw new Error('cancelled');
      refreshSaldoContext();
      if (saldoViewFingerprint(root) !== initialViewFp) throw new Error('view-changed');
    };
    const columnForHeader = header => {
      const labels = [header.getAttribute('title'), header.getAttribute('aria-label'), header.getAttribute('abbr'), textOf(header)].map(normalizedGridLabel);
      if (labels.includes('source document') || labels.includes('documento origine')) return ['sourceDocument', 'Source Document'];
      if (labels.includes('source no') || labels.includes('nr origine')) return ['sourceNo', 'Source No.'];
      const label = labels.find(Boolean) || '';
      if (labels.some(isArticleGridLabel)) return ['articolo', 'Nr. articolo'];
      if ((label.includes('quantita') || label === 'qty') && !label.includes('alternativa')) return ['qty', 'Quantità'];
      if ((label.includes('unit') && label.includes('misura')) || label === 'unita') return ['uom', 'Cod. unità di misura'];
      if (label.includes('variante') && !label.includes('alternativa')) return ['variante', 'Cod. variante'];
      if (label.includes('entry') || (label.includes('movimento') && label.includes('nr'))) return ['movimentoId', 'Nr. movimento'];
      if (label.includes('ubicazione') || label === 'location' || label.includes('location code')) return ['locationCode', 'Cod. ubicazione'];
      if (label.includes('collocazione') || label === 'bin' || label.includes('bin code')) return ['binCode', 'Cod. collocazione'];
      if (label.includes('tipo documento whse') || label.includes('tipo documento')) return ['srcType', 'Tipo documento whse.'];
      if ((label.includes('documento') && label.includes('whse') && !label.includes('tipo')) || (label.includes('nr') && label.includes('documento'))) return ['srcDocNo', 'Nr. documento whse.'];
      if (label.includes('riga origine') || label.includes('line')) return ['srcLineNo', 'Nr. riga origine'];
      return null;
    };
    const readSnapshot = () => {
      const headers = headersOf(root);
      const headerRow = findHeaderRow(root);
      const rows = tableExportRowElements(root).filter(row => row !== headerRow
        && !row.querySelector('[role="columnheader"],th')
        && !row.closest('table.ms-nav-grid-header-table'));
      const signature = JSON.stringify([
        verticalScroller?.scrollTop,
        horizontalScroller?.scrollLeft,
        headers.map(header => [header.getAttribute('aria-colindex'), header.getAttribute('title'), header.getAttribute('aria-label'), textOf(header)]),
        rows.map(row => [row.getAttribute('data-id'), row.getAttribute('data-row-key'), row.getAttribute('aria-rowindex'),
          tableExportCellElements(row).map(tableExportCellText)])
      ]);
      return { headers, rows, signature };
    };
    const stableSnapshot = async () => {
      let previous = '';
      let stableReads = 0;
      let mutationVersion = 0;
      for (let attempt = 0; attempt < 30; attempt++) {
        refreshSaldoContext();
        const observedRoot = root;
        let observer = null;
        try {
          const Observer = root.ownerDocument?.defaultView?.MutationObserver
            || (typeof window !== 'undefined' ? window.MutationObserver : null);
          if (typeof Observer === 'function') {
            observer = new Observer(() => { mutationVersion++; });
            observer.observe(root, { childList:true, subtree:true, characterData:true, attributes:true });
          }
        } catch (_) {}
        const observedMutationVersion = mutationVersion;
        await tableExportWait(60);
        let snapshot;
        try {
          refreshSaldoContext();
          snapshot = readSnapshot();
          if (root === observedRoot && snapshot.signature === previous && !tableExportBusy(root)
            && mutationVersion === observedMutationVersion) {
            stableReads++;
            if (stableReads >= 2) return snapshot;
          } else {
            previous = snapshot.signature;
            stableReads = 0;
          }
        } finally {
          if (observer) observer.disconnect();
        }
      }
      throw new Error('grid-not-stable');
    };
    const addSnapshot = (snapshot, verticalWindowIdentity) => {
      const headers = snapshot.headers.map((header, headerPosition) => ({ header, headerPosition, column:columnForHeader(header) })).filter(item => item.column);
      headers.forEach(({ column }) => {
        if (!columns.has(column[0])) columns.set(column[0], column[1]);
      });
      const foundHere = new Set(headers.map(item => item.column[0]));
      const scrollerRect = verticalScroller?.getBoundingClientRect();
      snapshot.rows.forEach((row, rowPosition) => {
        const dataId = row.getAttribute('data-id');
        const rowKey = row.getAttribute('data-row-key');
        const rawAriaIndex = Number(row.getAttribute('aria-rowindex'));
        const ariaIndex = Number.isInteger(rawAriaIndex) && rawAriaIndex > 0 ? rawAriaIndex : 0;
        const hasStableIdentity = !!(dataId || rowKey);
        const rowRect = row.getBoundingClientRect ? row.getBoundingClientRect() : null;
        const absolutePosition = verticalScroller && rowRect && Number.isFinite(rowRect.top) && scrollerRect
          ? Math.round(verticalScroller.scrollTop + rowRect.top - scrollerRect.top)
          : rowPosition;
        const physicalPositionKey = `${verticalScroller ? 'vertical-scroll-content' : verticalWindowIdentity}:${absolutePosition}`;
        if (ariaIndex && !hasStableIdentity) {
          const previousAria = positionAria.get(physicalPositionKey);
          if (previousAria && previousAria !== ariaIndex) throw new Error('aria-rowindex-inconsistent');
          positionAria.set(physicalPositionKey, ariaIndex);
        }
        let identity;
        let strategy;
        if (dataId) {
          identity = `data-id:${dataId}`;
          strategy = 'data-id';
        } else if (rowKey) {
          identity = `data-row-key:${rowKey}`;
          strategy = 'data-row-key';
        } else if (ariaIndex) {
          identity = `aria-rowindex:${ariaIndex}`;
          strategy = 'aria-rowindex';
        } else {
          const positionKey = `${verticalScroller ? 'vertical-scroll-content' : 'static-content'}:${absolutePosition}`;
          identity = fallbackPositions.get(positionKey) || `fallback:${verticalWindowIdentity}:row:${absolutePosition}`;
          fallbackPositions.set(positionKey, identity);
          strategy = 'vertical-window-position';
        }
        identityStrategies.add(strategy);
        if (ariaIndex && ariaOwners.has(ariaIndex) && ariaOwners.get(ariaIndex) !== identity) {
          throw new Error('aria-rowindex-recycled');
        }
        if (ariaIndex) ariaOwners.set(ariaIndex, identity);

        const rowValues = new Map();
        const cells = tableExportCellElements(row);
        headers.forEach(({ header, headerPosition, column }) => {
          const ariaColumn = Number(header.getAttribute('aria-colindex'));
          const headerCellIndex = Number(header.cellIndex);
          const ariaCell = Number.isInteger(ariaColumn) && ariaColumn > 0
            ? cells.find(item => Number(item.getAttribute('aria-colindex')) === ariaColumn) : null;
          const indexedCell = Number.isInteger(headerCellIndex) && headerCellIndex >= 0
            ? cells.find(item => Number(item.cellIndex) === headerCellIndex) : null;
          const sourceStats = sourceColumnStats.get(column[0]);
          const positionalCell = !sourceStats && cells.length === snapshot.headers.length
            ? cells[headerPosition] : null;
          const cell = ariaCell || indexedCell
            || positionalCell;
          if (!cell && sourceStats) {
            sourceStats.associationErrors.add(identity);
            return;
          }
          if (cell && tableExportVisible(cell)) {
            const value = tableExportCellText(cell);
            rowValues.set(column[0], value);
            if (sourceStats && (!normalizeCellText(value) || normalizedGridLabel(value) === 'vuoto')) sourceStats.emptyRows.add(identity);
          }
        });

        let record = records.get(identity);
        const isNewRecord = !record;
        if (!record) {
          record = { key:identity, values:new Map(), ariaIndex };
          records.set(identity, record);
          rowsCreated++;
        } else {
          duplicatesAvoided++;
          if (!hasStableIdentity && record.ariaIndex && ariaIndex && record.ariaIndex !== ariaIndex) throw new Error('aria-rowindex-inconsistent');
          if (!record.ariaIndex && ariaIndex) record.ariaIndex = ariaIndex;
        }
        let updated = false;
        rowValues.forEach((value, key) => {
          const previousValue = record.values.get(key);
          if (previousValue && value && previousValue !== value) {
            if (strategy === 'aria-rowindex' || record.ariaIndex) throw new Error('aria-rowindex-recycled');
            throw new Error('row-values-inconsistent');
          }
          if ((!previousValue || previousValue === '') && value) {
            record.values.set(key, value);
            updated = true;
          } else if (!record.values.has(key)) {
            record.values.set(key, value);
          }
        });
        if (updated && !isNewRecord) rowsUpdated++;
      });
      return foundHere;
    };
    const foundRequired = () => [...required].every(key => columns.has(key));

    try {
      if (!findHeaderRow(root)) throw new Error('header-row-not-found');
      if (verticalScroller) verticalScroller.scrollTop = 0;
      if (horizontalScroller) horizontalScroller.scrollLeft = 0;
      let verticalNoProgress = 0;
      let verticalBottomStable = 0;
      for (let verticalRound = 0; verticalRound < SALDO_ARTICOLO.maxAutoscrollRounds; verticalRound++) {
        if (verticalScroller && verticalBottomStable > 0) {
          const previousHeight = verticalScroller.scrollHeight;
          const maxTop = Math.max(0, previousHeight - verticalScroller.clientHeight);
          if (verticalScroller.scrollTop >= maxTop - 2) {
            await stableSnapshot();
            checkCaptureState();
            refreshSaldoContext();
            const grew = verticalScroller && verticalScroller.scrollHeight > previousHeight + 1;
            if (grew || tableExportBusy(root)) { verticalBottomStable = 0; continue; }
            if (++verticalBottomStable >= 10) { stopReason = 'vertical-boundary'; break; }
            continue;
          }
          verticalBottomStable = 0;
        }
        const verticalWindowIdentity = `window:${verticalRound}:${verticalScroller ? Math.round(verticalScroller.scrollTop) : 'static'}`;
        verticalWindows++;
        refreshSaldoContext();
        if (horizontalScroller) {
          horizontalScroller.scrollLeft = 0;
          await stableSnapshot();
          refreshSaldoContext();
          if (horizontalScroller && horizontalScroller.scrollLeft > 1) {
            horizontalScroller.scrollLeft = 0;
            await stableSnapshot();
            refreshSaldoContext();
          }
        }
        const knownColumnsBeforeVertical = new Set(columns.keys());
        const columnsThisVertical = new Set();
        let horizontalNoProgress = 0;
        let horizontalBoundaryReached = false;
        let horizontalCoverageComplete = false;
        let newColumnFound = false;
        for (let horizontalRound = 0; horizontalRound < 1000; horizontalRound++) {
          const snapshot = await stableSnapshot();
          checkCaptureState();
          horizontalWindows++;
          const found = addSnapshot(snapshot, verticalWindowIdentity);
          found.forEach(key => {
            columnsThisVertical.add(key);
            if (!knownColumnsBeforeVertical.has(key)) newColumnFound = true;
          });
          if (!scanBidirectionally
            && [...required].every(key => columnsThisVertical.has(key))
            && [...originColumns].every(key => columnsThisVertical.has(key))) {
            horizontalCoverageComplete = true;
            break;
          }
          if (!horizontalScroller) {
            stopReason = 'horizontal-scroller-unavailable';
            break;
          }
          const maxLeft = Math.max(0, horizontalScroller.scrollWidth - horizontalScroller.clientWidth);
          if (horizontalScroller.scrollLeft >= maxLeft - 2) {
            horizontalBoundaryReached = true;
            stopReason = 'horizontal-boundary';
            break;
          }
          const previousLeft = horizontalScroller.scrollLeft;
          horizontalScroller.scrollLeft = Math.min(maxLeft, previousLeft + Math.max(1, Math.floor(horizontalScroller.clientWidth * .72)));
          horizontalNoProgress = horizontalScroller.scrollLeft <= previousLeft + 1 ? horizontalNoProgress + 1 : 0;
          if (horizontalNoProgress >= SALDO_ARTICOLO.maxAutoscrollNoProgressRounds) {
            stopReason = 'horizontal-no-progress';
            throw new Error(stopReason);
          }
          await tableExportWait(60);
          checkCaptureState();
        }
        if (scanBidirectionally && !horizontalBoundaryReached && !horizontalCoverageComplete) {
          stopReason = 'horizontal-window-limit';
          throw new Error(stopReason);
        }
        if (scanBidirectionally && horizontalBoundaryReached) {
          const missingColumns = [...columns.keys()].filter(key => !columnsThisVertical.has(key));
          if (columnInventoryComplete && missingColumns.length) {
            stopReason = 'vertical-window-columns-missing';
            throw new Error(stopReason);
          }
          columnInventoryComplete = true;
        }
        if (!verticalScroller) {
          stopReason = 'vertical-scroller-unavailable';
          break;
        }
        const previousHeight = verticalScroller.scrollHeight;
        const maxTop = Math.max(0, previousHeight - verticalScroller.clientHeight);
        if (verticalScroller.scrollTop >= maxTop - 2) {
          await stableSnapshot();
          checkCaptureState();
          refreshSaldoContext();
          const grew = verticalScroller && verticalScroller.scrollHeight > previousHeight + 1;
          if (grew || tableExportBusy(root)) { verticalBottomStable = 1; continue; }
          if (++verticalBottomStable >= 10) { stopReason = 'vertical-boundary'; break; }
          continue;
        }
        verticalBottomStable = 0;
        const previousTop = verticalScroller.scrollTop;
        verticalScroller.scrollTop = Math.min(maxTop, previousTop + Math.max(80, Math.floor(verticalScroller.clientHeight * .55)));
        verticalNoProgress = verticalScroller.scrollTop <= previousTop + 1 ? verticalNoProgress + 1 : 0;
        if (verticalNoProgress >= SALDO_ARTICOLO.maxAutoscrollNoProgressRounds) {
          stopReason = 'vertical-no-progress';
          throw new Error(stopReason);
        }
        await stableSnapshot();
        checkCaptureState();
      }
      if (verticalScroller && verticalWindows >= SALDO_ARTICOLO.maxAutoscrollRounds
        && verticalScroller.scrollTop < verticalScroller.scrollHeight - verticalScroller.clientHeight - 2) {
        stopReason = 'vertical-window-limit';
        throw new Error(stopReason);
      }

      const headerOrder = ['movimentoId', 'articolo', 'variante', 'uom', 'qty', 'locationCode', 'binCode', 'sourceDocument', 'sourceNo', 'srcType', 'srcDocNo', 'srcLineNo'];
      const headersForExport = headerOrder.filter(key => columns.has(key)).map((key, index) => ({
        cellIndex:index,
        textContent:columns.get(key),
        getAttribute(name) {
          if (name === 'title' || name === 'aria-label') return columns.get(key);
          if (name === 'aria-colindex') return String(index + 1);
          return null;
        }
      }));
      const gridInfo = buildSaldoGridInfo(root, headersForExport);
      if (!gridInfo.missingColumns.length && stopReason === 'scan-incomplete') stopReason = foundRequired() ? 'required-columns-acquired' : 'scan-complete';
      if (verticalWindows >= SALDO_ARTICOLO.maxAutoscrollRounds && stopReason === 'scan-incomplete') stopReason = 'vertical-window-limit';
      if (horizontalWindows >= 1000 && stopReason === 'scan-incomplete') stopReason = 'horizontal-window-limit';
      if (gridInfo.missingColumns.length) stopReason = `required-columns-missing:${gridInfo.missingColumns.join(',')}`;
      const rows = [...records.values()].map(record => ({
        key:record.key,
        values:headersForExport.map(header => {
          const label = normalizedGridLabel(header.getAttribute('title'));
          const key = label.includes('movimento') || label.includes('entry') ? 'movimentoId'
            : label.includes('articolo') ? 'articolo'
              : label.includes('variante') ? 'variante'
                : label.includes('unita') ? 'uom'
                  : label.includes('quantita') ? 'qty'
                    : label.includes('ubicazione') || label.includes('location') ? 'locationCode'
                      : label.includes('collocazione') || label === 'bin' || label.includes('bin code') ? 'binCode'
                        : label === 'source document' ? 'sourceDocument'
                          : label === 'source no' ? 'sourceNo'
                            : label.includes('tipo documento') ? 'srcType'
                              : label.includes('documento') ? 'srcDocNo' : 'srcLineNo';
          return record.values.get(key) || '';
        })
      }));
      if (gridInfo.missingColumns.length) {
        bcDiagnostic('saldo-grid-scan-error', { reason:'required-columns-missing' });
      }
      return { rows, gridInfo };
    } catch (error) {
      stopReason = error.message || 'scan-error';
      try { bcDiagnostic('saldo-grid-scan-error', { reason:stopReason }); } catch (_) {}
      throw error;
    } finally {
      try { refreshSaldoContext(); } catch (_) {}
      try { if (verticalScroller && Number.isFinite(initialTop)) verticalScroller.scrollTop = initialTop; } catch (_) {}
      try { if (horizontalScroller && Number.isFinite(initialLeft)) horizontalScroller.scrollLeft = initialLeft; } catch (_) {}
      try {
        for (const [column, stats] of sourceColumnStats) {
          if (!columns.has(column)) bcDiagnostic('saldo-source-column-missing', { column });
          if (stats.emptyRows.size) bcDiagnostic('saldo-source-values-empty', { column, rows:stats.emptyRows.size });
          if (stats.associationErrors.size) bcDiagnostic('saldo-source-cell-association-error', { column, rows:stats.associationErrors.size });
        }
        bcDiagnostic('saldo-grid-scan', {
          verticalWindows,
          horizontalWindows,
          logicalRowsCreated:rowsCreated,
          logicalRowsUpdated:rowsUpdated,
          duplicatesAvoided,
          columnsFound:[...columns.keys()].map(key => ({
            articolo:'Nr. articolo', qty:'Quantità', uom:'Cod. unità di misura', variante:'Cod. variante',
            movimentoId:'Nr. movimento', locationCode:'Cod. ubicazione', binCode:'Cod. collocazione',
            sourceDocument:'Source Document', sourceNo:'Source No.', srcType:'Tipo documento whse.',
            srcDocNo:'Nr. documento whse.', srcLineNo:'Nr. riga origine'
          })[key]),
          identityStrategies:[...identityStrategies],
          stopReason
        });
      } catch (_) {}
    }
  }

  function saldoGridScroller(root, doc, axis) {
    const candidates = [root, ...Array.from(root.querySelectorAll('*'))];
    for (let node = root.parentElement; node && node !== doc.body; node = node.parentElement) candidates.push(node);
    const view = doc.defaultView;
    for (const node of candidates) {
      if (!tableExportVisible(node)) continue;
      const style = view.getComputedStyle(node);
      const horizontal = axis === 'x';
      const extent = horizontal ? node.scrollWidth : node.scrollHeight;
      const client = horizontal ? node.clientWidth : node.clientHeight;
      const overflow = style[horizontal ? 'overflowX' : 'overflowY'] || style.overflow || '';
      if (client > 0 && extent > client + 1 && /(auto|scroll|overlay)/.test(overflow)) return node;
    }
    const pageScroller = doc.scrollingElement;
    if (pageScroller) {
      const extent = axis === 'x' ? pageScroller.scrollWidth : pageScroller.scrollHeight;
      const client = axis === 'x' ? pageScroller.clientWidth : pageScroller.clientHeight;
      if (extent > client + 1) return pageScroller;
    }
    return null;
  }

  function locateMovimentiWarehouseGrid() {
    const docs = [];
    const visit = (view, path) => {
      let doc;
      try { doc = view.document; } catch (_) { return; }
      if (!doc || docs.some(entry => entry.doc === doc)) return;
      docs.push({ doc, path });
      let frameCount = 0;
      try { frameCount = view.frames.length; } catch (_) { return; }
      for (let index = 0; index < frameCount; index++) {
        try { visit(view.frames[index], `${path}/${index}`); } catch (_) {}
      }
    };
    visit(window, 'top');

    const candidates = [];
    for (const { doc, path } of docs) {
      for (const root of tableExportRoots(doc).filter(tableExportVisible)) {
        const headers = headersOf(root);
        const labels = Array.from(new Set(headers.flatMap(header => [
          header.getAttribute('title'), header.getAttribute('aria-label'), header.getAttribute('abbr'), textOf(header)
        ].map(normalizedGridLabel).filter(Boolean))));
        const hasArticle = labels.some(isArticleGridLabel);
        const hasQuantity = labels.some(label => label.includes('quantita') || label === 'qty');
        const hasUom = labels.some(label => label.includes('unita') || label.includes('unit') && label.includes('misura'));
        const hasSaldoHeader = labels.some(label => label.includes('entry') || label.includes('movimento') && label.includes('nr')
          || label.includes('variante') || label.includes('tipo documento whse'));
        const headerRow = findHeaderRow(root);
        const rows = headerRow ? tableExportReadRows(root, headerRow, headers) : [];
        const info = buildSaldoGridInfo(root);
        candidates.push({ root, path, labels, hasArticle, hasQuantity, hasUom, hasSaldoHeader, headerRow, hasRows: rows.length > 0, score: 5 - info.missingColumns.length });
      }
    }

    const matching = candidates.filter(candidate => (candidate.hasArticle || candidate.hasQuantity || candidate.hasUom || candidate.hasSaldoHeader) && candidate.hasRows);
    matching.sort((left, right) => right.score - left.score);
    const selected = matching[0] || null;
    const excludedCandidates = candidates.flatMap((candidate, index) => {
      if (candidate === selected) return [];
      const reason = !candidate.hasArticle ? 'article-header-missing'
        : !candidate.hasQuantity ? 'quantity-header-missing'
          : !candidate.headerRow ? 'header-row-missing'
            : !candidate.hasRows ? 'data-rows-missing' : 'other-candidate-selected';
      return [{ index, reason }];
    });
    bcDiagnostic('saldo-grid-search', {
      receivedFrame: isTopFrame ? 'top' : 'child',
      accessibleDocuments: docs.length,
      candidateGrids: candidates.length,
      selectedHeaders: selected ? selected.labels : [],
      selectedFrame: selected ? selected.path : null,
      excludedCandidates,
    });
    return selected ? selected.root : null;
  }

  function findHeaderRow(root) {
    const rows = Array.from(root.querySelectorAll('[role="row"], tr'));
    for (const r of rows) {
      if (r.querySelector('[role="columnheader"], th')) return r;
    }
    return null;
  }

  function buildSaldoGridInfo(root, headersOverride) {
    const hdrs = headersOverride || headersOf(root);
    const headersForExport = hdrs;

    const findColIndex = (pred) => {
      for (let i = 0; i < hdrs.length; i++) {
        const h = hdrs[i];
        const labels = [h.getAttribute('title'), h.getAttribute('aria-label'), h.getAttribute('abbr'), textOf(h)].map(normalizedGridLabel);
        if (labels.some(pred)) return i;
      }
      return -1;
    };

    const movimentoIdIndex = findColIndex(l => l.includes('entry') || (l.includes('movimento') && l.includes('nr')));
    const articoloIndex = findColIndex(isArticleGridLabel);
    const varianteIndex = findColIndex(l => l.includes('variante') && !l.includes('alternativa'));
    const uomIndex = findColIndex(l => (l.includes('unit') && l.includes('misura')) || l === 'unita');
    const qtyIndex = findColIndex(l => (l.includes('quantita') || l === 'qty') && !l.includes('alternativa'));
    const locationCodeIndex = findColIndex(l => l.includes('cod ubicazione') || l === 'ubicazione' || l === 'location' || l.includes('location code'));
    const binCodeIndex = findColIndex(l => l.includes('cod collocazione') || l === 'collocazione' || l === 'bin' || l.includes('bin code'));
    const sourceDocumentIndex = findColIndex(l => l === 'source document' || l === 'documento origine');
    const sourceNoIndex = findColIndex(l => l === 'source no' || l === 'nr origine');
    const missingColumns = [];
    if (articoloIndex < 0) missingColumns.push('Nr. articolo');
    if (uomIndex < 0) missingColumns.push('Cod. unità di misura');
    if (qtyIndex < 0) missingColumns.push('Quantità');

    // optional source
    // Preferiamo intestazioni accessibili e non dipendiamo da indici fissi.
    // Per “Movimenti warehouse” la sorgente vendita è tipicamente:
    // - “Tipo documento whse.”
    // - “Nr. documento whse.”
    // - “Nr. riga origine”
    const srcTypeIndex = findColIndex(l => l.includes('Tipo documento whse') || l.includes('tipo documento whse') || l.includes('tipo documento') || (l.includes('tipo') && l.includes('whse')));
    const srcDocNoIndex = findColIndex(l => (l.includes('documento') && l.includes('whse') && !l.includes('tipo')) || (l.includes('nr') && l.includes('documento')));
    const srcLineNoIndex = findColIndex(l => l.includes('Nr. riga origine') || l.includes('nr. riga origine') || l.includes('riga origine') || (l.includes('riga') && l.includes('origine')) || l.includes('line'));
    const originFieldsAvailable = srcTypeIndex >= 0 && srcDocNoIndex >= 0;

    return {
      headersForExport,
      missingColumns,
      idx: {
        movimentoIdIndex,
        articoloIndex,
        varianteIndex,
        uomIndex,
        qtyIndex,
        locationCodeIndex,
        binCodeIndex,
        sourceDocumentIndex,
        sourceNoIndex,
        sourceFieldsAvailable:sourceDocumentIndex >= 0 && sourceNoIndex >= 0,
        srcTypeIndex,
        srcDocNoIndex,
        srcLineNoIndex,
        originFieldsAvailable,
      }
    };
  }

  function extractSaldoMovementsFromRows(rows, gridInfo, seenMovementIds) {
    const out = [];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const r = rows[rowIndex];
      const values = r.values || r.cells || [];
      const readValue = index => {
        if (index < 0) return '';
        const value = values[index];
        return normalizeCellText(typeof value === 'string' || typeof value === 'number' ? value : textOf(value || null));
      };

      const rowIdentity = String(r.key || `row:${rowIndex}`);
      if (seenMovementIds.has(rowIdentity)) continue;
      const movementId = readValue(gridInfo.idx.movimentoIdIndex);

      const articolo = readValue(gridInfo.idx.articoloIndex);
      const variante = readValue(gridInfo.idx.varianteIndex);
      const uom = readValue(gridInfo.idx.uomIndex);
      const qtyRaw = readValue(gridInfo.idx.qtyIndex);

      if (!articolo) {
        const hasCapturedValues = values.some(value => normalizeCellText(
          typeof value === 'string' || typeof value === 'number' ? value : textOf(value || null)
        ));
        if (!hasCapturedValues) {
          seenMovementIds.add(rowIdentity);
          continue;
        }
        const ariaRowIndex = Number(String(rowIdentity).match(/^aria-rowindex:(\d+)/)?.[1]) || null;
        bcDiagnostic('warehouse-article-missing', {
          rowIndex:rowIndex + 1,
          ariaRowIndex,
          movementIdPresent:!!movementId,
          otherValuesPresent:true
        });
        throw new Error(`Campo obbligatorio mancante: numero articolo (riga ${ariaRowIndex || rowIndex + 1})`);
      }
      if (uom === '') throw new Error('Campo obbligatorio mancante: unità di misura');
      const quantita = parseSignedNumber(qtyRaw);
      if (!Number.isFinite(quantita)) {
        bcDiagnostic('warehouse-quantity-invalid', {
          rowIndex: rowIndex + 1,
          reason: qtyRaw === '' ? 'empty' : 'non-numeric',
        });
        seenMovementIds.add(rowIdentity);
        continue;
      }

      const srcType = gridInfo.idx.srcTypeIndex >= 0 ? readValue(gridInfo.idx.srcTypeIndex) : '';
      const srcDocNo = gridInfo.idx.srcDocNoIndex >= 0 ? readValue(gridInfo.idx.srcDocNoIndex) : '';
      const srcLineNo = gridInfo.idx.srcLineNoIndex >= 0 ? readValue(gridInfo.idx.srcLineNoIndex) : '';
      const src = srcType || srcDocNo || srcLineNo ? { type:srcType, docNo:srcDocNo, lineNo:srcLineNo } : null;
      const locationCode = gridInfo.idx.locationCodeIndex >= 0 ? readValue(gridInfo.idx.locationCodeIndex) : null;
      const binCode = gridInfo.idx.binCodeIndex >= 0 ? readValue(gridInfo.idx.binCodeIndex) : null;
      const readSourceValue = index => {
        if (index < 0) return null;
        const value = readValue(index);
        return normalizedGridLabel(value) === 'vuoto' ? '' : value;
      };
      const sourceDocument = readSourceValue(gridInfo.idx.sourceDocumentIndex);
      const sourceNo = readSourceValue(gridInfo.idx.sourceNoIndex);

      const m = { movementId, articolo, variante, uom, quantita, locationCode, binCode, src,
        sourceDocument, sourceNo, sourceFieldsAvailable:gridInfo.idx.sourceFieldsAvailable,
        originFieldsAvailable:gridInfo.idx.originFieldsAvailable };
      seenMovementIds.add(rowIdentity);
      out.push(m);
    }
    return out;
  }

  function normalizeCellText(s) {
    return String(s ?? '').replace(/\s+/g, ' ').trim();
  }

  function parseSignedNumber(raw) {
    const s = String(raw ?? '').replace(/[\u2212\uFE63\uFF0D]/g, '-').replace(/[\s\u00a0\u202f]/g, '');
    if (!s) return NaN;
    const hasComma = s.includes(',');
    const cleaned = hasComma ? s.replace(/\./g, '').replace(',', '.') : s;
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(cleaned)) return NaN;
    return Number(cleaned);
  }

  function saldoMovementsSignature(movements) {
    // stabilità per anti-loop: lunghezza + ultime 3 id
    const len = movements.length;
    const tail = movements.length ? movements.slice(-3).map(m => m.movementId).join('|') : '';
    return `${len}|${tail}`;
  }

  function buildSaldoGroups(movements) {
    const groups = new Map();
    for (const m of movements) {
      const key = `${m.articolo}||${m.variante}||${m.uom}`;
      let g = groups.get(key);
      if (!g) {
        g = { key, articolo: m.articolo, variante: m.variante, uom: m.uom, saldo: 0 };
        groups.set(key, g);
      }
      g.saldo += m.quantita;
    }
    return groups;
  }

  function renderSaldoSummary(summaryEl, groups) {
    const arr = Array.from(groups.values()).sort((a, b) => {
      const nz = x => (x.saldo === 0 ? 1 : 0);
      const d = nz(a) - nz(b);
      if (d !== 0) return d;
      return a.articolo.localeCompare(b.articolo, 'it');
    });

    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '6px';

    for (const g of arr) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-saldo-articolo-group', g.key);
      btn.style.textAlign = 'left';
      btn.style.background = 'transparent';
      btn.style.border = '1px solid rgba(0,0,0,.08)';
      btn.style.borderRadius = '8px';
      btn.style.padding = '8px 10px';
      btn.style.cursor = 'pointer';
      const variant = normalizeCellText(g.variante);
      const variantMarkup = variant && normalizedGridLabel(variant) !== 'vuoto'
        ? ` <span style="opacity:.75;font-weight:500;">(${escapeHtml(variant)})</span>` : '';
      btn.innerHTML = `
        <div style="font-weight:600;line-height:1.2;">${escapeHtml(g.articolo)}${variantMarkup}</div>
        <div style="font-size:12px;opacity:.8;margin-top:2px;">${escapeHtml(g.uom)}</div>
        <div style="font-weight:700;margin-top:6px;">Saldo: ${escapeHtml(formatSignedNumber(g.saldo))}</div>
      `;
      list.appendChild(btn);
    }

    summaryEl.appendChild(list);
  }

  function attachSaldoGroupHandlers(summaryEl, detailEl, movements, groups, gridRoot) {
    detachSaldoRowListeners();
    const buttons = Array.from(summaryEl.querySelectorAll('[data-saldo-articolo-group]'));

    const handler = (e) => {
      const btn = e.currentTarget;
      const key = btn.getAttribute('data-saldo-articolo-group');
      if (!key) return;

      // Solo highlight “saldo articolo”, MAI toccare lo stato baseline.
      clearSaldoHighlights();
      buttons.forEach(b => b.classList.remove(SALDO_ARTICOLO.selectedCls));
      btn.classList.add(SALDO_ARTICOLO.selectedCls);

      renderSaldoDetail(detailEl, movements, groups, key);

      // evidenzia righe nella griglia: best-effort basato su movementId
      // (senza dedurre/alterare filtri o ordinamento)
      if (gridRoot) {
        const hdrRow = findHeaderRow(gridRoot);
        const gridInfo = buildSaldoGridInfo(gridRoot);
        if (gridInfo && hdrRow) {          try {
            const allRows = tableExportReadRows(gridRoot, hdrRow, gridInfo.headersForExport);
            for (const r of allRows) {
              const values = r.values || r.cells || [];
              const movementCell = values[gridInfo.idx?.movimentoIdIndex];
              const mid = normalizeCellText(typeof movementCell === 'string' || typeof movementCell === 'number' ? movementCell : textOf(movementCell));
              if (!mid) continue;
              const match = movements.find(m => m.movementId === mid);
              if (!match) continue;
              // evidenzia righe del gruppo usando SOLO movementId (anti-duplica + no collisioni)
              // (key del gruppo è (articolo||variante||uom), ma la selezione host deve essere per movimento)
              if (match && match.movementId) {
                // marca la riga host se appartiene a quel gruppo
                const k = `${match.articolo}||${match.variante}||${match.uom}`;
                if (k === key && r.rowEl) r.rowEl.classList.add(SALDO_ARTICOLO.highlightCls);
              }
            }
          } catch (_) {}
        }
      }
    };

    buttons.forEach(b => b.addEventListener('click', handler));
    saldoRowCleanup = () => buttons.forEach(b => b.replaceWith(b.cloneNode(true)));
  }

  function saldoViewFingerprint(root){
    try {
      const view = root.ownerDocument.defaultView;
      if (!view) return String(Date.now());
      const href = (function(){ try { return view.top.location.href; } catch (_) { return view.location.href; } })();
      const u = new URL(href);
      // rimuove parametri che cambiano senza alterare la vista filtrata in modo utile
      const keys = ['company','page','pageid','filter','orderby','sort','view','sortBy','ascending','ascendingSort','direction','q','search'];
      const qp = {};
      for (const k of keys) {
        const v = u.searchParams.get(k);
        if (v !== null && v !== '') qp[k] = v;
      }
      return JSON.stringify({ path: u.pathname, qp, hash: u.hash });
    } catch (_) {
      return String(Date.now());
    }
  }

  function saldoDetailMetrics() {
    return { saldo:0, positive:0, negative:0 };
  }

  function addSaldoDetailQuantity(metrics, quantity) {
    metrics.saldo += quantity;
    if (quantity > 0) metrics.positive += quantity;
    if (quantity < 0) metrics.negative += Math.abs(quantity);
  }

  function addSaldoDetailMetrics(target, source) {
    target.saldo += source.saldo;
    target.positive += source.positive;
    target.negative += source.negative;
  }

  function saldoDetailMetricsMatch(left, right) {
    return ['saldo', 'positive', 'negative'].every(key => {
      const tolerance = 1e-8 * Math.max(1, Math.abs(left[key]), Math.abs(right[key]));
      return Math.abs(left[key] - right[key]) <= tolerance;
    });
  }

  function saldoMovementOrigin(movement) {
    const src = movement.src || {};
    const type = normalizeCellText(src.type);
    const docNo = normalizeCellText(src.docNo);
    const lineNo = normalizeCellText(src.lineNo);
    const sourceDocument = normalizeCellText(movement.sourceDocument);
    const normalizedType = normalizedGridLabel(`${type} ${sourceDocument}`);
    if (/transfer|trasfer|internal|interno|movimentazione interna/.test(normalizedType)) return { kind:'internal' };
    if (sourceDocument || normalizeCellText(movement.sourceNo)) return { kind:'document', lineNo };
    if (movement.sourceFieldsAvailable) return lineNo ? { kind:'unknown', lineNo } : { kind:'internal' };
    if (type || docNo) return { kind:'document', lineNo };
    return { kind:'unknown', lineNo };
  }

  function buildSaldoDetailGroups(movements, expectedArticleSaldo) {
    const article = saldoDetailMetrics();
    const locations = new Map();
    const internalTotal = saldoDetailMetrics();
    for (const movement of movements) {
      if (movement.locationCode === null || movement.binCode === null) return { ok:false, reason:'location-columns-unavailable' };
      const locationCode = normalizeCellText(movement.locationCode);
      const binCode = normalizeCellText(movement.binCode);
      const locationKey = JSON.stringify(locationCode);
      const binKey = JSON.stringify([locationCode, binCode]);
      let location = locations.get(locationKey);
      if (!location) {
        location = { code:locationCode, metrics:saldoDetailMetrics(), bins:new Map() };
        locations.set(locationKey, location);
      }
      let bin = location.bins.get(binKey);
      if (!bin) {
        bin = { code:binCode, metrics:saldoDetailMetrics(), documents:new Map(), internal:saldoDetailMetrics(), unknown:saldoDetailMetrics(), unknownLineNos:new Set() };
        location.bins.set(binKey, bin);
      }
      addSaldoDetailQuantity(article, movement.quantita);
      addSaldoDetailQuantity(location.metrics, movement.quantita);
      addSaldoDetailQuantity(bin.metrics, movement.quantita);
      const origin = saldoMovementOrigin(movement);
      if (origin.kind === 'internal') {
        addSaldoDetailQuantity(bin.internal, movement.quantita);
        addSaldoDetailQuantity(internalTotal, movement.quantita);
      } else if (origin.kind === 'unknown') {
        addSaldoDetailQuantity(bin.unknown, movement.quantita);
        if (origin.lineNo) bin.unknownLineNos.add(origin.lineNo);
      } else {
        const sourceDocument = normalizeCellText(movement.sourceDocument);
        const sourceNo = normalizeCellText(movement.sourceNo);
        const key = JSON.stringify([sourceDocument, sourceNo]);
        let documentGroup = bin.documents.get(key);
        if (!documentGroup) {
          documentGroup = {
            sourceDocument:sourceDocument || 'Source Document non disponibile',
            sourceNo:sourceNo || 'Source No. non disponibile',
            lineNos:new Set(), metrics:saldoDetailMetrics()
          };
          bin.documents.set(key, documentGroup);
        }
        if (origin.lineNo) documentGroup.lineNos.add(origin.lineNo);
        addSaldoDetailQuantity(documentGroup.metrics, movement.quantita);
      }
    }

    for (const location of locations.values()) {
      const binTotal = saldoDetailMetrics();
      for (const bin of location.bins.values()) {
        addSaldoDetailMetrics(binTotal, bin.metrics);
        const originTotal = saldoDetailMetrics();
        addSaldoDetailMetrics(originTotal, bin.internal);
        addSaldoDetailMetrics(originTotal, bin.unknown);
        for (const documentGroup of bin.documents.values()) addSaldoDetailMetrics(originTotal, documentGroup.metrics);
        if (!saldoDetailMetricsMatch(originTotal, bin.metrics)) return { ok:false, reason:'origin-bin-imbalance' };
      }
      if (!saldoDetailMetricsMatch(binTotal, location.metrics)) return { ok:false, reason:'bin-location-imbalance' };
    }
    const locationTotal = saldoDetailMetrics();
    for (const location of locations.values()) addSaldoDetailMetrics(locationTotal, location.metrics);
    if (!saldoDetailMetricsMatch(locationTotal, article)
      || Math.abs(article.saldo - expectedArticleSaldo) > 1e-8 * Math.max(1, Math.abs(article.saldo), Math.abs(expectedArticleSaldo))) {
      return { ok:false, reason:'location-article-imbalance' };
    }
    return { ok:true, article, locations, internalTotal };
  }

  function renderSaldoDetail(detailEl, movements, groups, groupKey) {
    detailEl.innerHTML = '';
    const group = groups.get(groupKey);
    if (!group) return;

    const filtered = movements.filter(movement => `${movement.articolo}||${movement.variante}||${movement.uom}` === groupKey);
    const breakdown = buildSaldoDetailGroups(filtered, group.saldo);
    if (!breakdown.ok) {
      const columnsUnavailable = breakdown.reason === 'location-columns-unavailable';
      try {
        bcDiagnostic(columnsUnavailable ? 'saldo-detail-unavailable' : 'saldo-detail-imbalance', { reason:breakdown.reason });
      } catch (_) {}
      detailEl.textContent = columnsUnavailable
        ? 'Dettaglio non disponibile: colonne ubicazione o collocazione non acquisite.'
        : 'Dettaglio non disponibile: le quantità non quadrano.';
      return;
    }

    const title = document.createElement('div');
    title.style.fontWeight = '700';
    title.style.marginBottom = '8px';
    const variant = normalizeCellText(group.variante);
    const articleCaption = variant && normalizedGridLabel(variant) !== 'vuoto' ? `${group.articolo} (${variant})` : group.articolo;
    title.textContent = `Dettaglio: ${articleCaption} - ${group.uom}`;
    detailEl.appendChild(title);

    const metricsMarkup = metrics => {
      const zero = Math.abs(metrics.saldo) <= 1e-8;
      const colorState = zero ? 'zero' : metrics.saldo > 0 ? 'positive' : 'negative';
      return `Saldo: <span class="bc-tools-saldo-balance-${colorState}">${escapeHtml(formatSignedNumber(metrics.saldo))}</span> · <span class="bc-tools-saldo-balance-positive">+${escapeHtml(formatSignedNumber(metrics.positive))}</span> / <span class="bc-tools-saldo-balance-negative">-${escapeHtml(formatSignedNumber(metrics.negative))}</span>`;
    };
    const total = document.createElement('div');
    total.style.fontWeight = '600';
    total.style.marginBottom = '8px';
    total.innerHTML = metricsMarkup(breakdown.article);
    detailEl.appendChild(total);

    const internalSummary = document.createElement('div');
    internalSummary.style.fontSize = '12px';
    internalSummary.style.opacity = '.8';
    internalSummary.style.marginBottom = '8px';
    internalSummary.innerHTML = `Movimentazione interna complessiva (informativa, non disponibilità): ${metricsMarkup(breakdown.internalTotal)}`;
    detailEl.appendChild(internalSummary);

    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '6px';
    let detailCount = 0;
    const appendMetrics = (parent, label, metrics, lines = []) => {
      if (detailCount >= SALDO_ARTICOLO.maxDetailRows) return;
      const item = document.createElement('div');
      item.style.padding = '4px 0';
      item.innerHTML = `<div style="font-weight:600;">${escapeHtml(label)}</div><div style="font-size:12px;opacity:.8;">${metricsMarkup(metrics)}</div>`;
      parent.appendChild(item);
      detailCount++;
    };
    for (const location of breakdown.locations.values()) {
      const locationSection = document.createElement('section');
      locationSection.style.border = '1px solid rgba(0,0,0,.08)';
      locationSection.style.borderRadius = '8px';
      locationSection.style.padding = '8px 10px';
      const locationTitle = document.createElement('div');
      locationTitle.innerHTML = `<div style="font-weight:700;">Ubicazione: ${escapeHtml(location.code || 'Ubicazione non disponibile')}</div><div style="font-size:12px;opacity:.8;">${metricsMarkup(location.metrics)}</div>`;
      locationSection.appendChild(locationTitle);
      for (const bin of location.bins.values()) {
        const binSection = document.createElement('div');
        binSection.style.marginTop = '8px';
        binSection.style.paddingLeft = '10px';
        const binTitle = document.createElement('div');
        binTitle.innerHTML = `<div style="font-weight:600;">Collocazione: ${escapeHtml(bin.code || 'Collocazione non disponibile')}</div><div style="font-size:12px;opacity:.8;">${metricsMarkup(bin.metrics)}</div>`;
        binSection.appendChild(binTitle);
        if (bin.internal.positive || bin.internal.negative) appendMetrics(binSection, 'Movimentazione interna', bin.internal);
        for (const documentGroup of bin.documents.values()) {
          const lines = [...documentGroup.lineNos].sort((left, right) => left.localeCompare(right, 'it'));
          appendMetrics(binSection, `${documentGroup.sourceDocument} · ${documentGroup.sourceNo}`, documentGroup.metrics, lines);
        }
        if (bin.unknown.positive || bin.unknown.negative || bin.unknownLineNos.size) {
          const lines = [...bin.unknownLineNos].sort((left, right) => left.localeCompare(right, 'it'));
          appendMetrics(binSection, 'Origine non disponibile', bin.unknown, lines);
        }
        binSection.style.borderTop = '1px solid rgba(0,0,0,.06)';
        binSection.style.marginTop = '6px';
        binSection.style.paddingTop = '6px';
        locationSection.appendChild(binSection);
      }
      list.appendChild(locationSection);
    }
    detailEl.appendChild(list);
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatSignedNumber(n) {
    if (!Number.isFinite(n)) return String(n);
    return n.toLocaleString('it-IT', { maximumFractionDigits: 6 });
  }

  function snapshotLayoutKeys() {
    try { return Object.keys(localStorage).filter(isLayoutKey); } catch (_) { return []; }
  }

  // Ritorna la stringa corretta solo se almeno un campo forzato differisce dal
  // target, altrimenti null: così non si scrive mai su localStorage per nulla.
  function fixed(raw) {
    return window.bcToolsFixLayoutState(raw, {
      layoutEnabled, layoutMode:layoutTarget ? 'wide' : 'normal',
      factboxEnabled, factboxMode:factboxTarget ? 'open' : 'closed'
    });
  }

  let layoutClickAttempts = new WeakMap();
  function enforceLayoutControls() {
    const state = {
      layoutEnabled, layoutMode:layoutTarget ? 'wide' : 'normal',
      factboxEnabled, factboxMode:factboxTarget ? 'open' : 'closed'
    };
    const handled = new Set();
    for (const control of document.querySelectorAll('button,[role="button"],a[aria-label],a[title]')) {
      if (!visible(control) || control.disabled || control.getAttribute('aria-disabled') === 'true') continue;
      const action = window.bcToolsFixLayoutState.layoutToggleAction(control, state);
      if (!action || handled.has(action.kind)) continue;
      handled.add(action.kind);
      if (!action.click) { layoutClickAttempts.delete(control); continue; }
      const signature = `${layoutTarget}:${factboxTarget}:${control.getAttribute('aria-label')}:${control.getAttribute('title')}:${control.getAttribute('aria-expanded')}:${control.getAttribute('aria-pressed')}:${control.getAttribute('aria-checked')}`;
      const previous = layoutClickAttempts.get(control);
      const attempts = previous?.signature === signature ? previous.count : 0;
      if (attempts >= 2 || (previous && Date.now() - previous.time < 1500)) continue;
      layoutClickAttempts.set(control, { signature, count:attempts + 1, time:Date.now() });
      control.click();
      bcDiagnostic('layout-control-applied', { kind:action.kind, target:action.kind === 'layout' ? layoutTarget : factboxTarget });
    }
  }

  function enforceShowMore() {
    const pageKey = window.bcToolsFixLayoutState.showMorePageKey(topHref());
    if (showMoreState.opened && showMoreState.pageKey === pageKey) return;
    for (const control of document.querySelectorAll('button,[role="button"],a[aria-label],a[title]')) {
      if (!visible(control) || control.disabled || control.getAttribute('aria-disabled') === 'true') continue;
      if (!window.bcToolsFixLayoutState.claimShowMoreAutoOpen(control, showMoreState, pageKey)) continue;
      control.click();
      bcDiagnostic('show-more-opened', { frame:isTopFrame ? 'top' : 'child' });
    }
  }

  // ── enforce core ─────────────────────────────────────────────────────────────
  function enforceNow() {
    if (!layoutEnabled && !factboxEnabled && !showMoreEnabled) return;
    if (layoutEnabled || factboxEnabled) enforceLayoutControls();
    if (showMoreEnabled) enforceShowMore();
    if (!isEnforcerFrame) return;
    try {
      for (const k of snapshotLayoutKeys()) {
        const next = fixed(localStorage.getItem(k));
        if (next !== null) localStorage.setItem(k, next);
      }
    } catch (_) { /* noop */ }
  }

  // ── listeners aggiuntivi per reattività immediata ────────────────────────────
  function onFocus()  { if (enforceTimer) enforceNow(); }
  function onVis()    { if (document.visibilityState === 'visible' && enforceTimer) enforceNow(); }

  // ── avvio / stop interval ────────────────────────────────────────────────────
  function startEnforce() {
    enforceNow();                       // applica subito
    if (enforceTimer) return;
    enforceTimer = setInterval(enforceNow, 500);
    window.addEventListener('focus', onFocus, true);
    document.addEventListener('visibilitychange', onVis, true);
  }

  function stopEnforce() {
    if (enforceTimer) { clearInterval(enforceTimer); enforceTimer = null; }
    window.removeEventListener('focus', onFocus, true);
    document.removeEventListener('visibilitychange', onVis, true);
  }

  // ── hook Storage.prototype per intercettare scritture BC in tempo reale ───────
  // L'hook va installato in OGNI frame: la scrittura parte dal frame che la
  // esegue, e va corretta lì. È l'intervallo (frame enforcer) a fare da rete di
  // sicurezza. Il patching è inerte finché nessuna forzatura è attiva.
  (function installStorageHook() {
    const origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function bcToolsSetItem(key, value) {
      // Chiamata originale prima, poi correggiamo se necessario
      origSet.call(this, key, value);
      if (!isLayoutKey(key)) return;
      if (!layoutEnabled && !factboxEnabled) return;
      try {
        const next = fixed(String(value));
        if (next !== null) origSet.call(this, key, next);
      } catch (_) { /* noop */ }
    };
  })();
  // ── applySettings ─────────────────────────────────────────────────────────────
  function applySettings(s) {
    const pageCopyMode = pageFieldCopyMode(s);
    bcDiagnostic('settings-applied', {
      hideNotificationsButton:!!s.hideNotificationsButton,
      showValuesInMonospace:!!s.showValuesInMonospace,
      showHyphensInColumnCaptions:!!s.showHyphensInColumnCaptions,
      highlightStatusRows:!!s.highlightStatusRows,
      autoOpenHomeSearch:!!s.autoOpenHomeSearch,
        autoShowMore:!!s.autoShowMore,
      pageFieldCopyMode:pageCopyMode,
      showCreatedDocumentButton:!!s.showCreatedDocumentButton,
      autoWide:!!s.autoWide,
      layoutMode:s.layoutMode === 'normal' ? 'normal' : 'wide',
      forceFactbox:!!s.forceFactbox,
      factboxMode:s.factboxMode === 'open' ? 'open' : 'closed'
    });
    applyNotificationButtonVisibility(s.hideNotificationsButton);
    // Le classi delle altre migliorie stanno sul body di questo frame.
    if (document.body) {
      document.body.classList.toggle(CLS.MONO_VALUES,     !!s.showValuesInMonospace);
      document.body.classList.toggle(CLS.HYPHEN_CAPTIONS, !!s.showHyphensInColumnCaptions);
      document.body.classList.toggle('bc-tools-highlight-status-rows', !!s.highlightStatusRows);
      document.body.classList.toggle(CLS.PAGE_FIELD_COPY, pageFieldCopyEnabled(s));
    }
    if (s.highlightStatusRows) scheduleStatusRowHighlighting();
    else clearStatusRowHighlights();
    if (!pageFieldCopyEnabled(s)) {
      dismissCopyActionsPanel();
      document.querySelectorAll('.bc-tools-copy-page-field').forEach(button => button.remove());
      document.querySelectorAll('.bc-tools-copy-page-field-host').forEach(field => field.classList.remove('bc-tools-copy-page-field-host'));
    }
    syncCopyObserver(pageFieldCopyEnabled(s));
    if (pageFieldCopyEnabled(s)) {
      scheduleCopyEnhancement();
    }
    if (!s.showCreatedDocumentButton) {
      document.querySelectorAll('.' + CREATED_WHSE_BUTTON_CLASS).forEach(button => button.remove());
      document.querySelectorAll(`[data-${CREATED_WHSE_DIALOG_MARK.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}="1"]`)
        .forEach(dialog => delete dialog.dataset[CREATED_WHSE_DIALOG_MARK]);
    } else {
      scheduleCreatedWarehouseDialogEnhancement();
    }
    const nextLayoutEnabled  = !!s.autoWide;
    const nextLayoutTarget   = s.layoutMode !== 'normal';
    const nextFactboxEnabled = !!s.forceFactbox;
    const nextFactboxTarget  = s.factboxMode === 'open';
    const nextShowMoreEnabled = !!s.autoShowMore;

    const unchanged =
      nextLayoutEnabled  === layoutEnabled  &&
      nextLayoutTarget   === layoutTarget   &&
      nextFactboxEnabled === factboxEnabled &&
      nextFactboxTarget  === factboxTarget &&
      nextShowMoreEnabled === showMoreEnabled;

    if (unchanged) return;

    layoutClickAttempts = new WeakMap();
    layoutEnabled  = nextLayoutEnabled;
    layoutTarget   = nextLayoutTarget;
    factboxEnabled = nextFactboxEnabled;
    factboxTarget  = nextFactboxTarget;
    showMoreEnabled = nextShowMoreEnabled;

    if (!layoutEnabled && !factboxEnabled && !showMoreEnabled) { stopEnforce(); return; }
    startEnforce();
  }

  // ── apertura ricerca nella pagina principale ────────────────────────────────
  const HOME_SEARCH_SESSION_KEY = 'bcToolsHomeSearchOpened';
  let lastHomeUrl = '';
  function topHref() {
    try { return window.top.location.href; } catch (_) { return location.href; }
  }
  function sharedSessionStorage() {
    try { return window.top.sessionStorage; } catch (_) { return sessionStorage; }
  }
  function isBusinessCentralHome() {
    try {
      const params = new URL(topHref()).searchParams;
      return !['page','Page','pageId','pageid','table','Table'].some(key => params.has(key));
    } catch (_) { return false; }
  }
  function homeSearchAlreadyOpened(href) {
    try { return sharedSessionStorage().getItem(HOME_SEARCH_SESSION_KEY) === href; }
    catch (_) { return lastHomeUrl === href; }
  }
  function markHomeSearchOpened(href) {
    lastHomeUrl = href;
    try { sharedSessionStorage().setItem(HOME_SEARCH_SESSION_KEY, href); } catch (_) {}
  }
  function clearHomeSearchMarker() {
    lastHomeUrl = '';
    try { sharedSessionStorage().removeItem(HOME_SEARCH_SESSION_KEY); } catch (_) {}
  }
  function searchControl() {
    const candidates = Array.from(document.querySelectorAll(
      '[aria-keyshortcuts], button[aria-label], button[title], a[aria-label], a[title], [role="button"][aria-label], [role="button"][title]'
    ));
    for (const raw of candidates) {
      const el = raw.closest('button, a, [role="button"]') || raw;
      if (!visible(el)) continue;
      const label = `${raw.getAttribute('aria-label') || ''} ${raw.getAttribute('title') || ''} ${raw.getAttribute('aria-keyshortcuts') || ''}`
        .replace(/\s+/g, ' ').trim().toLocaleLowerCase('it');
      if (label.includes('alt+q') || label.includes('alt + q') || label.includes('dimmi cosa vuoi fare')
          || label.includes('tell me') || label === 'cerca' || label === 'search'
          || label.startsWith('cerca ') || label.startsWith('search ')) return el;
    }
    return null;
  }
  function openedSearchInput() {
    const inputs = Array.from(document.querySelectorAll(
      'input[type="search"], input[role="searchbox"], [role="search"] input, input[aria-label], input[placeholder]'
    ));
    return inputs.find(el => {
      if (!visible(el)) return false;
      const label = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('placeholder') || ''}`
        .replace(/\s+/g, ' ').trim().toLocaleLowerCase('it');
      return el.type === 'search' || el.getAttribute('role') === 'searchbox'
        || label.includes('dimmi cosa vuoi fare') || label.includes('tell me')
        || label.startsWith('cerca') || label.startsWith('search');
    }) || null;
  }
  function focusOpenedSearch() {
    const target = openedSearchInput();
    if (!target) return false;
    try { target.focus({preventScroll:true}); } catch (_) { try { target.focus(); } catch (_) {} }
    return document.activeElement === target;
  }
  function waitForOpenedSearch(href) {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (focusOpenedSearch()) {
        markHomeSearchOpened(href);
        clearInterval(timer);
      } else if (attempts >= 150) {
        clearInterval(timer);
      }
    }, 100);
  }
  function tryOpenHomeSearch() {
    if (!settings.autoOpenHomeSearch) return;
    if (!isBusinessCentralHome()) { clearHomeSearchMarker(); return; }
    const href = topHref();
    if (homeSearchAlreadyOpened(href)) return;
    if (focusOpenedSearch()) { markHomeSearchOpened(href); return; }
    const button = searchControl();
    if (!button) return;
    // Il requisito è un solo tentativo per ogni ingresso nella home. Il marcatore
    // va scritto PRIMA del click: il pulsante Tell Me è un toggle e ripeterne il
    // click mentre il campo non viene riconosciuto produce apertura/chiusura.
    markHomeSearchOpened(href);
    button.click();
    waitForOpenedSearch(href);
  }
  setInterval(tryOpenHomeSearch, 500);
  // ── toggle Wide/Normal da comando tastiera (background.js) ───────────────────
  function toggleWideNow() {
    try {
      for (const key of snapshotLayoutKeys()) {
        const raw = localStorage.getItem(key);
        if (typeof raw !== 'string' || !raw.trim().startsWith('{')) continue;
        const obj = JSON.parse(raw);
        if (!obj || typeof obj !== 'object'
            || !Object.prototype.hasOwnProperty.call(obj, 'PageLayoutExpanded')) continue;
        obj.PageLayoutExpanded = !obj.PageLayoutExpanded;
        localStorage.setItem(key, JSON.stringify(obj));
      }
    } catch (_) { /* chiave non valida o storage non disponibile */ }
  }
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'bcTools_toggleWideOff') toggleWideNow();
    });
  } catch (_) {}
  // ── ZPL scan pagina 5107911 ────────────────────────────────────────────────
  const ZPL_PAGE_ID = '5107911';
  const normLabel = value => String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('it');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function currentPageId(){
    try {
      const params = new URL(location.href).searchParams;
      const raw = params.get('page') || params.get('Page') || params.get('pageId') || params.get('pageid') || '';
      const match = String(raw).match(/\d+/);
      return match ? match[0] : '';
    } catch (_) { return ''; }
  }
  // ── Apertura automatica della ricerca con un solo risultato ────────────────
  const SINGLE_RESULT_HASH='#bc-tools-open-single';
  const SINGLE_RESULT_KEY='bcToolsOpenSingleResult';
  const SINGLE_RESULT_AUTOSORT_KEY='bcToolsAutoSortBridge';
  const SINGLE_RESULT_JOB_TIMEOUT_MS=180000;
  const SINGLE_RESULT_PROCESS_TIMEOUT_MS=120000;
  function singleResultSearchScope(href){
    try{
      const url=new URL(href);
      const value=(...keys)=>keys.map(key=>url.searchParams.get(key)).find(item=>item!==null)||'';
      const pathname=url.pathname.replace(/\/+$/,'')||'/';
      return {route:`${url.origin}${pathname}`,company:value('company','Company'),page:value('page','Page','pageId','pageid'),filter:value('filter','Filter')};
    }catch(_){return null;}
  }
  function singleResultSearchIdentity(href){const scope=singleResultSearchScope(href);return scope?`${scope.route}|${scope.company}|${scope.page}|${scope.filter}`:'';}
  function singleResultAutoSortBridge(job,href,store){
    if(!job||!Number.isFinite(job.createdAt)||!store)return null;
    const current=singleResultSearchScope(href);
    if(!current)return null;
    try{
      const marker=JSON.parse(store.getItem(SINGLE_RESULT_AUTOSORT_KEY)||'null');
      if(!marker||!Number.isFinite(marker.startedAt)||!Number.isFinite(marker.expiresAt)
        ||marker.startedAt<job.createdAt||marker.expiresAt<Date.now())return null;
      if(marker.route!==current.route||marker.company!==current.company||marker.page!==current.page)return null;
      return {current,marker};
    }catch(_){return null;}
  }
  function singleResultSearchMismatch(job,href){
    const current=singleResultSearchScope(href),initial=job&&job.scope;
    if(!current||!initial)return job&&job.identity===singleResultSearchIdentity(href)?'':'identity-changed';
    if(current.route!==initial.route)return 'route-changed';
    if(current.company!==initial.company)return 'company-changed';
    if(current.page!==initial.page)return 'page-changed';
    if(current.filter&&current.filter!==initial.filter)return 'filter-changed';
    return '';
  }
  function createSingleResultJob(href){return {state:'pending',identity:singleResultSearchIdentity(href),scope:singleResultSearchScope(href),createdAt:Date.now()};}
  function singleResultEvent(event,details={}){
    bcDiagnostic(event,Object.assign({pageId:currentPageId(),frame:isTopFrame?'top':'child'},details));
  }
  if(isTopFrame&&location.hash===SINGLE_RESULT_HASH){
    try{
      const job=createSingleResultJob(location.href);
      sharedSessionStorage().setItem(SINGLE_RESULT_KEY,JSON.stringify(job));
      singleResultEvent('job-created',{urlNormalized:true});
    }catch(_){}
  }
  function pendingSingleResult(){
    try{
      const store=sharedSessionStorage();
      const topHref=window.top.location.href;
      const topMarked=new URL(topHref).hash===SINGLE_RESULT_HASH;
      let job=JSON.parse(store.getItem(SINGLE_RESULT_KEY)||'null');
      if((!job||job.state!=='pending')&&topMarked&&isTopFrame){
        job=createSingleResultJob(topHref);
        store.setItem(SINGLE_RESULT_KEY,JSON.stringify(job));singleResultEvent('job-created',{urlNormalized:true});
      }
      if(!job||job.state!=='pending'||!Number.isFinite(job.createdAt))return null;
      let mismatch=singleResultSearchMismatch(job,topHref);
      if(mismatch==='filter-changed'){
        const bridge=singleResultAutoSortBridge(job,topHref,store);
        if(bridge){
          job.scope={...job.scope,filter:bridge.current.filter};
          job.identity=`${job.scope.route}|${job.scope.company}|${job.scope.page}|${job.scope.filter}`;
          store.setItem(SINGLE_RESULT_KEY,JSON.stringify(job));
          singleResultEvent('filter-reconciled-after-autosort',{
            pageId:bridge.current.page,
            sortRevision:bridge.marker.revision||1,
            urlNormalized:true
          });
          mismatch=singleResultSearchMismatch(job,topHref);
        }
      }
      if(mismatch){
        if(isTopFrame){store.removeItem(SINGLE_RESULT_KEY);singleResultEvent('job-lost',{reason:mismatch,urlNormalized:true});}
        return null;
      }
      if(Date.now()-job.createdAt>SINGLE_RESULT_JOB_TIMEOUT_MS){
        if(isTopFrame){store.removeItem(SINGLE_RESULT_KEY);singleResultEvent('timeout',{urlNormalized:true});}
        return null;
      }
      return job;
    }catch(_){return null;}
  }
  function singleVisible(el){return !!(el&&visible(el)&&!el.closest('[hidden],[aria-hidden="true"]'));}
  function cellValue(cell){
    const text=String(cell&&cell.innerText||cell&&cell.textContent||'').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\s+/g,' ').trim();
    const values=cell?Array.from(cell.querySelectorAll('input,textarea,select')).filter(singleVisible).map(el=>String(el.value||'').trim()).filter(Boolean):[];
    return [text,...values].filter(Boolean).join(' ');
  }
  function nonDataRow(row){
    const token=`${row.getAttribute('role')||''} ${row.className||''} ${row.getAttribute('aria-label')||''}`.toLowerCase();
    return /\b(columnheader|rowgroup|separator|total|subtotal|group|placeholder|skeleton|loading)\b/.test(token);
  }
  function singleRows(root){
    const rows=Array.from(root.querySelectorAll('[role="row"],tr')).filter(singleVisible)
      .filter(row=>!row.querySelector('[role="columnheader"],th')&&!nonDataRow(row));
    return rows.filter(row=>!rows.some(other=>other!==row&&row.contains(other)))
      .filter(row=>cellsOf(row).filter(singleVisible).map(cellValue).some(Boolean));
  }
  function ancillaryGrid(root){
    return !!root.closest('[class*="factbox" i],[class*="fact-box" i],[aria-label*="factbox" i],[role="complementary"]');
  }
  function resultGrids(){
    const items=Array.from(document.querySelectorAll('[role="grid"],[role="treegrid"],table')).filter(singleVisible)
      .filter(root=>!ancillaryGrid(root))
      .map(root=>({root,headers:headersOf(root),rows:singleRows(root)}))
      .filter(item=>item.headers.length||item.rows.length);
    return items.filter(item=>!items.some(other=>other!==item&&item.root.contains(other.root)));
  }
  function scopedArea(grid){return grid.root.closest('[role="main"],[role="dialog"],main,.content,.page')||grid.root.parentElement||grid.root;}
  function scopedBusy(grid){
    const area=scopedArea(grid);
    return Array.from(area.querySelectorAll('[aria-busy="true"],[role="progressbar"],.ms-Spinner,[class*="skeleton" i]')).some(singleVisible);
  }
  function scopedTerminal(grid){
    const area=scopedArea(grid);
    return Array.from(area.querySelectorAll('[role="alert"],[role="status"],[aria-live]')).filter(singleVisible)
      .some(node=>/\b(nessun risultato|nessun record|no results|no records|errore|error)\b/i.test(String(node.textContent||'')));
  }
  function secondaryAction(el){
    if(!el||el.closest('thead,[role="columnheader"]'))return true;
    if(el.matches('input[type="checkbox"]')||el.closest('[class*="bc-tools-"]'))return true;
    if(el.closest('[role="menu"],[role="menuitem"],[aria-haspopup="menu"],[class*="ellipsis" i],[class*="more-options" i]'))return true;
    const label=`${el.getAttribute('aria-label')||''} ${el.getAttribute('title')||''}`.toLowerCase();
    return /\b(menu|more options|altre opzioni|ellipsis|ellissi|copy|copia|delete|elimina|edit|modifica|info|informazion)\b/.test(label);
  }
  function actionFor(row){
    const target=document.activeElement;
    if(!target||!target.isConnected||!singleVisible(target)
      ||(target!==row&&!row.contains(target)))return null;
    return {target,strategy:'focused-enter',count:0};
  }
  function singleResultFocusMetadata(target){
    const tag=String(target&&target.tagName||'').toLowerCase();
    const role=String(target&&target.getAttribute&&target.getAttribute('role')||'').toLowerCase();
    const inputType=target&&target.matches&&target.matches('input')?String(target.type||'').toLowerCase():'';
    return {
      focusTag:/^[a-z][a-z0-9-]{0,19}$/.test(tag)?tag:'',
      focusRole:/^[a-z][a-z-]{0,39}$/.test(role)?role:'',
      focusInputType:/^[a-z][a-z0-9-]{0,19}$/.test(inputType)?inputType:''
    };
  }
  function inspectSingle(){
    const grids=resultGrids();
    if(!grids.length)return {status:'no-row',gridCount:0,rowCount:0};
    const rows=grids.flatMap(grid=>grid.rows.map(row=>({grid,row})));
    if(rows.length===0)return {status:'no-row',gridCount:grids.length,rowCount:0};
    if(rows.length>1)return {status:'multiple-rows',gridCount:grids.length,rowCount:rows.length};
    const {grid,row}=rows[0];
    if(scopedBusy(grid))return {status:'busy',gridCount:grids.length,rowCount:1};
    if(scopedTerminal(grid))return {status:'no-row',gridCount:grids.length,rowCount:0};
    const action=actionFor(row);
    if(!action)return {status:'single-row-action-pending',gridCount:grids.length,rowCount:1,actionCount:0};
    const rowSignature=cellsOf(row).filter(singleVisible).map(cellValue).filter(Boolean).join('\u001f');
    const gridSignature=grid.headers.map(header=>textOf(header).replace(/\s+/g,' ').trim()).join('\u001f');
    return {status:'ready',gridCount:grids.length,rowCount:1,row,action,signature:`${gridSignature}\u001e${rowSignature}`};
  }
  function activateSingle(row,target,onAttempt){
    if(!row.isConnected||!target||!target.isConnected||!singleVisible(target)
      ||(target!==row&&!row.contains(target))||document.activeElement!==target)return false;
    if(onAttempt)onAttempt();
    for(const type of ['keydown','keypress','keyup']){
      target.dispatchEvent(new KeyboardEvent(type,{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true,composed:true}));
    }
    return true;
  }
  function normalizedSingleNavigationHref(){
    let href='';
    try{href=window.top.location.href;}
    catch(_){href=location.href;}
    try{
      const url=new URL(href);
      url.hash='';
      return url.href;
    }catch(_){
      return href;
    }
  }
  function singleNavigationSnapshot(){
    return {href:normalizedSingleNavigationHref(),pageId:currentPageId()};
  }
  function claimSingleResultJob(job){
    try{
      const store=sharedSessionStorage();
      const current=JSON.parse(store.getItem(SINGLE_RESULT_KEY)||'null');
      if(!current||current.state!=='pending'||current.createdAt!==job.createdAt||current.identity!==job.identity)return false;
      store.setItem(SINGLE_RESULT_KEY,JSON.stringify({...current,state:'activating'}));
      return true;
    }catch(_){return false;}
  }
  function releaseUnactivatedSingleResultJob(job){
    try{
      const store=sharedSessionStorage();
      const current=JSON.parse(store.getItem(SINGLE_RESULT_KEY)||'null');
      if(current&&current.state==='activating'&&current.createdAt===job.createdAt&&current.identity===job.identity){
        store.setItem(SINGLE_RESULT_KEY,JSON.stringify({...current,state:'pending'}));
      }
    }catch(_){}
  }
  function clearSingleResultJob(job){
    try{
      const store=sharedSessionStorage();
      const current=JSON.parse(store.getItem(SINGLE_RESULT_KEY)||'null');
      if(current&&current.createdAt===job.createdAt&&current.identity===job.identity)store.removeItem(SINGLE_RESULT_KEY);
    }catch(_){}
  }
  async function activateAndConfirmSingle(job,current){
    if(!claimSingleResultJob(job))return 'claimed';
    const target=current.action.target;
    const before=singleNavigationSnapshot();
    const focusDetails={gridCount:1,rowCount:1,actionCount:current.action.count,strategy:current.action.strategy,...singleResultFocusMetadata(target)};
    if(!activateSingle(current.row,target,()=>{
      singleResultEvent('activation-attempted',{...focusDetails,eventTrusted:false,urlNormalized:true});
      singleResultEvent('enter-sent-to-result-target',{...focusDetails,eventTrusted:false,urlNormalized:true});
    })){
      releaseUnactivatedSingleResultJob(job);
      singleResultEvent('single-row-action-pending',focusDetails);
      return 'target-lost';
    }
    const started=Date.now();
    while(Date.now()-started<2500){
      await sleep(100);const href=normalizedSingleNavigationHref();
      const navigated=href!==before.href||currentPageId()!==before.pageId;
      if(navigated){
        clearSingleResultJob(job);
        singleResultEvent('activation-confirmed',{...focusDetails,eventTrusted:false,urlNormalized:true});
        singleResultEvent('opened',{...focusDetails,eventTrusted:false,urlNormalized:true});return 'opened';
      }
    }
    clearSingleResultJob(job);
    singleResultEvent('activation-no-navigation',{...focusDetails,eventTrusted:false,reason:'no-navigation-after-synthetic-enter',urlNormalized:true});return 'no-navigation';
  }
  async function processSingleResult(){
    const initial=pendingSingleResult();if(!initial)return;
    let previous='',previousTarget=null,stable=0,lastStatus='',sawUniqueRow=false;const started=Date.now();
    while(Date.now()-started<SINGLE_RESULT_PROCESS_TIMEOUT_MS){
      const job=pendingSingleResult();if(!job)return;
      const current=inspectSingle();
      if(current.rowCount===1)sawUniqueRow=true;
      if(current.status!==lastStatus){
        const details={gridCount:current.gridCount,rowCount:current.rowCount,actionCount:current.action?current.action.count:current.actionCount||0,strategy:current.action?current.action.strategy:undefined,urlNormalized:true};
        if(current.rowCount===1)Object.assign(details,singleResultFocusMetadata(current.action&&current.action.target||document.activeElement));
        singleResultEvent(current.status==='ready'?'single-row-action-ready':current.status,details);lastStatus=current.status;
      }
      if(current.status==='ready'){
        if(previous&&previous!==current.signature)singleResultEvent('signature-changed',{gridCount:1,rowCount:1,actionCount:current.action.count,strategy:current.action.strategy,urlNormalized:true});
        stable=current.signature===previous&&current.action.target===previousTarget?stable+1:1;previous=current.signature;previousTarget=current.action.target;
        if(stable>=3&&current.row.isConnected&&current.action.target.isConnected){
          const result=await activateAndConfirmSingle(job,current);
          if(result==='target-lost'){stable=0;previous='';previousTarget=null;lastStatus='';continue;}
          return;
        }
      }else{stable=0;previous='';previousTarget=null;}
      await sleep(300);
    }
    if(isTopFrame)try{sharedSessionStorage().removeItem(SINGLE_RESULT_KEY);}catch(_){}
    if(sawUniqueRow&&lastStatus==='single-row-action-pending')singleResultEvent('single-row-action-timeout',{gridCount:1,rowCount:1,actionCount:0,reason:'no-unique-primary-action-in-row',urlNormalized:true});
    else if(isTopFrame)singleResultEvent('timeout',{urlNormalized:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',processSingleResult,{once:true});
  else processSingleResult();
  function visible(el){
    if (!el || !el.isConnected) return false;
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
  }
  function textOf(el){
    if (!el) return '';
    const control = el.matches && el.matches('input,textarea') ? el : el.querySelector && el.querySelector('input,textarea');
    const raw = control && 'value' in control ? control.value : (el.innerText || el.textContent || el.getAttribute('title') || '');
    return String(raw || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\u00A0/g, ' ').trim();
  }
  function cellsOf(row){
    const semantic = Array.from(row.querySelectorAll(':scope > [role="gridcell"], :scope > [role="cell"], :scope > td'));
    if (semantic.length) return semantic.filter(visible);
    return Array.from(row.children || []).filter(el => visible(el) && !el.matches('[role="rowheader"]'));
  }
  function headersOf(root){
    return Array.from(root.querySelectorAll('[role="columnheader"], th')).filter(tableExportVisible);
  }
  const STATUS_ROW_OPEN_CLASS = 'bc-tools-status-open';
  const STATUS_ROW_RELEASED_CLASS = 'bc-tools-status-released';
  const STATUS_ROW_SELECTED_ATTRIBUTE = 'data-bc-tools-status-selected';
  const managedStatusRows = new Set();
  let statusRowHighlightTimer = null;
  function normalizedGridLabel(value){
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }
  function isArticleGridLabel(label){
    return label === 'articolo' || label.includes('numero articolo') || label.includes('nr articolo')
      || label.includes('codice articolo') || label.includes('cod articolo')
      || label === 'item no' || label.includes('item number') || label.includes('item code');
  }
  function statusColumnFor(root){
    const headers = headersOf(root);
    for (let sourceIndex = 0; sourceIndex < headers.length; sourceIndex++) {
      const header = headers[sourceIndex];
      const labels = [header.getAttribute('title'), header.getAttribute('aria-label'), textOf(header)]
        .map(normalizedGridLabel);
      if (!labels.some(label => label === 'stato' || label === 'status')) continue;
      const aria = Number(header.getAttribute('aria-colindex'));
      const cellIndex = Number(header.cellIndex);
      return {
        sourceIndex,
        aria:Number.isFinite(aria) && aria > 0 ? aria : 0,
        cellIndex:Number.isFinite(cellIndex) && cellIndex >= 0 ? cellIndex : -1
      };
    }
    return null;
  }
  function statusForRow(row, column){
    const cells = cellsOf(row);
    const cell = (column.aria && cells.find(item => Number(item.getAttribute('aria-colindex')) === column.aria))
      || (column.cellIndex >= 0 && cells.find(item => Number(item.cellIndex) === column.cellIndex))
      || cells[column.sourceIndex];
    const values = cell && [
      cell.getAttribute('aria-label'), cell.getAttribute('title'), textOf(cell)
    ].map(normalizedGridLabel);
    if (values && values.some(value => value === 'open' || value === 'aperto' || value === 'aperta')) return 'open';
    if (values && values.some(value => value === 'released' || value === 'rilasciato' || value === 'rilasciata')) return 'released';
    return '';
  }
  function removeStatusRowHighlight(row){
    row.classList.remove(STATUS_ROW_OPEN_CLASS, STATUS_ROW_RELEASED_CLASS);
    row.removeAttribute(STATUS_ROW_SELECTED_ATTRIBUTE);
  }
  function clearStatusRowHighlights(){
    if (statusRowHighlightTimer) {
      clearTimeout(statusRowHighlightTimer);
      statusRowHighlightTimer = null;
    }
    managedStatusRows.forEach(removeStatusRowHighlight);
    managedStatusRows.clear();
  }
  function highlightStatusRows(){
    statusRowHighlightTimer = null;
    if (!settings.highlightStatusRows) return;
    const currentRows = new Set();
    const roots = tableExportRoots(document);
    for (const root of roots) {
      const column = statusColumnFor(root);
      if (!column) continue;
      for (const row of root.querySelectorAll('[role="row"], tr')) {
        if (!visible(row) || row.querySelector('[role="columnheader"], th')) continue;
        const status = statusForRow(row, column);
        if (!status) continue;
        currentRows.add(row);
        row.classList.toggle(STATUS_ROW_OPEN_CLASS, status === 'open');
        row.classList.toggle(STATUS_ROW_RELEASED_CLASS, status === 'released');
        const selected = row.getAttribute('aria-selected') === 'true'
          || !!row.querySelector('[aria-selected="true"]');
        if (selected) row.setAttribute(STATUS_ROW_SELECTED_ATTRIBUTE, '');
        else row.removeAttribute(STATUS_ROW_SELECTED_ATTRIBUTE);
      }
    }
    managedStatusRows.forEach(row => {
      if (!currentRows.has(row)) removeStatusRowHighlight(row);
    });
    managedStatusRows.clear();
    currentRows.forEach(row => managedStatusRows.add(row));
  }
  function scheduleStatusRowHighlighting(){
    if (!settings.highlightStatusRows || statusRowHighlightTimer) return;
    statusRowHighlightTimer = setTimeout(highlightStatusRows, 100);
  }
  try {
    const statusRowObserver = new MutationObserver(records => {
      if (!settings.highlightStatusRows) return;
      if (records.some(record => record.type !== 'attributes'
        || record.attributeName === 'aria-selected')) scheduleStatusRowHighlighting();
    });
    const observeStatusGridChanges = () => {
      if (!document.documentElement) return;
      statusRowObserver.observe(document.documentElement, {
        childList:true, subtree:true, characterData:true, attributes:true,
        attributeFilter:['aria-selected','aria-label','title','aria-colindex']
      });
    };
    if (document.documentElement) observeStatusGridChanges();
    else document.addEventListener('DOMContentLoaded', observeStatusGridChanges, { once:true });
  } catch (_) {}
  // ── Apri documento appena creato dai messaggi Business Central ───────────────
  const CREATED_WHSE_BUTTON_CLASS = 'bc-tools-open-created-warehouse';
  const CREATED_WHSE_DIALOG_MARK = 'bcToolsCreatedWarehouseReady';
  const CREATED_DOCUMENT_TARGETS = [
    { kind:'posted-transfer-shipment', pageId:'5743', table:'Transfer Shipment Header', filterField:'Transfer Order No.', edit:false,
      requiredKeywordGroups:[['ordine','ord'],['trasferimento']], outcomeKeywordGroups:[['registrato','registrata']], numberStrategy:'transfer-context', excludedKeywordGroups:[['produzione','prod']] },
    { kind:'posted-warehouse-shipment', pageId:'7337', table:'Posted Whse. Shipment Header', filterField:'No.', edit:false,
      requiredKeywordGroups:[['spedizione'],['warehouse'],['registrata','registrato']], outcomeKeywordGroups:[['registrata','registrato']], numberStrategy:'indicator' },
    { kind:'posted-sales-shipment', pageId:'130', table:'Sales Shipment Header', filterField:'Order No.', edit:false,
      requiredKeywordGroups:[['ordine','ord']], outcomeKeywordGroups:[['registrato','registrata']], numberStrategy:'sales-context', excludedKeywordGroups:[['trasferimento'],['produzione','prod']] },
    { kind:'released-production-order', pageId:'99000831', table:'Production Order', filterField:'No.', edit:true,
      requiredKeywordGroups:[['rilasciato','rilasciata'],['ordine','ord'],['produzione','prod']], outcomeKeywordGroups:[['creato','creata']], numberStrategy:'production-context' },
    { kind:'warehouse-shipment', pageId:'7335', table:'Warehouse Shipment Header', filterField:'No.', edit:true,
      requiredKeywordGroups:[['spedizione'],['warehouse']], outcomeKeywordGroups:[['creata','creato']], numberStrategy:'indicator', excludedKeywordGroups:[['registrata','registrato']] },
    { kind:'pick', pageId:'5779', table:'Warehouse Activity Header', filterField:'No.', edit:true,
      requiredKeywordGroups:[['attivita'],['prelievo']], outcomeKeywordGroups:[['creata','creato']], numberStrategy:'indicator' },
    { kind:'put-away', pageId:'5770', table:'Warehouse Activity Header', filterField:'No.', edit:true,
      requiredKeywordGroups:[['attivita'],['stoccaggio']], outcomeKeywordGroups:[['creata','creato']], numberStrategy:'indicator' }
  ];
  const CREATED_DOCUMENT_NEGATIVE_PATTERNS = [
    /\bnon\s+(?:e\s+)?stat[oa]\s+(?:creat[oa]|registrat[oa])\b/i,
    /\bimpossibile\s+(?:creare|registrare)\b/i,
    /\b(?:creazione|registrazione)\s+non\s+riuscita\b/i,
    /\berrore\s+durante\s+la\s+(?:creazione|registrazione)\b/i,
    /\bnessun\s+documento\s+(?:creato|registrato)\b/i
  ];
  const CREATED_DOCUMENT_KNOWN_KEYWORDS = ['attivita','prelievo','stoccaggio','spedizione','warehouse','ordine','trasferimento','vendita','cliente','produzione','prod','rilasciato'];
  const CREATED_DOCUMENT_TOKEN = '[a-z0-9][a-z0-9._\\/-]*';
  const createdDocumentRejectedDialogs = new WeakMap();
  function normalizedDialogText(value){
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[’`´]/g, "'").replace(/\s+/g, ' ').trim();
  }
  function fullDialogText(dialog){
    if (!dialog) return '';
    return normalizedDialogText(dialog.innerText || dialog.textContent || '');
  }
  function keywordPresent(text, keyword){
    return new RegExp(`(?:^|[^a-z0-9])${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z0-9])`, 'i').test(text);
  }
  function keywordGroupsMatch(text, groups){
    return (groups || []).every(group => group.some(keyword => keywordPresent(text, keyword)));
  }
  function candidateTarget(text){
    return CREATED_DOCUMENT_TARGETS.find(target => keywordGroupsMatch(text, target.requiredKeywordGroups)
      && !(target.excludedKeywordGroups && target.excludedKeywordGroups.some(group => group.some(keyword => keywordPresent(text,keyword))))) || null;
  }
  function cleanDocumentNumber(value){
    const token=String(value || '').replace(/[.,;:!?]+$/, '');
    if(!/^[a-z0-9][a-z0-9._\/-]*$/i.test(token)) return '';
    return ['e','stato','stata','creato','creata','registrato','registrata'].includes(token.toLowerCase()) ? '' : token;
  }
  function explicitDocumentNumber(text){
    const match=text.match(new RegExp(`\\b(?:nr\\.?|n\\.?|numero)\\s*:?[\\s]+(${CREATED_DOCUMENT_TOKEN})`, 'i'));
    return cleanDocumentNumber(match && match[1]);
  }
  function contextualDocumentNumber(text, target){
    const explicit=explicitDocumentNumber(text);
    if(explicit) return explicit;
    let pattern=null;
    if(target.numberStrategy==='transfer-context') pattern=new RegExp(`\\b(?:ordine|ord\\.?)\\s+(?:di\\s+)?trasferimento\\s+(${CREATED_DOCUMENT_TOKEN})`, 'i');
    else if(target.numberStrategy==='sales-context') pattern=new RegExp(`\\b(?:ordine|ord\\.?)\\s+(?:(?:di\\s+)?(?:vendita|cliente)\\s+)?(${CREATED_DOCUMENT_TOKEN})`, 'i');
    else if(target.numberStrategy==='production-context') pattern=new RegExp(`\\brilasciat[oa]\\s+(?:ordine|ord\\.?)\\s+(?:di\\s+)?(?:produzione|prod\\.?)\\s+(${CREATED_DOCUMENT_TOKEN})`, 'i');
    const match=pattern && text.match(pattern);
    return cleanDocumentNumber(match && match[1]);
  }
  function analyzeCreatedDocument(dialog){
    const text=fullDialogText(dialog);
    const plausible=CREATED_DOCUMENT_KNOWN_KEYWORDS.some(keyword => keywordPresent(text,keyword));
    if(!plausible) return {info:null,reason:'missing-type',candidate:null,textLength:text.length,plausible:false};
    const target=candidateTarget(text);
    if(!target) return {info:null,reason:'missing-type',candidate:null,textLength:text.length,plausible:true};
    if(CREATED_DOCUMENT_NEGATIVE_PATTERNS.some(pattern => pattern.test(text))) return {info:null,reason:'negative-outcome',candidate:target,textLength:text.length,plausible:true};
    if(!keywordGroupsMatch(text,target.outcomeKeywordGroups)) return {info:null,reason:'missing-positive-outcome',candidate:target,textLength:text.length,plausible:true};
    const number=contextualDocumentNumber(text,target);
    if(!number) return {info:null,reason:'missing-number',candidate:target,textLength:text.length,plausible:true};
    return {info:{kind:target.kind,pageId:target.pageId,table:target.table,filterField:target.filterField || 'No.',edit:target.edit===true,number},reason:'',candidate:target,textLength:text.length,plausible:true};
  }
  function createdDocumentInfo(dialog){ return analyzeCreatedDocument(dialog).info; }
  function diagnoseCreatedDocumentRejection(dialog, result, reason){
    if(!result || !result.plausible) return;
    const kind=result.candidate && result.candidate.kind || undefined;
    const signature=`${reason}|${kind || ''}|${result.textLength}`;
    if(createdDocumentRejectedDialogs.get(dialog)===signature) return;
    createdDocumentRejectedDialogs.set(dialog,signature);
    const details={reason,frame:isTopFrame?'top':'child',textLength:result.textLength};
    if(kind) details.kind=kind;
    bcDiagnostic('created-document-dialog-rejected',details);
  }
  async function openCreatedDocument(okButton, info){
    const safeNumber = String(info.number).replace(/'/g, "''");
    const field = info.filterField || 'No.';
    const filter = `'${info.table}'.'${field}' IS '${safeNumber}'`;
    const set = {page:info.pageId,filter,dc:'0'};
    if(info.edit) set.mode='Edit';
    try {
      const response = await new Promise((resolve,reject)=>chrome.runtime.sendMessage({
        type:'BC_TOOLS_OPEN_BUSINESS_CENTRAL_URL',
        component:'created-document',
        options:{set,remove:['table','filter','mode','dc','bookmark'],hash:''}
      }, result=>{
        const error=chrome.runtime.lastError;
        if(error) reject(new Error('context-unavailable'));
        else resolve(result);
      }));
      if (!response || !response.ok) throw new Error(response && response.error || 'context-unavailable');
      bcDiagnostic('created-document-opened', { kind:info.kind, pageId:info.pageId, number:info.number });
      okButton.click();
    } catch (error) {
      const allowedCauses=['invalid-url','invalid-business-central-context','context-unavailable','tab-open-failed'];
      const cause=allowedCauses.includes(error && error.message) ? error.message : 'context-unavailable';
      bcDiagnostic('created-document-open-failed', {kind:info.kind,cause});
      alert('Impossibile aprire il documento: scheda Business Central non valida o non accessibile.');
    }
  }
  function visibleOkButton(dialog){
    return Array.from(dialog.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]'))
      .find(button => visible(button) && /^(ok|va bene)$/i.test(normalizedDialogText(button.value || textOf(button))));
  }
  function enhanceCreatedWarehouseDialogs(){
    if (!settings.showCreatedDocumentButton) return;
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"],[role="alertdialog"],dialog')).filter(visible);
    for (const dialog of dialogs) {
      if (dialog.dataset[CREATED_WHSE_DIALOG_MARK] === '1') continue;
      const result = analyzeCreatedDocument(dialog);
      const info = result.info;
      if (!info) { diagnoseCreatedDocumentRejection(dialog,result,result.reason); continue; }
      const okButton = visibleOkButton(dialog);
      if (!okButton) { diagnoseCreatedDocumentRejection(dialog,result,'missing-confirm-button'); continue; }
      if (okButton.parentElement?.querySelector('.' + CREATED_WHSE_BUTTON_CLASS)) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = CREATED_WHSE_BUTTON_CLASS;
      button.textContent = 'Apri documento';
      button.title = `Apri il documento ${info.number} in una nuova scheda`;
      button.setAttribute('aria-label', `Apri documento ${info.number} in una nuova scheda`);
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        openCreatedDocument(okButton, info);
      });
      okButton.parentElement.insertBefore(button, okButton);
      dialog.dataset[CREATED_WHSE_DIALOG_MARK] = '1';
      bcDiagnostic('created-document-action-added', { kind:info.kind, pageId:info.pageId, number:info.number });
    }
  }
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isTopFrame || !message || message.type !== 'BC_TOOLS_URL_CONTEXT_ERROR') return;
    alert('Apri l’azione da una scheda Business Central valida.');
    sendResponse({ok:true});
  });
  let createdWarehouseDialogTimer = null;
  function scheduleCreatedWarehouseDialogEnhancement(){
    if (!settings.showCreatedDocumentButton || createdWarehouseDialogTimer) return;
    createdWarehouseDialogTimer = setTimeout(() => {
      createdWarehouseDialogTimer = null;
      enhanceCreatedWarehouseDialogs();
    }, 80);
  }
  try {
    const createdWarehouseDialogObserver = new MutationObserver(scheduleCreatedWarehouseDialogEnhancement);
    if (document.documentElement) createdWarehouseDialogObserver.observe(document.documentElement, { childList:true, subtree:true });
    scheduleCreatedWarehouseDialogEnhancement();
  } catch (_) {}
  function locateZplGrid(){
    const roots = Array.from(document.querySelectorAll('[role="grid"], [role="treegrid"], table')).filter(visible);
    for (const root of roots) {
      const rawHeaders = headersOf(root);
      const columns = rawHeaders.map((header, sourceIndex) => {
        const name = (header.getAttribute('title') || textOf(header)).replace(/\s+/g, ' ').trim();
        const label = normLabel(name);
        const aria = Number(header.getAttribute('aria-colindex'));
        return {
          name,
          label,
          sourceIndex,
          aria:Number.isFinite(aria) && aria > 0 ? aria : 0
        };
      }).filter(column => column.name && column.label !== 'on');
      const seenColumns = new Set();
      const dataColumns = columns.filter(column => {
        const key = column.aria ? `aria:${column.aria}` : `name:${column.label}`;
        if (seenColumns.has(key)) return false;
        seenColumns.add(key);
        return true;
      });
      const fixedIndex = dataColumns.findIndex(column => column.label === 'stringa fissa' || column.label.includes('stringa fissa'));
      const fieldIndex = dataColumns.findIndex(column => column.label === 'nome campo tabella origine' || column.label.includes('nome campo tabella origine'));
      if (fixedIndex >= 0) {
        return {
          root,
          columns:dataColumns,
          headers:dataColumns.map(column => column.name),
          fixedIndex,
          fieldIndex
        };
      }
    }
    return null;
  }
  function scrollContainerFor(root){
    const candidates = [root, ...Array.from(root.querySelectorAll('*'))];
    return candidates.find(el => visible(el) && el.scrollHeight > el.clientHeight + 20 && ['auto','scroll'].includes(getComputedStyle(el).overflowY)) || null;
  }
  function readVisibleChunk(grid){
    const rows = Array.from(grid.root.querySelectorAll('[role="row"], tr')).filter(visible);
    const values = [];
    for (const row of rows) {
      if (row.querySelector('[role="columnheader"], th')) continue;
      const cells = cellsOf(row);
      if (!cells.length) continue;
      const cellForColumn = column => {
        if (column.aria) {
          const byAria = cells.find(item => Number(item.getAttribute('aria-colindex')) === column.aria);
          if (byAria) return byAria;
        }
        return cells[column.sourceIndex] || null;
      };
      const valueOfCell = cell => {
        if (!cell) return '';
        const checkbox = cell.matches('input[type="checkbox"]') ? cell : cell.querySelector('input[type="checkbox"]');
        return checkbox ? (checkbox.checked ? '1' : '0') : textOf(cell);
      };
      const rowCells = grid.columns.map(column => valueOfCell(cellForColumn(column)));
      const fixed = rowCells[grid.fixedIndex] || '';
      if (!fixed) continue;
      const fieldName = grid.fieldIndex >= 0 ? rowCells[grid.fieldIndex] || '' : '';
      const rowIndexValue = Number(row.getAttribute('aria-rowindex'));
      values.push({
        fixed,
        fieldName,
        cells:rowCells,
        rowIndex:Number.isFinite(rowIndexValue) && rowIndexValue > 0 ? rowIndexValue : 0
      });
    }
    return values;
  }
  function appendWithOverlap(all, chunk){
    if (!chunk.length) return all;
    const indexed = chunk.some(row => row.rowIndex > 0);
    if (indexed) {
      const positions = new Map(all.filter(row => row.rowIndex > 0).map((row, index) => [row.rowIndex, index]));
      for (const row of chunk) {
        if (row.rowIndex > 0 && positions.has(row.rowIndex)) {
          all[positions.get(row.rowIndex)] = row;
        } else {
          if (row.rowIndex > 0) positions.set(row.rowIndex, all.length);
          all.push(row);
        }
      }
      all.sort((left, right) => {
        if (!left.rowIndex) return 1;
        if (!right.rowIndex) return -1;
        return left.rowIndex - right.rowIndex;
      });
      return all;
    }
    const max = Math.min(all.length, chunk.length);
    let overlap = 0;
    for (let size=max; size>0; size--) {
      let same = true;
      for (let i=0; i<size; i++) {
        const left = all[all.length-size+i];
        const right = chunk[i];
        if (!left || !right || JSON.stringify(left.cells) !== JSON.stringify(right.cells)) { same=false; break; }
      }
      if (same) { overlap=size; break; }
    }
    all.push(...chunk.slice(overlap));
    return all;
  }
  function extractBoundedZpl(rows){
    const prepared = rows.map(row => {
      const fixed = String(row && row.fixed || '');
      const fieldName = String(row && row.fieldName || '').trim();
      return fieldName ? fixed.replace(/%1/g, ` {{${fieldName}}} `) : fixed;
    });
    const joined = prepared.join('\n');
    const start = joined.indexOf('^XA');
    if (start < 0) return '';
    const end = joined.indexOf('^XZ', start);
    return end < 0 ? '' : joined.slice(start, end + 3).trim();
  }
  async function scanZplTable(grid){
    if (!grid) throw new Error('Tabella con colonna “Stringa fissa” non trovata.');
    const scroller = scrollContainerFor(grid.root);
    const originalTop = scroller ? scroller.scrollTop : 0;
    const collected = [];
    try {
      if (!scroller) {
        appendWithOverlap(collected, readVisibleChunk(grid));
      } else {
        scroller.scrollTop = 0;
        await sleep(180);
        let stable = 0;
        let previousTop = -1;
        for (let step=0; step<600; step++) {
          appendWithOverlap(collected, readVisibleChunk(grid));
          const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
          if (scroller.scrollTop >= maxTop - 2 || scroller.scrollTop === previousTop) stable++;
          else stable = 0;
          if (stable >= 3) break;
          previousTop = scroller.scrollTop;
          scroller.scrollTop = Math.min(maxTop, scroller.scrollTop + Math.max(40, Math.floor(scroller.clientHeight * .72)));
          await sleep(140);
        }
      }
      const zpl = extractBoundedZpl(collected);
      if (!zpl) throw new Error(collected.some(row => row && row.fixed && row.fixed.includes('^XA')) ? 'Trovato ^XA ma non ^XZ: la tabella non è stata letta per intero.' : 'Nessun blocco ZPL ^XA…^XZ trovato.');
      return {
        zpl,
        rowsRead:collected.length,
        tableSnapshot:{
          headers:grid.headers,
          rows:collected.map(row => row.cells),
          fixedIndex:grid.fixedIndex,
          fieldIndex:grid.fieldIndex,
          sheetName:'Riga etichetta stampa Layout'
        }
      };
    } finally {
      if (scroller) { scroller.scrollTop = originalTop; }
    }
  }
  try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg) return;
      if (msg.type === 'BC_TOOLS_SALDO_ARTICOLO') {
        if (!isTopFrame) return;
        try { bcDiagnostic('saldo-message-received', { frame: 'top' }); } catch (_) {}
        let responseSent = false;
        const respond = response => {
          if (responseSent) return;
          responseSent = true;
          const knownErrors = ['wrong-page','running','grid-not-found','required-columns-missing','no-scroller','header-row-not-found','view-changed','cancelled','command-failed'];
          const error = knownErrors.includes(response?.error) ? response.error : response?.error ? 'other' : null;
          try { bcDiagnostic('saldo-command-response', { ok: !!response?.ok, error }); } catch (_) {}
          sendResponse(response);
        };
        // expectedPageId viene passato dal popup/background.
        if (msg.expectedPageId && String(msg.expectedPageId) !== String(SALDO_ARTICOLO.expectedPageId)) {
          try { bcDiagnostic('saldo-command-error', { reason: 'unexpected-page-id' }); } catch (_) {}
          respond({ ok:false, error:'wrong-page' });
          return;
        }
        handleSaldoArticoloCommand(msg, () => respond({ ok:true, started:true })).then(respond).catch(() => {
          try { bcDiagnostic('saldo-command-error', { reason: 'uncaught-exception' }); } catch (_) {}
          respond({ ok:false, error:'command-failed' });
        });
        return true;
      }
      if (msg.type !== 'BC_TOOLS_SCAN_ZPL') return;
      if (msg.expectedPageId !== ZPL_PAGE_ID) return;

      // Il manifest usa all_frames:true. La URL con page=5107911 appartiene al
      // documento principale, mentre la griglia può essere renderizzata in un frame
      // figlio con una URL diversa. Risponde quindi solo il frame che contiene
      // realmente la colonna ZPL, evitando risposte errate dagli altri frame.
      const grid = locateZplGrid();
      if (!grid) return;

      scanZplTable(grid)
        .then(result => sendResponse({ok:true, pageId:ZPL_PAGE_ID, zpl:result.zpl, rowsRead:result.rowsRead, tableSnapshot:result.tableSnapshot}))
        .catch(error => sendResponse({ok:false, error:error && error.message ? error.message : 'Errore durante la scansione ZPL.'}));
      return true;
    });
  } catch (_) {}

  // ── Acquisizione stampanti e preparazione stampa ZPL ─────────────────────────
  const PRINT_JOB_KEY = 'bcToolsZplPrintJob';
  const PRINTERS_KEY = 'bcToolsPrinterNames';
  const PRINTER_PAGE_ID = '5108105';
  const TEXT_PAGE_ID = '5107907';
  let printerJobRunning = false;
  const normalizeActionText = value => normLabel(value).replace(/…/g, '...');
  function visibleRows(root) {
    return Array.from(root.querySelectorAll('[role="row"], tr')).filter(visible)
      .filter(row => !row.querySelector('[role="columnheader"], th'));
  }
  function locatePrinterGrid() {
    const roots = Array.from(document.querySelectorAll('[role="grid"], [role="treegrid"], table')).filter(visible);
    for (const root of roots) {
      const headers = headersOf(root);
      const sourceIndex = headers.findIndex(header => normLabel(header.getAttribute('title') || textOf(header)) === 'nome');
      if (sourceIndex < 0) continue;
      const aria = Number(headers[sourceIndex].getAttribute('aria-colindex'));
      return { root, nameColumn:{ sourceIndex, aria:Number.isFinite(aria) && aria > 0 ? aria : 0 } };
    }
    return null;
  }
  function printerCell(grid, row) {
    const cells = cellsOf(row);
    if (grid.nameColumn.aria) {
      const byAria = cells.find(cell => Number(cell.getAttribute('aria-colindex')) === grid.nameColumn.aria);
      if (byAria) return byAria;
    }
    const offset = Math.max(0, cells.length - headersOf(grid.root).length);
    return cells[grid.nameColumn.sourceIndex + offset] || cells[grid.nameColumn.sourceIndex] || null;
  }
  function printerNamesFromGrid(grid) {
    return visibleRows(grid.root).map(row => textOf(printerCell(grid, row))).filter(Boolean);
  }
  async function waitForPrinterNames(grid, timeoutMs=15000) {
    const started = Date.now();
    let previous = '';
    let stable = 0;
    while (Date.now() - started < timeoutMs) {
      const names = printerNamesFromGrid(grid);
      const signature = names.join('\n');
      if (names.length && signature === previous) stable++;
      else stable = 0;
      if (names.length && stable >= 2) return names;
      previous = signature;
      await sleep(250);
    }
    return printerNamesFromGrid(grid);
  }
  async function scanAllPrinterNames(grid) {
    const scroller = scrollContainerFor(grid.root);
    const originalTop = scroller ? scroller.scrollTop : 0;
    const names = new Set();
    try {
      if (!scroller) printerNamesFromGrid(grid).forEach(name => names.add(name));
      else {
        scroller.scrollTop = 0;
        await sleep(180);
        let stable = 0, previousTop = -1;
        for (let step=0; step<600; step++) {
          printerNamesFromGrid(grid).forEach(name => names.add(name));
          const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
          if (scroller.scrollTop >= maxTop - 2 || scroller.scrollTop === previousTop) stable++; else stable = 0;
          if (stable >= 3) break;
          previousTop = scroller.scrollTop;
          scroller.scrollTop = Math.min(maxTop, scroller.scrollTop + Math.max(40, Math.floor(scroller.clientHeight * .72)));
          await sleep(140);
        }
      }
      return [...names].sort((a,b) => a.localeCompare(b, 'it'));
    } finally { if (scroller) scroller.scrollTop = originalTop; }
  }
  function actionButtonByText(label) {
    const target = normLabel(label);
    return Array.from(document.querySelectorAll('button,[role="button"],a')).filter(visible)
      .find(element => normalizeActionText(element.getAttribute('aria-label') || element.getAttribute('title') || textOf(element)).includes(target)) || null;
  }
  function rowForPrinter(grid, printerName) {
    const target = normLabel(printerName);
    const matches = visibleRows(grid.root).filter(row => {
      return normLabel(textOf(printerCell(grid, row))) === target;
    });
    return matches.length === 1 ? matches[0] : null;
  }
  function selectPrinterRow(grid, row) {
    const cell = printerCell(grid, row);
    const target = cell || row;
    try { target.focus({ preventScroll:true }); } catch (_) { try { target.focus(); } catch (_) {} }
    for (const type of ['pointerdown','mousedown','pointerup','mouseup','click']) {
      const EventType = type.startsWith('pointer') && typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
      target.dispatchEvent(new EventType(type, { bubbles:true, cancelable:true, view:window, button:0, buttons:type.endsWith('down') ? 1 : 0 }));
    }
  }
  function setNativeValue(control, value) {
    const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (!descriptor || typeof descriptor.set !== 'function') return false;
    descriptor.set.call(control, value);
    control.dispatchEvent(new Event('input', { bubbles:true }));
    control.dispatchEvent(new Event('change', { bubbles:true }));
    return control.value === value;
  }
  function visibleTextControl() {
    return Array.from(document.querySelectorAll('textarea')).filter(visible)[0] || null;
  }
  async function updatePrintJob(job, patch) {
    await chrome.storage.local.set({ [PRINT_JOB_KEY]:Object.assign({}, job, patch, { updatedAt:Date.now() }) });
  }
  async function processPrinterJob() {
    if (printerJobRunning) return;
    const data = await chrome.storage.local.get({ [PRINT_JOB_KEY]:null });
    const job = data && data[PRINT_JOB_KEY];
    if (!job || !job.id || !['acquirePrinters','preparePrint'].includes(job.action) || job.state !== 'pending') return;
    const grid = locatePrinterGrid();
    if (!grid) return;
    printerJobRunning = true;
    try {
      const readyNames = await waitForPrinterNames(grid);
      if (!readyNames.length) throw new Error('La colonna Nome è visibile, ma le righe non sono state caricate entro 15 secondi.');
      const names = await scanAllPrinterNames(grid);
      if (!names.length) throw new Error('Nessun valore trovato nella colonna Nome dopo il caricamento.');
      await chrome.storage.local.set({ [PRINTERS_KEY]:names });
      if (job.action === 'acquirePrinters') {
        await updatePrintJob(job, { state:'printersReady', count:names.length });
        return;
      }
      const requested = String(job.printerName || '').trim();
      if (!requested) throw new Error('Nome stampante non specificato.');
      const scroller = scrollContainerFor(grid.root);
      if (scroller) scroller.scrollTop = 0;
      await sleep(180);
      let row = null;
      for (let step=0; step<600 && !row; step++) {
        row = rowForPrinter(grid, requested);
        if (row) break;
        if (!scroller) break;
        const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        if (scroller.scrollTop >= maxTop - 2) break;
        scroller.scrollTop = Math.min(maxTop, scroller.scrollTop + Math.max(40, Math.floor(scroller.clientHeight * .72)));
        await sleep(140);
      }
      if (!row) throw new Error(`Stampante “${requested}” non trovata in modo univoco.`);
      row.scrollIntoView({ block:'center' });
      selectPrinterRow(grid, row);
      await sleep(220);
      await updatePrintJob(job, { state:'printerSelected' });
    } catch (error) {
      await updatePrintJob(job, { state:'error', error:error && error.message ? error.message : 'Errore durante la preparazione della stampa.' });
    } finally {
      printerJobRunning = false;
    }
  }
  async function openPrintTextPage() {
    const data = await chrome.storage.local.get({ [PRINT_JOB_KEY]:null });
    const job = data && data[PRINT_JOB_KEY];
    if (!job || job.action !== 'preparePrint' || job.state !== 'printerSelected') return;
    const action = actionButtonByText('stampa test testo');
    if (!action) return;
    await updatePrintJob(job, { state:'waitingTextPage' });
    action.click();
  }
  async function fillPendingPrintText() {
    const data = await chrome.storage.local.get({ [PRINT_JOB_KEY]:null });
    const job = data && data[PRINT_JOB_KEY];
    if (!job || job.action !== 'preparePrint' || job.state !== 'waitingTextPage' || typeof job.zpl !== 'string') return;
    const control = visibleTextControl();
    if (!control || !setNativeValue(control, job.zpl)) return;
    await updatePrintJob(job, { state:'textInserted' });
  }
  let printObserverTimer = null;
  function schedulePrinterAutomation() {
    if (printObserverTimer) return;
    printObserverTimer = setTimeout(async () => {
      printObserverTimer = null;
      try { await processPrinterJob(); await openPrintTextPage(); await fillPendingPrintText(); } catch (_) {}
    }, 120);
  }
  try {
    const observer = new MutationObserver(schedulePrinterAutomation);
    if (document.documentElement) observer.observe(document.documentElement, { childList:true, subtree:true });
    chrome.storage.onChanged.addListener((changes, ns) => { if (ns === 'local' && changes[PRINT_JOB_KEY]) schedulePrinterAutomation(); });
    schedulePrinterAutomation();
  } catch (_) {}

  // ── Copia campi cliccabili nelle griglie ───────────────────────────────────────
  const PAGE_FIELD_COPY_BUTTON_CLASS = 'bc-tools-copy-page-field';
  const COPY_CELL_SELECTOR = 'td,[role="gridcell"],[role="cell"]';
  const COPY_UI_SELECTOR = '.bc-tools-copy-page-field,.bc-tools-copy-actions';
  const HIDDEN_COPY_FIELDS_KEY = 'bcToolsHiddenCopyFields';
  const SHOWN_COPY_FIELDS_KEY = 'bcToolsShownCopyFields';
  const GLOBAL_HIDDEN_COPY_FIELDS_KEY = 'bcToolsHiddenCopyFieldsGlobal';
  const GLOBAL_SHOWN_COPY_FIELDS_KEY = 'bcToolsShownCopyFieldsGlobal';
  let hiddenCopyFieldKeys = new Set();
  let shownCopyFieldKeys = new Set();
  let hiddenGlobalCopyFieldKeys = new Set();
  let shownGlobalCopyFieldKeys = new Set();
  let pendingCopyColumn = null;
  let copyActionsPanel = null;
  let copyActionsMenu = null;
  let copyActionsGrid = null;
  let copyActionsLegacyKey = null;
  let copyActionsGlobalScope = false;
  function copyFieldHash(value) {
    let hash = 2166136261;
    for (let index=0; index<value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
    return `copy-${(hash >>> 0).toString(36)}`;
  }
  function copyColumnIndex(cell) {
    const ariaIndex = Number(cell.getAttribute?.('aria-colindex'));
    if (Number.isInteger(ariaIndex) && ariaIndex > 0) return ariaIndex - 1;
    if (Number.isInteger(cell.cellIndex)) return cell.cellIndex;
    return Array.from(cell.parentElement?.children || []).indexOf(cell);
  }
  function copyFieldPageIdentity(url, cell) {
    let topUrl = url;
    try {
      const candidate = new URL(window.top.location.href);
      if (candidate.origin === url.origin && candidate.pathname === url.pathname) topUrl = candidate;
    } catch (_) { /* Il frame superiore puo' essere cross-origin. */ }
    const value = (source, ...keys) => keys.map(key => source.searchParams.get(key)).find(item => item) || '';
    const company = value(url, 'company', 'Company') || value(topUrl, 'company', 'Company');
    // Le pagine SPA condividono il frame: l'URL puo' non avere page o indicare un'altra pagina.
    const ownerPage = cell.closest('[data-page-id]')?.getAttribute?.('data-page-id') || '';
    const page = /^\d+$/.test(ownerPage) ? ownerPage
      : value(url, 'page', 'Page', 'pageId', 'pageid') || value(topUrl, 'page', 'Page', 'pageId', 'pageid');
    return {
      key:`${url.origin}${url.pathname}|${company}|${page}`,
      pageId:/^\d+$/.test(page) ? page : ''
    };
  }
  function copyFieldPreferenceKeys(page, column, index, duplicateColumn, pageId = '') {
    const stableColumn = duplicateColumn ? `${column}|${index}` : column;
    return {
      key:copyFieldHash(`${page}|${stableColumn}`),
      legacyKey:copyFieldHash(`${page}|${column}|${index}`),
      globalKey:pageId ? copyFieldHash(`${pageId}|${stableColumn}`) : null,
      globalLegacyKey:pageId ? copyFieldHash(`${pageId}|${column}|${index}`) : null
    };
  }
  function copyFieldGrid(cell) {
    return cell.closest('.ms-nav-grid-container') || cell.closest('[role="grid"],[role="treegrid"]')
      || cell.closest('.ms-nav-grid') || cell.closest('table');
  }
  function copyFieldIdentity(element, cell) {
    const grid = copyFieldGrid(cell);
    const index = copyColumnIndex(cell);
    const headers = grid ? headersOf(grid).filter(item => textOf(item)) : [];
    const labelledBy = new Set(`${cell.getAttribute?.('aria-labelledby') || ''} ${element?.getAttribute?.('aria-labelledby') || ''}`.split(/\s+/).filter(Boolean));
    const header = headers.find(item => (item.id && labelledBy.has(item.id))
      || Array.from(item.querySelectorAll?.('[id]') || []).some(label => labelledBy.has(label.id)))
      || headers.find(item => copyColumnIndex(item) === index);
    const column = normLabel(header ? textOf(header) : `colonna ${index}`);
    const url = new URL(location.href);
    const page = copyFieldPageIdentity(url, cell);
    const duplicateColumn = header && headers.filter(item => normLabel(textOf(item)) === column).length > 1;
    const keys = copyFieldPreferenceKeys(page.key, column, index, !!duplicateColumn, page.pageId);
    const globalScope = settings.pageFieldCopyGlobalPreferences === true && !!keys.globalKey;
    return {
      ...keys,
      key:globalScope ? keys.globalKey : keys.key,
      legacyKey:globalScope ? keys.globalLegacyKey : keys.legacyKey,
      globalScope
    };
  }
  function validHiddenCopyFieldKeys(value) {
    return new Set(Array.isArray(value) ? value.filter(key => typeof key === 'string' && /^copy-[a-z0-9]+$/.test(key)).slice(0, 5000) : []);
  }
  function refreshCopyFieldColumn(key, grid = null) {
    const root = grid && grid.isConnected ? grid : document;
    for (const field of root.querySelectorAll('[class*="control-read"]')) {
      if (Array.from(field.children || []).some(child => child.matches('[class*="control-read"]'))) continue;
      const cell = field.closest('td,[role="gridcell"],[role="cell"]');
      if (!cell) continue;
      const identity = copyFieldIdentity(field, cell);
      if (key && identity.key !== key && identity.legacyKey !== key) continue;
      const type = pageFieldType(field);
      const visibleType = type || 'underlined';
      const enabled = copyFieldEligible(type, identity.key, identity.legacyKey, identity.globalKey, identity.globalLegacyKey);
      addCopyButton(cell, type === 'teal' ? 'campo teal' : 'campo sottolineato', !!enabled, visibleType, field, identity.key);
    }
  }
  function copyFieldEligible(type, key, legacyKey, globalKey = null, globalLegacyKey = null) {
    const globalScope = settings.pageFieldCopyGlobalPreferences === true && !!globalKey;
    const hiddenKeys = globalScope ? hiddenGlobalCopyFieldKeys : hiddenCopyFieldKeys;
    const shownKeys = globalScope ? shownGlobalCopyFieldKeys : shownCopyFieldKeys;
    const selectedKey = globalScope ? globalKey : key;
    const selectedLegacyKey = globalScope ? globalLegacyKey : legacyKey;
    if (!pageFieldCopyEnabled(settings) || hiddenKeys.has(selectedKey) || (selectedLegacyKey && hiddenKeys.has(selectedLegacyKey))) return false;
    const mode = pageFieldCopyMode(settings);
    return shownKeys.has(selectedKey) || (selectedLegacyKey && shownKeys.has(selectedLegacyKey))
      || (!!type && (mode === 'both' || mode === type));
  }
  function saveCopyFieldVisibility(nextHiddenKeys, nextShownKeys, previousHiddenKeys, previousShownKeys, key, grid, globalScope = false) {
    const hiddenStorageKey = globalScope ? GLOBAL_HIDDEN_COPY_FIELDS_KEY : HIDDEN_COPY_FIELDS_KEY;
    const shownStorageKey = globalScope ? GLOBAL_SHOWN_COPY_FIELDS_KEY : SHOWN_COPY_FIELDS_KEY;
    chrome.storage.local.set({
      [hiddenStorageKey]:Array.from(nextHiddenKeys),
      [shownStorageKey]:Array.from(nextShownKeys)
    }, () => {
      if (chrome.runtime.lastError) {
        bcDiagnostic('copy-field-visibility-save-failed', { reason:String(chrome.runtime.lastError.message || '').slice(0,120) });
        if (globalScope) {
          hiddenGlobalCopyFieldKeys = previousHiddenKeys;
          shownGlobalCopyFieldKeys = previousShownKeys;
        } else {
          hiddenCopyFieldKeys = previousHiddenKeys;
          shownCopyFieldKeys = previousShownKeys;
        }
        refreshCopyFieldColumn(key, grid);
        return;
      }
    });
  }
  function setCopyFieldHidden(key, hidden, grid = null, legacyKey = null, globalScope = settings.pageFieldCopyGlobalPreferences === true) {
    const currentHiddenKeys = globalScope ? hiddenGlobalCopyFieldKeys : hiddenCopyFieldKeys;
    const currentShownKeys = globalScope ? shownGlobalCopyFieldKeys : shownCopyFieldKeys;
    const nextHiddenKeys = new Set(currentHiddenKeys);
    const nextShownKeys = new Set(currentShownKeys);
    const keys = legacyKey && legacyKey !== key ? [key, legacyKey] : [key];
    for (const fieldKey of keys) {
      if (hidden) {
        nextHiddenKeys.add(fieldKey);
        nextShownKeys.delete(fieldKey);
      } else {
        nextHiddenKeys.delete(fieldKey);
        nextShownKeys.add(fieldKey);
      }
    }
    const changed = nextHiddenKeys.size !== currentHiddenKeys.size
      || [...nextHiddenKeys].some(value => !currentHiddenKeys.has(value))
      || nextShownKeys.size !== currentShownKeys.size
      || [...nextShownKeys].some(value => !currentShownKeys.has(value));
    if (!changed) {
      refreshCopyFieldColumn(key, grid);
      return;
    }
    const previousHiddenKeys = currentHiddenKeys;
    const previousShownKeys = currentShownKeys;
    if (globalScope) {
      hiddenGlobalCopyFieldKeys = nextHiddenKeys;
      shownGlobalCopyFieldKeys = nextShownKeys;
    } else {
      hiddenCopyFieldKeys = nextHiddenKeys;
      shownCopyFieldKeys = nextShownKeys;
    }
    refreshCopyFieldColumn(key, grid);
    saveCopyFieldVisibility(nextHiddenKeys, nextShownKeys, previousHiddenKeys, previousShownKeys, key, grid, globalScope);
  }
  function closeCopyActionsPanel() {
    if (copyActionsPanel) copyActionsPanel.remove();
    copyActionsPanel = null;
    copyActionsMenu = null;
    copyActionsGrid = null;
    copyActionsLegacyKey = null;
    copyActionsGlobalScope = false;
  }
  function dismissCopyActionsPanel() {
    pendingCopyColumn = null;
    closeCopyActionsPanel();
  }
  function handleCopyContextMenu(event) {
    closeCopyActionsPanel();
    const target = event.target && event.target.closest ? event.target : null;
    const cell = target && target.closest('th,td,[role="columnheader"],[role="gridcell"],[role="cell"]');
    const grid = cell && copyFieldGrid(cell);
    const identity = grid && pageFieldCopyEnabled(settings) ? copyFieldIdentity(null, cell) : null;
    pendingCopyColumn = identity
      ? { ...identity, grid, x:event.clientX, y:event.clientY }
      : null;
    if (pendingCopyColumn) {
      const pending = pendingCopyColumn;
      setTimeout(addCopyActionsToContextMenu, 0);
      setTimeout(() => { if (pendingCopyColumn === pending) pendingCopyColumn = null; }, 1200);
    }
  }
  document.addEventListener('contextmenu', handleCopyContextMenu, true);
  function showCopyActionsPanel(menu, key, legacyKey, grid, globalScope = false) {
    const panel = document.createElement('div');
    panel.className = 'bc-tools-copy-actions';
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', 'Pulsanti Copia per la colonna');
    panel.dataset.copyColumnKey = key;
    copyActionsGrid = grid;
    copyActionsLegacyKey = legacyKey;
    copyActionsGlobalScope = globalScope;
    for (const [action, label] of [['show', 'Mostra pulsante Copia'], ['hide', 'Nascondi pulsante Copia']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('pointerdown', pointerEvent => {
        pointerEvent.preventDefault();
        pointerEvent.stopPropagation();
      });
      button.addEventListener('click', clickEvent => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        const columnKey = panel.dataset.copyColumnKey;
        const columnGrid = copyActionsGrid;
        const oldColumnKey = copyActionsLegacyKey;
        const globalScope = copyActionsGlobalScope;
        dismissCopyActionsPanel();
        if (columnKey) setCopyFieldHidden(columnKey, action === 'hide', columnGrid, oldColumnKey, globalScope);
      });
      panel.appendChild(button);
    }
    const rect = menu.getBoundingClientRect();
    const gap = 6;
    const rightSpace = window.innerWidth - rect.right - gap - 4;
    const leftSpace = rect.left - gap - 4;
    let width, left;
    if (rightSpace >= 120) {
      width = Math.min(220, rightSpace);
      left = rect.right + gap;
    } else if (leftSpace >= 120) {
      width = Math.min(220, leftSpace);
      left = rect.left - gap - width;
    } else if (rightSpace >= 48) {
      width = rightSpace;
      left = rect.right + gap;
    } else {
      width = Math.min(72, window.innerWidth - 12);
      left = Math.max(4, Math.min(rect.right + gap, window.innerWidth - width - 4));
    }
    panel.style.width = `${width}px`;
    panel.style.maxHeight = `${Math.max(80, window.innerHeight - 8)}px`;
    document.body.appendChild(panel);
    copyActionsPanel = panel;
    copyActionsMenu = menu;
    const panelHeight = panel.getBoundingClientRect().height;
    panel.style.left = `${left}px`;
    panel.style.top = `${Math.max(4, Math.min(rect.top, window.innerHeight - panelHeight - 4))}px`;
  }
  function addCopyActionsToContextMenu() {
    const pending = pendingCopyColumn;
    if (!pending) return;
    if (copyActionsMenu && (!copyActionsMenu.isConnected || !visible(copyActionsMenu))) closeCopyActionsPanel();
    const menus = Array.from(document.querySelectorAll('[role="menu"],[class*="menu" i]'))
      .filter(menu => {
        if (!visible(menu) || menu.matches('[role="grid"],[role="treegrid"],.ms-nav-grid-container,.ms-nav-grid,table')
          || menu.closest('th,td,[role="columnheader"],[role="gridcell"],[role="cell"]')) return false;
        const label = normLabel(textOf(menu));
        const hasSort = (label.includes('crescente') && label.includes('decrescente'))
          || (label.includes('ascending') && label.includes('descending'));
        return hasSort && (label.includes('filtra') || label.includes('filter'));
      });
    const menu = menus.map(item => {
      const rect = item.getBoundingClientRect();
      const dx = Math.max(rect.left - pending.x, 0, pending.x - rect.right);
      const dy = Math.max(rect.top - pending.y, 0, pending.y - rect.bottom);
      return { item, distance:Math.hypot(dx, dy) };
    }).filter(candidate => candidate.distance < 120 && candidate.item.querySelector('button,[role="menuitem"]'))
      .sort((left, right) => left.distance - right.distance)[0]?.item;
    if (!menu) return;
    if (copyActionsMenu === menu && copyActionsPanel) {
      copyActionsPanel.dataset.copyColumnKey = pending.key;
      copyActionsGrid = pending.grid;
      copyActionsLegacyKey = pending.legacyKey;
      copyActionsGlobalScope = pending.globalScope;
      return;
    }
    closeCopyActionsPanel();
    showCopyActionsPanel(menu, pending.key, pending.legacyKey, pending.grid, pending.globalScope);
  }
  document.addEventListener('pointerdown', event => {
    if (copyActionsPanel && !copyActionsPanel.contains(event.target) && !copyActionsMenu?.contains(event.target)) dismissCopyActionsPanel();
  }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') dismissCopyActionsPanel(); }, true);
  window.addEventListener('scroll', () => dismissCopyActionsPanel(), true);
  window.addEventListener('resize', () => dismissCopyActionsPanel());
  function copyablePageFieldText(field) {
    return String(field && (field.innerText || field.textContent) || '').replace(/\s+/g, ' ').trim();
  }
  async function writeClipboardText(value) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(value);
        return;
      } catch (_) {}
    }
    const helper = document.createElement('textarea');
    helper.value = value;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } finally {
      helper.remove();
    }
    if (!copied) throw new Error('Copia non consentita dal browser.');
  }
  function addCopyButton(cell, columnLabel, eligible, pageFieldType, pageField, fieldKey) {
    if (!cell) return;
    const hostClass = 'bc-tools-copy-page-field-host';
    const existing = cell.querySelector('.' + PAGE_FIELD_COPY_BUTTON_CLASS);
    const readValue = () => copyablePageFieldText(pageField);
    // Le griglie BC mantengono righe vuote e possono riciclare le celle. Il
    // comando deve esistere solo quando la cella contiene davvero un codice.
    // Per la caption generica "Nr." serve inoltre Tipo=Articolo nella stessa riga.
    if (!eligible || !readValue()) {
      if (existing) existing.remove();
      cell.classList.remove(hostClass);
      return;
    }
    if (existing && existing.classList.contains(PAGE_FIELD_COPY_BUTTON_CLASS + '-' + pageFieldType)) {
      existing.dataset.copyFieldKey = fieldKey;
      return;
    }
    if (existing) existing.remove();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = PAGE_FIELD_COPY_BUTTON_CLASS + ' ' + PAGE_FIELD_COPY_BUTTON_CLASS + '-' + pageFieldType;
    button.setAttribute('aria-label', 'Copia valore');
    button.title = 'Copia valore';
    button.dataset.copyFieldKey = fieldKey;
    button.textContent = '⧉';
    let pressedValue = '';
    button.addEventListener('pointerdown', event => {
      // Salva il valore prima che la griglia BC possa cambiare editor/cella attiva.
      pressedValue = readValue();
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      const value = pressedValue || readValue();
      pressedValue = '';
      if (!value) return;
      try {
        await writeClipboardText(value);
        bcDiagnostic('page-field-copy-succeeded', { column:columnLabel || 'unknown' });
        button.classList.add('bc-tools-copy-page-field-ok');
        button.title = 'Copiato';
      } catch (error) {
        bcDiagnostic('page-field-copy-failed', { column:columnLabel || 'unknown', reason:String(error && error.message || error || '').slice(0,160) });
        button.classList.add('bc-tools-copy-page-field-error');
        button.title = 'Copia non riuscita';
      }
      setTimeout(() => {
        button.classList.remove('bc-tools-copy-page-field-ok', 'bc-tools-copy-page-field-error');
        button.title = 'Copia valore';
      }, 1200);
    });
    cell.classList.add(hostClass);
    cell.appendChild(button);
  }
  function pageFieldType(element) {
    if (!visible(element) || !copyablePageFieldText(element)) return '';
    if (!element.closest('[role="grid"], [role="treegrid"], .ms-nav-grid-container, .ms-nav-grid, table')) return '';
    if (element.classList.contains('ms-nav-previewlookup')) return 'underlined';
    const style = getComputedStyle(element);
    const color = style.color.match(/\d+/g) || [];
    const teal = color.length >= 3 && Number(color[1]) > Number(color[0]) * 1.5
      && Number(color[2]) > Number(color[0]) * 1.5 && Number(color[1]) < 180 && Number(color[2]) < 180;
    return style.cursor === 'pointer' && (teal || /^Apri record\b/i.test(element.getAttribute('title') || '')) ? 'teal' : '';
  }
  function enhanceClickablePageFields(cells = null) {
    if (!pageFieldCopyEnabled(settings)) return;
    let fields;
    if (cells) {
      fields = [];
      for (const cell of cells) {
        if (!cell.isConnected) continue;
        const cellFields = Array.from(cell.querySelectorAll('[class*="control-read"]'));
        if (!cellFields.length) {
          cell.querySelector('.' + PAGE_FIELD_COPY_BUTTON_CLASS)?.remove();
          cell.classList.remove('bc-tools-copy-page-field-host');
        }
        fields.push(...cellFields);
      }
    } else {
      fields = document.querySelectorAll('[class*="control-read"]');
    }
    for (const element of fields) {
      if (Array.from(element.children || []).some(child => child.matches('[class*="control-read"]'))) continue;
      const cell = element.closest('td,[role="gridcell"],[role="cell"]');
      if (!cell) continue;
      const type = pageFieldType(element);
      const identity = copyFieldIdentity(element, cell);
      const enabled = copyFieldEligible(type, identity.key, identity.legacyKey, identity.globalKey, identity.globalLegacyKey);
      addCopyButton(cell, type === 'teal' ? 'campo teal' : 'campo sottolineato', !!enabled, type || 'underlined', element, identity.key);
    }
  }
  function copyCellsFromMutations(records) {
    const cells = new Set();
    const isCopyUi = node => {
      const element = node && node.nodeType === 1 ? node : node && node.parentElement;
      return !!(element && element.closest(COPY_UI_SELECTOR));
    };
    const addNode = (node, searchDescendants = false) => {
      if (!node || isCopyUi(node)) return;
      const element = node.nodeType === 1 ? node : node.parentElement;
      if (!element) return;
      const cell = element.matches(COPY_CELL_SELECTOR) ? element : element.closest(COPY_CELL_SELECTOR);
      if (cell) {
        cells.add(cell);
        return;
      }
      if (searchDescendants) {
        for (const nestedCell of element.querySelectorAll(COPY_CELL_SELECTOR)) cells.add(nestedCell);
      }
    };
    for (const record of records) {
      if (isCopyUi(record.target)) continue;
      if (record.type === 'characterData') {
        addNode(record.target);
        continue;
      }
      const changedNodes = [...record.removedNodes, ...record.addedNodes].filter(node => !isCopyUi(node));
      if (!changedNodes.length) continue;
      addNode(record.target);
      changedNodes.forEach(node => addNode(node, true));
    }
    return cells;
  }
  let copyEnhanceTimer = null;
  let copyEnhanceAll = false;
  let pendingCopyCells = new Set();
  let copyObserver = null;
  function scheduleCopyEnhancement(cells = null) {
    if (!pageFieldCopyEnabled(settings) || (cells && !cells.size)) return;
    if (!cells) copyEnhanceAll = true;
    else if (!copyEnhanceAll) cells.forEach(cell => pendingCopyCells.add(cell));
    if (copyEnhanceTimer) return;
    copyEnhanceTimer = setTimeout(() => {
      copyEnhanceTimer = null;
      const cellsToEnhance = copyEnhanceAll ? null : pendingCopyCells;
      copyEnhanceAll = false;
      pendingCopyCells = new Set();
      enhanceClickablePageFields(cellsToEnhance);
    }, 100);
  }
  function syncCopyObserver(enabled) {
    if (!enabled) {
      copyObserver?.disconnect();
      copyObserver = null;
      if (copyEnhanceTimer) clearTimeout(copyEnhanceTimer);
      copyEnhanceTimer = null;
      copyEnhanceAll = false;
      pendingCopyCells.clear();
      return;
    }
    if (copyObserver || !document.documentElement) return;
    copyObserver = new MutationObserver(records => {
      const cells = copyCellsFromMutations(records);
      if (cells.size) scheduleCopyEnhancement(cells);
      if (pendingCopyColumn) addCopyActionsToContextMenu();
    });
    copyObserver.observe(document.documentElement, { childList:true, subtree:true, characterData:true });
  }
  // ── init ──────────────────────────────────────────────────────────────────────
  function init() {
    try {
      const UI_BACKUP_KEY = 'bcToolsUiSettings';
      chrome.storage.sync.get(DEFAULTS, synced => {
        if (chrome.runtime.lastError) return;
        chrome.storage.local.get([UI_BACKUP_KEY, HIDDEN_COPY_FIELDS_KEY, SHOWN_COPY_FIELDS_KEY, GLOBAL_HIDDEN_COPY_FIELDS_KEY, GLOBAL_SHOWN_COPY_FIELDS_KEY, ...Object.keys(DEFAULTS)], local => {
          if (chrome.runtime.lastError) return;
          hiddenCopyFieldKeys = validHiddenCopyFieldKeys(local[HIDDEN_COPY_FIELDS_KEY]);
          shownCopyFieldKeys = validHiddenCopyFieldKeys(local[SHOWN_COPY_FIELDS_KEY]);
          hiddenGlobalCopyFieldKeys = validHiddenCopyFieldKeys(local[GLOBAL_HIDDEN_COPY_FIELDS_KEY]);
          shownGlobalCopyFieldKeys = validHiddenCopyFieldKeys(local[GLOBAL_SHOWN_COPY_FIELDS_KEY]);
          const backup = local[UI_BACKUP_KEY] && typeof local[UI_BACKUP_KEY] === 'object' ? local[UI_BACKUP_KEY] : {};
          const direct = Object.fromEntries(Object.keys(DEFAULTS)
            .filter(key => Object.prototype.hasOwnProperty.call(local, key))
            .map(key => [key, local[key]]));
          settings = Object.assign({}, DEFAULTS, backup, direct, synced);
          applySettings(settings);
        });
      });
      chrome.storage.onChanged.addListener((changes, ns) => {
        let touched = false;
        if (ns === 'sync') {
          for (const k of Object.keys(DEFAULTS)) {
            if (!changes[k]) continue;
            settings[k] = changes[k].newValue === undefined ? DEFAULTS[k] : changes[k].newValue;
            touched = true;
          }
        } else if (ns === 'local') {
          if (changes[HIDDEN_COPY_FIELDS_KEY] || changes[SHOWN_COPY_FIELDS_KEY] || changes[GLOBAL_HIDDEN_COPY_FIELDS_KEY] || changes[GLOBAL_SHOWN_COPY_FIELDS_KEY]) {
            if (changes[HIDDEN_COPY_FIELDS_KEY]) hiddenCopyFieldKeys = validHiddenCopyFieldKeys(changes[HIDDEN_COPY_FIELDS_KEY].newValue);
            if (changes[SHOWN_COPY_FIELDS_KEY]) shownCopyFieldKeys = validHiddenCopyFieldKeys(changes[SHOWN_COPY_FIELDS_KEY].newValue);
            if (changes[GLOBAL_HIDDEN_COPY_FIELDS_KEY]) hiddenGlobalCopyFieldKeys = validHiddenCopyFieldKeys(changes[GLOBAL_HIDDEN_COPY_FIELDS_KEY].newValue);
            if (changes[GLOBAL_SHOWN_COPY_FIELDS_KEY]) shownGlobalCopyFieldKeys = validHiddenCopyFieldKeys(changes[GLOBAL_SHOWN_COPY_FIELDS_KEY].newValue);
            refreshCopyFieldColumn();
            scheduleCopyEnhancement();
          }
          for (const k of Object.keys(DEFAULTS)) {
            if (!changes[k]) continue;
            settings[k] = changes[k].newValue === undefined ? DEFAULTS[k] : changes[k].newValue;
            touched = true;
          }
          if (!touched && changes[UI_BACKUP_KEY]) {
            const backup = changes[UI_BACKUP_KEY].newValue || {};
            for (const k of Object.keys(DEFAULTS)) {
              if (!Object.prototype.hasOwnProperty.call(backup, k)) continue;
              settings[k] = backup[k];
              touched = true;
            }
          }
        }
        if (touched) applySettings(settings);
      });
    } catch (_) { /* storage non disponibile */ }
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
  function tableExportVisible(el){
    if(!el||!el.isConnected)return false;
    const view=el.ownerDocument&&el.ownerDocument.defaultView;
    if(!view)return false;
    const style=view.getComputedStyle(el),rect=el.getBoundingClientRect();
    return style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0;
  }
  function tableExportRowElements(root){
    const rows=Array.from(root.querySelectorAll('[role="row"],tr')).filter(tableExportVisible);
    return rows.filter(row=>!rows.some(other=>other!==row&&other.contains(row)));
  }
  function tableExportRoots(doc){
    const primary=Array.from(doc.querySelectorAll('.ms-nav-grid-container,.ms-nav-grid,[role="grid"],[role="treegrid"]'))
      .filter(tableExportVisible)
      .filter(root=>!root.matches('table.ms-nav-grid-header-table'));
    const candidates=primary.length?primary:Array.from(doc.querySelectorAll('table:not(.ms-nav-grid-header-table)')).filter(tableExportVisible);
    const roots=Array.from(new Set(candidates.map(root=>{
      if(!root.matches('table.ms-nav-grid'))return root;
      for(let parent=root.parentElement;parent&&parent!==doc.body;parent=parent.parentElement){
        if(parent.querySelector('table.ms-nav-grid-header-table')&&parent.contains(root))return parent;
      }
      return root;
    })));
    return roots.filter((root,index)=>!roots.some((other,otherIndex)=>index!==otherIndex&&other!==root&&other.contains(root)));
  }
  function tableExportCellText(cell){
    const displayValues=Array.from(cell.querySelectorAll('[class*="control-read"]'))
      .filter(element=>tableExportVisible(element)
        &&!Array.from(element.children||[]).some(child=>child.matches('[class*="control-read"]')))
      .map(element=>String(element.innerText||element.textContent||element.getAttribute('aria-label')||element.getAttribute('title')||'')
        .replace(/\s+/g,' ').trim())
      .filter(Boolean);
    const clone=cell.cloneNode(true);
    clone.querySelectorAll('[class*="control-read"],button,input,[role="button"],[role="menu"],[role="checkbox"],.bc-tools-copy-page-field,[aria-haspopup="menu"]')
      .forEach(el=>el.remove());
    const text=String(clone.innerText||clone.textContent||'').replace(/\s+/g,' ').trim();
    const controls=Array.from(cell.querySelectorAll('input:not([type="radio"]):not([type="button"]),textarea,select'))
      .filter(tableExportVisible)
      .map(control=>{
        if(control.matches('input[type="checkbox"]'))return control.checked?'Sì':'No';
        if(control.matches('select')){
          const selected=control.selectedOptions&&control.selectedOptions[0];
          return String(selected&&selected.textContent||control.value||'').trim();
        }
        return String(control.value||'').trim();
      })
      .filter(Boolean)
      .join(' ');
    const rendered=[...(text?[text]:[]),...displayValues].filter(Boolean);
    const value=Array.from(new Set(rendered)).join(' ');
    const complete=controls&&value&&!value.includes(controls)?`${value} ${controls}`:controls||value;
    return complete||String(cell.getAttribute('aria-label')||cell.getAttribute('title')||'').replace(/\s+/g,' ').trim();
  }
  function tableExportCellElements(row){
    let cells=Array.from(row.children||[]).filter(cell=>cell.matches('[role="gridcell"],[role="cell"],[role="columnheader"],td,th'));
    if(!cells.length)cells=Array.from(row.querySelectorAll('[role="gridcell"],[role="cell"],[role="columnheader"],td,th'));
    return cells;
  }
  function tableExportCellIndex(cell,fallback){
    const ariaIndex=Number(cell.getAttribute('aria-colindex'));
    if(Number.isInteger(ariaIndex)&&ariaIndex>0)return ariaIndex-1;
    return Number.isInteger(cell.cellIndex)&&cell.cellIndex>=0?cell.cellIndex:fallback;
  }
  function tableExportReadRows(root,headerRow,headers){
    const headerColumns=headers.map((header,index)=>tableExportCellIndex(header,index));
    return tableExportRowElements(root)
      .filter(row=>row!==headerRow
        &&!row.querySelector('[role="columnheader"],th')
        &&!row.closest('table.ms-nav-grid-header-table'))
      .map(row=>{
        const cells=tableExportCellElements(row),values=Array(headers.length).fill('');
        cells.forEach((cell,index)=>{
          const column=tableExportCellIndex(cell,index);
          const headerIndex=headerColumns.indexOf(column);
          if(headerIndex>=0&&tableExportVisible(cell))values[headerIndex]=tableExportCellText(cell);
        });
        return {key:tableExportRowKey(row,values),values,rowEl:row};
      })
      .filter(row=>row.values.some(value=>value!==''));
  }
  function tableExportRowKey(row,values){
    for(const attribute of ['data-id','data-row-key']){
      const value=row.getAttribute(attribute);
      if(value)return `${attribute}:${value}`;
    }
    for(const attribute of ['data-row-index','aria-rowindex','id']){
      const value=row.getAttribute(attribute);
      if(value)return `${attribute}:${value}:${JSON.stringify(values)}`;
    }
    return `values:${JSON.stringify(values)}`;
  }
  function tableExportIndexRow(indexedRows,row){
    const matches=indexedRows.get(row.key)||[];
    if(!matches.includes(row))matches.push(row);
    indexedRows.set(row.key,matches);
  }
  function tableExportMergeRows(allRows,previousBatch,currentBatch,indexedRows){
    const seenRows=indexedRows||new Map();
    if(!indexedRows)allRows.forEach(row=>tableExportIndexRow(seenRows,row));
    let overlap=0,overlapStart=0;
    if(previousBatch.length<=currentBatch.length
      &&previousBatch.every((row,index)=>tableExportRowsCompatible(row,currentBatch[index]))){
      overlap=previousBatch.length;
    }else{
      const max=Math.min(previousBatch.length,currentBatch.length);
      for(let size=max;size>0;size--){
        if(previousBatch.slice(-size).every((row,index)=>tableExportRowsCompatible(row,currentBatch[index]))){
          overlap=size;
          overlapStart=previousBatch.length-size;
          break;
        }
      }
    }
    const matchedRows=new Set(),matchedIndexes=new Set();
    if(overlap){
      for(let index=0;index<overlap;index++){
        const previous=previousBatch[overlapStart+index];
        const updated=currentBatch[index];
        const collected=(seenRows.get(previous.key)||[]).find(candidate=>!matchedRows.has(candidate)
          &&((previous.key.startsWith('data-id:')||previous.key.startsWith('data-row-key:'))
            ||tableExportRowsCompatible(candidate,previous)));
        if(!collected||!updated)continue;
        collected.values=collected.values.map((value,column)=>updated.values[column]||value);
        collected.key=updated.key;
        matchedRows.add(collected);
        matchedIndexes.add(index);
        tableExportIndexRow(seenRows,collected);
      }
    }
    for(let index=0;index<currentBatch.length;index++){
      if(matchedIndexes.has(index))continue;
      const row=currentBatch[index];
      const candidates=seenRows.get(row.key)||[];
      const duplicate=candidates.find(candidate=>!matchedRows.has(candidate)
        &&((row.key.startsWith('data-id:')||row.key.startsWith('data-row-key:'))
          ||tableExportRowsCompatible(candidate,row)));
      if(duplicate){
        duplicate.values=duplicate.values.map((value,column)=>row.values[column]||value);
        duplicate.key=row.key;
        matchedRows.add(duplicate);
        matchedIndexes.add(index);
        tableExportIndexRow(seenRows,duplicate);
      }else{
        allRows.push(row);
        matchedRows.add(row);
        matchedIndexes.add(index);
        tableExportIndexRow(seenRows,row);
      }
    }
  }
  function tableExportRowsCompatible(left,right){
    if(!left||!right||left.values.length!==right.values.length)return false;
    let matchingValue=false;
    for(let index=0;index<left.values.length;index++){
      const previous=String(left.values[index]||'').trim(),current=String(right.values[index]||'').trim();
      if(previous&&current){
        if(previous!==current)return false;
        matchingValue=true;
      }
    }
    return matchingValue;
  }
  function tableExportScroller(root,doc){
    const candidates=[root,...Array.from(root.querySelectorAll('*'))];
    for(let node=root.parentElement;node&&node!==doc.body;node=node.parentElement)candidates.push(node);
    for(const node of candidates){
      const style=doc.defaultView.getComputedStyle(node);
      const vertical=node.scrollHeight>node.clientHeight+20&&node.clientHeight>0&&/(auto|scroll|overlay)/.test(style.overflowY||style.overflow||'');
      if(vertical)return node;
    }
    const pageScroller=doc.scrollingElement;
    return pageScroller&&pageScroller.scrollHeight>pageScroller.clientHeight+1?pageScroller:null;
  }
  function tableExportSignature(rows){
    return rows.map(row=>`${row.key}:${JSON.stringify(row.values)}`).join('\u001e');
  }
  function tableExportBusy(root){
    return Array.from(root.querySelectorAll('[aria-busy="true"],[role="progressbar"],.ms-Spinner'))
      .some(tableExportVisible);
  }
  function tableExportWait(ms){
    return new Promise(resolve=>setTimeout(resolve,ms));
  }
  async function tableExportSettledRows(root,headerRow,headers){
    let rows=tableExportReadRows(root,headerRow,headers),signature=tableExportSignature(rows),stable=0;
    const started=Date.now();
    let lastMutation=started;
    let observer=null;
    try{
      const Observer=root.ownerDocument&&root.ownerDocument.defaultView
        ?root.ownerDocument.defaultView.MutationObserver:window.MutationObserver;
      if(typeof Observer==='function'){
        observer=new Observer(()=>{lastMutation=Date.now();});
        observer.observe(root,{childList:true,subtree:true,characterData:true,attributes:true});
      }
    }catch(_){}
    try{
      while(Date.now()-started<1500){
        await tableExportWait(60);
        const next=tableExportReadRows(root,headerRow,headers),nextSignature=tableExportSignature(next);
        if(nextSignature===signature&&!tableExportBusy(root)){
          stable++;
          if(stable>=2&&Date.now()-lastMutation>=180)break;
        }else{
          rows=next;signature=nextSignature;stable=0;
        }
      }
    }finally{if(observer)observer.disconnect();}
    return rows;
  }
  async function tableExportCapture(){
    if(!isTopFrame)return {ok:false,error:'Richiesta disponibile solo nel contesto principale.'};
    const documents=()=>{const out=[];const visit=win=>{try{if(!out.includes(win.document))out.push(win.document);for(let i=0;i<win.frames.length;i++)visit(win.frames[i]);}catch(_){}};visit(window);return out;};
    const resolve=()=>{
      const roots=documents().flatMap(tableExportRoots);
      if(!roots.length)throw new Error('Nessuna griglia principale visibile.');
      if(roots.length!==1)throw new Error('Più griglie indipendenti visibili: esportazione annullata.');
      const root=roots[0];
      const headerRow=tableExportRowElements(root).find(row=>row.querySelector('[role="columnheader"],th'));
      if(!headerRow)throw new Error('Intestazioni della griglia non riconoscibili.');
      return {root,headerRow,x:saldoGridScroller(root,root.ownerDocument,'x'),y:saldoGridScroller(root,root.ownerDocument,'y')};
    };
    let context=resolve();
    const initialX=context.x?context.x.scrollLeft:0,initialY=context.y?context.y.scrollTop:0;
    const columns=new Map(),records=new Map(),ariaOwners=new Map(),physicalRows=new Map();
    let xWindows=0,yWindows=0,complete=false,stopReason='scan-incomplete';
    const signature=ctx=>JSON.stringify([ctx.x&&ctx.x.scrollLeft,ctx.y&&ctx.y.scrollTop,tableExportRowElements(ctx.root).map(r=>[r.getAttribute('data-id'),r.getAttribute('data-row-key'),r.getAttribute('aria-rowindex'),tableExportCellElements(r).map(tableExportCellText)])]);
    const settle=async()=>{let previous='',stable=0,lastMutation=Date.now(),observer;for(let attempt=0;attempt<30;attempt++){context=resolve();try{observer=new MutationObserver(()=>{lastMutation=Date.now()});observer.observe(context.root,{subtree:true,childList:true,characterData:true,attributes:true});}catch(_){}await tableExportWait(60);context=resolve();const next=signature(context);if(next===previous&&!tableExportBusy(context.root)&&Date.now()-lastMutation>=120){if(++stable>=2){if(observer)observer.disconnect();return;}}else{previous=next;stable=0;}if(observer)observer.disconnect();}throw new Error('Mancata stabilizzazione della griglia.');};
    const captureWindow=(verticalWindow)=>{
      const headers=tableExportCellElements(context.headerRow).filter(c=>c.matches('[role="columnheader"],th')&&tableExportVisible(c));
      const visibleColumns=[];
      headers.forEach((cell,pos)=>{const raw=Number(cell.getAttribute('aria-colindex'));const index=Number.isInteger(raw)&&raw>0?raw-1:tableExportCellIndex(cell,pos);const caption=cell.querySelector('.columncaption');const name=String(tableExportCellText(caption||cell)||cell.getAttribute('aria-label')||cell.getAttribute('title')||'').trim()||`Colonna ${index+1}`;columns.set(index,name);visibleColumns.push({index,cell,pos});});
      const rows=tableExportRowElements(context.root).filter(r=>r!==context.headerRow&&!r.querySelector('[role="columnheader"],th'));
      rows.forEach((row,rowPos)=>{const dataId=row.getAttribute('data-id'),rowKey=row.getAttribute('data-row-key'),aria=Number(row.getAttribute('aria-rowindex'));let id,strategy;if(dataId){id=`data-id:${dataId}`;strategy='data-id';}else if(rowKey){id=`data-row-key:${rowKey}`;strategy='data-row-key';}else if(Number.isInteger(aria)&&aria>0){id=`aria-rowindex:${aria}`;strategy='aria-rowindex';const prior=ariaOwners.get(aria);if(prior&&prior!==id)throw new Error('Identità riga incoerente.');ariaOwners.set(aria,id);}else{const scrollerRect=context.y&&context.y.getBoundingClientRect?context.y.getBoundingClientRect():null;const rowRect=row.getBoundingClientRect?row.getBoundingClientRect():null;const absolute=context.y&&scrollerRect&&rowRect?Math.round(context.y.scrollTop+rowRect.top-scrollerRect.top):rowPos;const physicalKey=`absolute:${absolute}`;id=physicalRows.get(physicalKey)||`physical:${absolute}`;physicalRows.set(physicalKey,id);strategy='vertical-absolute-position';}
        let record=records.get(id);if(!record){record={values:new Map(),strategy};records.set(id,record);}const cells=tableExportCellElements(row);visibleColumns.forEach(col=>{const byAria=cells.find(c=>Number(c.getAttribute('aria-colindex'))===col.index+1);const byIndex=cells.find(c=>Number(c.cellIndex)===Number(col.cell.cellIndex));const cell=byAria||byIndex||cells[col.pos];if(!cell)return;const value=tableExportCellText(cell);const old=record.values.get(col.index);if(old&&value&&old!==value)throw new Error('Associazione incoerente tra riga e colonna.');if(!old||!String(old).trim())record.values.set(col.index,value);});
      });
    };
    try{
      if(context.y)context.y.scrollTop=0;if(context.x)context.x.scrollLeft=0;
      let yBottomStable=0;
      for(let vy=0;vy<1000;vy++){
        yWindows++;context=resolve();if(context.x)context.x.scrollLeft=0;let xNoProgress=0;
        for(let hx=0;hx<1000;hx++){
          await settle();context=resolve();xWindows++;captureWindow(vy);
          if(!context.x)break;const maxX=Math.max(0,context.x.scrollWidth-context.x.clientWidth);if(context.x.scrollLeft>=maxX-2)break;
          const before=context.x.scrollLeft,beforeSig=signature(context);context.x.scrollLeft=Math.min(maxX,before+Math.max(1,Math.floor(context.x.clientWidth*.72)));await settle();context=resolve();
          if(context.x.scrollLeft<=before+1&&signature(context)===beforeSig){if(++xNoProgress>=3)throw new Error('Mancato avanzamento orizzontale.');}else xNoProgress=0;
          if(hx===999)throw new Error('Limite finestre orizzontali raggiunto.');
        }
        context=resolve();if(!context.y){complete=true;stopReason='static-grid';break;}const oldHeight=context.y.scrollHeight,maxY=Math.max(0,oldHeight-context.y.clientHeight);if(context.y.scrollTop>=maxY-2){await settle();context=resolve();const grew=context.y.scrollHeight>oldHeight+1;if(grew||tableExportBusy(context.root)){yBottomStable=0;continue;}if(++yBottomStable>=3){complete=true;stopReason='vertical-boundary';break;}continue;}
        yBottomStable=0;const before=context.y.scrollTop,beforeSig=signature(context);context.y.scrollTop=Math.min(maxY,before+Math.max(80,Math.floor(context.y.clientHeight*.55)));await settle();context=resolve();if(context.y.scrollTop<=before+1&&signature(context)===beforeSig)throw new Error('Mancato avanzamento verticale.');if(vy===999)throw new Error('Limite finestre verticali raggiunto.');
      }
      const order=[...columns.keys()].sort((a,b)=>a-b);const rows=[...records.values()].map(r=>order.map(i=>r.values.get(i)||''));const retained=order.filter(i=>!/^Colonna \d+$/.test(columns.get(i))||rows.some(r=>String(r[order.indexOf(i)]||'').trim()));
      bcDiagnostic('table-export-grid-scan',{verticalWindows:yWindows,horizontalWindows:xWindows,logicalRows:records.size,columns:columns.size,stopReason,complete});
      return {ok:true,headers:retained.map(i=>columns.get(i)),rows:rows.map(r=>retained.map(i=>r[order.indexOf(i)]||'')),complete};
    }finally{
      try{context=resolve();if(context.y)context.y.scrollTop=initialY;if(context.x)context.x.scrollLeft=initialX;}catch(_){}
    }
  }
  chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
    if(!msg||msg.type!=='BC_TOOLS_EXPORT_LOADED_TABLE'||!isTopFrame)return;
    tableExportCapture().then(sendResponse,error=>sendResponse({ok:false,error:String(error&&error.message||'Esportazione non riuscita.').slice(0,200)}));
    return true;
  });
})();
