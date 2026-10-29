// bc_diagnostic.js — utility condivisa per inviare eventi diagnostici
// senza cambiare schema messaggi/payload esistenti.
(function () {
  'use strict';

  const BC_DIAG_TYPE = 'BC_TOOLS_DIAGNOSTIC_APPEND';

  function nowIso() {
    try { return new Date().toISOString(); } catch (_) { return String(Date.now()); }
  }

  function sendDiagnostic({ component, event, details }) {
    try {
      chrome.runtime.sendMessage({
        type: BC_DIAG_TYPE,
        component: String(component || ''),
        entry: { at: nowIso(), event: String(event || 'unknown'), details: details || {} },
      }, () => { void chrome.runtime.lastError; });
    } catch (_) {
      // diagnostica non bloccante
    }
  }

  function bcDiagnosticTarget(target) {
    const el = target && target.closest ? target.closest('button,a,input,select,textarea,[role="button"]') : null;
    if (!el) return null;
    return {
      tag: String(el.tagName || '').toLowerCase(),
      id: String(el.id || '').slice(0, 80),
      type: String(el.type || '').slice(0, 30),
      role: String(el.getAttribute && el.getAttribute('role') || '').slice(0, 30),
    };
  }

  function installUiDiagnosticListeners({ component }) {
    document.addEventListener('click', (event) => {
      const target = bcDiagnosticTarget(event.target);
      if (target) sendDiagnostic({ component, event: 'ui-click', details: target });
    }, true);

    document.addEventListener('change', (event) => {
      const target = bcDiagnosticTarget(event.target);
      if (target) sendDiagnostic({ component, event: 'ui-change', details: target });
    }, true);

    document.addEventListener('submit', (event) => {
      const target = bcDiagnosticTarget(event.target) || {};
      sendDiagnostic({ component, event: 'ui-submit', details: target });
    }, true);

    window.addEventListener('error', (event) => {
      sendDiagnostic({
        component,
        event: 'runtime-error',
        details: {
          message: String(event.message || '').slice(0, 300),
          file: String(event.filename || '').split('/').pop(),
          line: event.lineno || null,
          column: event.colno || null,
        },
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      sendDiagnostic({
        component,
        event: 'unhandled-rejection',
        details: {
          reason: String(event.reason && event.reason.message || event.reason || '').slice(0, 300),
        },
      });
    });

    sendDiagnostic({ component, event: 'context-start', details: { document: (component || '') } });
  }

  // Espone in window per uso in altri file (senza modifcare l'interfaccia esistente).
  window.bcToolsDiagnostic = {
    sendDiagnostic,
    bcDiagnosticTarget,
    installUiDiagnosticListeners,
  };
})();
