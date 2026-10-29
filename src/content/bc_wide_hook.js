// bc_wide_hook.js — hook Storage.prototype per intercettare letture/scritture BC
// Gestisce ENTRAMBI i campi:
//   PageLayoutExpanded     → Layout Wide/Normal
//   AsideAreaRightExpanded → FactBox Aperta/Chiusa
// Attivato da bc_enhance.js tramite window.__BC_TOOLS_STATE__
// NON usare CSS wide né Ctrl+F12. NON hardcodare user/env.
(() => {
  const origSet = Storage.prototype.setItem;
  const origGet = Storage.prototype.getItem;

  function isLayoutKey(key) {
    return typeof key === 'string' && key.toLowerCase().includes(':layout:');
  }

  function getState() {
    return window.__BC_TOOLS_STATE__ || {};
  }

  function tweak(raw) {
    const st = getState();
    const layoutEnabled  = !!st.layoutEnabled;
    const factboxEnabled = !!st.factboxEnabled;
    if (!layoutEnabled && !factboxEnabled) return raw;
    if (typeof raw !== 'string') return raw;
    const s = raw.trim();
    if (!s.startsWith('{')) return raw;

    try {
      const obj = JSON.parse(s);
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return raw;

      let changed = false;

      if (layoutEnabled) {
        const target = (st.layoutMode === 'normal') ? false : true;
        if (obj.PageLayoutExpanded !== target) { obj.PageLayoutExpanded = target; changed = true; }
      }

      if (factboxEnabled) {
        const target = (st.factboxMode === 'closed') ? false : true;
        if (obj.AsideAreaRightExpanded !== target) { obj.AsideAreaRightExpanded = target; changed = true; }
      }

      return changed ? JSON.stringify(obj) : raw;
    } catch {
      return raw;
    }
  }

  Storage.prototype.setItem = function (key, value) {
    if (isLayoutKey(key)) value = tweak(String(value));
    return origSet.call(this, key, value);
  };

  Storage.prototype.getItem = function (key) {
    const val = origGet.call(this, key);
    if (isLayoutKey(key)) return tweak(val);
    return val;
  };

  // Applica a tutte le chiavi esistenti (chiamato da bc_enhance.js)
  window.__BC_TOOLS_APPLY_NOW__ = function () {
    try {
      for (const k of Object.keys(localStorage)) {
        if (!isLayoutKey(k)) continue;
        const v = origGet.call(localStorage, k);
        const nv = tweak(v);
        if (nv !== v) origSet.call(localStorage, k, nv);
      }
    } catch {}
  };
})();
