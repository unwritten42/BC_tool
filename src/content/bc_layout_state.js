(function (root) {
  function fixLayoutState(raw, state = {}) {
    if (typeof raw !== 'string') return null;

    let obj;
    try {
      obj = JSON.parse(raw.trim());
    } catch (_) {
      return null;
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;

    let changed = false;
    const layoutTarget = state.layoutMode !== 'normal';
    const factboxTarget = state.factboxMode === 'open';
    if (state.layoutEnabled && obj.PageLayoutExpanded !== layoutTarget) {
      obj.PageLayoutExpanded = layoutTarget;
      changed = true;
    }
    if (state.factboxEnabled && obj.AsideAreaRightExpanded !== factboxTarget) {
      obj.AsideAreaRightExpanded = factboxTarget;
      changed = true;
    }

    return changed ? JSON.stringify(obj) : null;
  }

  function layoutToggleAction(control, state = {}) {
    if (control.closest?.('[inert],[aria-hidden="true"]')) return null;
    const label = `${control.getAttribute('aria-label') || ''} ${control.getAttribute('title') || ''}`
      .replace(/\s+/g, ' ').trim().toLowerCase();
    const shortcut = `${control.getAttribute('aria-keyshortcuts') || ''} ${label}`.replace(/\s/g, '').toLowerCase();
    const factbox = /fact\s?box|riquadro (?:informazioni|dettagli)|dettaglio informazioni|details pane/.test(label)
      || /_factBoxToggle$/i.test(control.getAttribute('id') || '') || shortcut.includes('alt+f2');
    const layout = !factbox && (shortcut.includes('ctrl+f12') || shortcut.includes('control+f12')
      || /layout ampio|wide layout/.test(label)
      || /(?:^|\s)ms-nav-layout-wide-toggle-button(?:\s|$)/.test(control.getAttribute('class') || '')
      || /\b(?:expand|collapse)(?: the)? page\b|\b(?:espandi|comprimi|riduci)(?: la)? pagina\b/.test(label));
    if ((!factbox && !layout) || (factbox ? !state.factboxEnabled : !state.layoutEnabled)) return null;
    const target = factbox ? state.factboxMode === 'open' : state.layoutMode !== 'normal';
    let expanded = control.getAttribute('aria-expanded') ?? control.getAttribute('aria-pressed') ?? control.getAttribute('aria-checked');
    if (expanded !== 'true' && expanded !== 'false') {
      if (/\b(?:hide|close|collapse|nascondi|chiudi|comprimi|riduci|reduce)\b/.test(label)) expanded = 'true';
      else if (/\b(?:show|open|expand|mostra|apri|espandi)\b/.test(label)) expanded = 'false';
      else return null;
    }
    return { kind:factbox ? 'factbox' : 'layout', click:(expanded === 'true') !== target };
  }

  function isShowMoreControl(control) {
    if (control.closest?.('[inert],[aria-hidden="true"]') || control.getAttribute('aria-expanded') === 'true') return false;
    const labels = [control.getAttribute('aria-label'), control.getAttribute('title'), control.innerText, control.textContent]
      .filter(Boolean).map(value => value.replace(/\s+/g, ' ').trim().toLowerCase());
    return labels.some(label => /^(?:mostra il resto|mostra di pi[uù]|show more|show the rest)(?:\s*\(\d+\))?$/.test(label));
  }

  function claimShowMoreAutoOpen(control, state, pageKey) {
    if (state.pageKey !== pageKey) {
      state.pageKey = pageKey;
      state.opened = false;
    }
    if (state.opened || !isShowMoreControl(control)) return false;
    state.opened = true;
    return true;
  }

  function showMorePageKey(href) {
    try {
      const url = new URL(href);
      const param = (...keys) => keys.map(key => url.searchParams.get(key)).find(value => value !== null) || '';
      return `${url.origin}${url.pathname}|${param('company', 'Company')}|${param('page', 'Page', 'pageId', 'pageid')}`;
    } catch (_) {
      return String(href || '');
    }
  }

  fixLayoutState.layoutToggleAction = layoutToggleAction;
  fixLayoutState.isShowMoreControl = isShowMoreControl;
  fixLayoutState.claimShowMoreAutoOpen = claimShowMoreAutoOpen;
  fixLayoutState.showMorePageKey = showMorePageKey;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = fixLayoutState;
  } else {
    root.bcToolsFixLayoutState = fixLayoutState;
  }
})(globalThis);
