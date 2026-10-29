// bc_wide_click.js — ESPERIMENTO: forza il layout "wide" cliccando il toggle,
// con la stessa filosofia di bc_autosort.js (osservo il DOM, leggo lo stato,
// clicco se serve, aspetto che lo stato CAMBI davvero, con un cap ai click).
//
// Perche' e' piu' difficile del sort:
//  1) il sort ha un bersaglio DOM ovvio (il link dell'header colonna); il toggle
//     wide va INDIVIDUATO: la selector cambia per versione/lingua di BC.
//  2) lo stato "sono in wide?" non ha un aria-* affidabile ovunque, quindi qui
//     lo stimo dalla GEOMETRIA (larghezza del contenuto vs viewport).
//  3) il wide e' uno stato globale, non per-griglia: basta agire una volta per
//     "vista" e ripetere dopo un re-render/navigazione.
//
// PRIMA DI FIDARSI: confermare CLICK_SELECTORS col probe in console. Finche' il
// toggle non viene trovato, il file non fa nulla (no-op sicuro).
//
// CONFLITTO: se in Opzioni e' attivo "Layout" (bc_enhance.js forza il wide via
// localStorage), i due meccanismi si contendono lo stato. Per testare questo
// approccio, disattiva "Layout".
//
// ATTIVAZIONE (finche' non c'e' una checkbox nelle Opzioni):
//   chrome.storage.sync.set({ wideByClick: true })

(function () {
  'use strict';

  const WIDE_DEFAULTS = { wideByClick: false };

  const DEBOUNCE_MS = 300;
  const POLL_MS     = 150;
  const CHANGE_MS   = 4000;
  const MAX_CLICKS  = 2;      // narrow → wide dovrebbe costare 1 click
  const WIDE_RATIO  = 0.92;   // contenuto >= 92% del viewport ⇒ lo consideriamo wide

  // ⇩⇩ DA CONFERMARE col probe: selector del pulsante che allarga/restringe.
  const CLICK_SELECTORS = [
    // esempi ipotetici, da sostituire con quello reale:
    // '[data-control-name="toggleFullWidth"]',
    // 'button[aria-label*="larghezza" i]',
    // 'button[aria-label*="full width" i]',
  ];

  let enabled   = false;
  let observer  = null;
  let debounceT = null;
  let busy      = false;
  let clicks    = 0;
  let lastKey   = '';   // "firma" della vista corrente (azzera i click dopo navigazione)

  function viewKey() {
    try {
      const href = (window.top && window.top.location) ? window.top.location.href : location.href;
      return href.split('#')[0];
    } catch (_) { return location.href.split('#')[0]; }
  }

  function findToggle() {
    for (const sel of CLICK_SELECTORS) {
      try { const el = document.querySelector(sel); if (el) return el; } catch (_) {}
    }
    return null;
  }

  // Stato via geometria: il contenitore principale occupa quasi tutto il viewport?
  // (piu' robusto che indovinare aria-*/classi, che cambiano per versione)
  function isWideNow() {
    const main = document.querySelector('[role="main"]') || document.querySelector('main') || document.body;
    if (!main) return null;
    const w  = main.getBoundingClientRect().width;
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    if (!w || !vw) return null;
    return (w / vw) >= WIDE_RATIO;
  }

  function waitForWideChange(before) {
    return new Promise(resolve => {
      const t0 = Date.now();
      (function poll() {
        const now = isWideNow();
        if (now !== null && now !== before) return resolve(now);
        if (Date.now() - t0 > CHANGE_MS) return resolve(null);
        setTimeout(poll, POLL_MS);
      })();
    });
  }

  async function scanOnce() {
    if (!enabled || busy) return;
    busy = true;
    try {
      const key = viewKey();
      if (key !== lastKey) { lastKey = key; clicks = 0; }   // nuova vista: ricomincia

      const wide = isWideNow();
      if (wide === true) return;             // gia' wide: nulla da fare
      if (clicks >= MAX_CLICKS) return;      // basta insistere

      const btn = findToggle();
      if (!btn) return;                      // toggle non individuato: no-op sicuro

      const before = wide;                   // false o null
      clicks++;
      try { btn.click(); } catch (_) { return; }
      await waitForWideChange(before);       // aspetta il cambio reale (o timeout)
    } finally {
      busy = false;
    }
  }

  function schedule() {
    clearTimeout(debounceT);
    debounceT = setTimeout(scanOnce, DEBOUNCE_MS);
  }

  function start() {
    if (observer) return;
    observer = new MutationObserver(schedule);
    try { observer.observe(document.documentElement || document, { childList: true, subtree: true }); } catch (_) {}
    schedule();
  }

  function stop() {
    if (observer) { observer.disconnect(); observer = null; }
    clearTimeout(debounceT);
  }

  function apply(s) {
    const want = !!(s && s.wideByClick);
    if (want === enabled) return;
    enabled = want;
    if (enabled) start(); else stop();
  }

  function init() {
    try { chrome.storage.sync.get(WIDE_DEFAULTS, apply); } catch (_) {}
    try {
      chrome.storage.onChanged.addListener((c, ns) => {
        if (ns !== 'sync') return;
        chrome.storage.sync.get(WIDE_DEFAULTS, apply);
      });
    } catch (_) {}
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
