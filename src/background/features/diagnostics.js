// diagnostics.js — gestione diagnostica background (BC_TOOLS_DIAGNOSTIC_APPEND)
(function(){
  'use strict';
  const DIAGNOSTIC_KEY = 'bcToolsDiagnostics';
  const DIAGNOSTIC_LIMIT = 1000;
  let diagnosticSaveChain = Promise.resolve();
  function safeDiagnosticDetails(value) {
    function sanitize(item, depth) {
      if (depth > 5) return '[depth-limit]';
      if (typeof item === 'string') {
        if (item.length > 1000) item = item.slice(0, 1000);
        try {
          const url = new URL(item);
          const page = url.searchParams.get('page');
          return `${url.origin}${url.pathname}${page ? `?page=${encodeURIComponent(page)}` : ''}`;
        } catch (_) { return item; }
      }
      if (Array.isArray(item)) return item.slice(0, 100).map(entry => sanitize(entry, depth + 1));
      if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).slice(0, 100).map(([key, entry]) => [key, sanitize(entry, depth + 1)]));
      return item;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    try { return sanitize(value, 0); } catch (_) { return { serializationError:true }; }
  }
  function diagnosticEntry(message, sender) {
    const raw = message && message.entry && typeof message.entry === 'object' ? message.entry : {};
    return {
      at: typeof raw.at === 'string' ? raw.at.slice(0, 40) : new Date().toISOString(),
      component: String(message && message.component || 'unknown').slice(0, 50),
      event: String(raw.event || 'unknown').slice(0, 120),
      details: safeDiagnosticDetails(raw.details),
      tabId: sender && sender.tab && Number.isInteger(sender.tab.id) ? sender.tab.id : null,
      frameId: sender && Number.isInteger(sender.frameId) ? sender.frameId : null
    };
  }
  function appendDiagnostic(message, sender) {
    const entry = diagnosticEntry(message, sender);
    const save = diagnosticSaveChain.then(async () => {
      const stored = await chrome.storage.local.get({ [DIAGNOSTIC_KEY]:[] });
      const entries = Array.isArray(stored[DIAGNOSTIC_KEY]) ? stored[DIAGNOSTIC_KEY] : [];
      entries.push(entry);
      await chrome.storage.local.set({ [DIAGNOSTIC_KEY]:entries.slice(-DIAGNOSTIC_LIMIT) });
    });
    diagnosticSaveChain = save.catch(() => {});
    return save;
  }
  function initBackgroundDiagnostics() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || message.type !== 'BC_TOOLS_DIAGNOSTIC_APPEND') return;
      appendDiagnostic(message, sender).then(
        () => sendResponse({ ok:true }),
        error => {
          sendResponse({ ok:false, error:error && error.message ? error.message : 'Log non salvato' });
        }
      );
      return true;
    });
  }
  self.bcToolsBackgroundDiagnostics = { initBackgroundDiagnostics, appendDiagnostic };
})();
