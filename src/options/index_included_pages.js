// index_included_pages.js — aggiunta e rimozione guidata degli ID della allowlist.
(function () {
  'use strict';
  const listEl = document.getElementById('autoSortIncludedPagesList');
  const addEl = document.getElementById('autoSortPageToAdd');
  if (!listEl || !addEl) return;

  const KEY = 'includedPages';
  const FILTERS_KEY = 'quickFilters';
  const PAGE_NAMES_KEY = 'includedPageNames';
  const STANDARD_PAGE_NAMES = { '22': 'Clienti' };
  let pageNames = { ...STANDARD_PAGE_NAMES };
  const badge = document.getElementById('savedBadge');
  let committing = false;

  function idsFrom(raw) {
    return [...new Set(String(raw || '').split(/[\s,;]+/)
      .map(s => s.trim()).filter(s => /^\d+$/.test(s)))]
      .sort((a, b) => Number(a) - Number(b));
  }

  function cleanList(raw) { return idsFrom(raw).join(', '); }
  function updatePageNames(filters, storedNames) {
    pageNames = { ...STANDARD_PAGE_NAMES };
    if (storedNames && typeof storedNames === 'object' && !Array.isArray(storedNames)) {
      for (const [id, name] of Object.entries(storedNames)) {
        if (/^\d+$/.test(id) && String(name || '').trim()) pageNames[id] = String(name).trim();
      }
    }
    if (!Array.isArray(filters)) return;
    for (const item of filters) {
      const id = String(item && item.page || '').trim();
      const label = String(item && item.label || '').trim();
      if (/^\d+$/.test(id) && label) pageNames[id] = label;
    }
  }
  function pageTooltip(id) {
    const name = pageNames[id];
    return name ? `Pagina ${id} · ${name}` : `Pagina ${id} · nome non disponibile`;
  }

  function flashSaved() {
    if (!badge) return;
    badge.classList.add('show');
    clearTimeout(flashSaved._t);
    flashSaved._t = setTimeout(() => badge.classList.remove('show'), 900);
  }

  function render(raw) {
    listEl.replaceChildren();
    const ids = idsFrom(raw);
    if (!ids.length) {
      const empty = document.createElement('span');
      empty.className = 'included-pages-empty';
      empty.textContent = 'Nessuna pagina inclusa';
      listEl.appendChild(empty);
      return;
    }
    for (const id of ids) {
      const item = document.createElement('span');
      item.className = 'included-page-chip';
      item.setAttribute('role', 'listitem');
      item.tabIndex = 0;
      item.title = pageTooltip(id);
      item.setAttribute('aria-label', pageTooltip(id));

      const value = document.createElement('span');
      value.textContent = id;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'included-page-remove';
      remove.dataset.pageId = id;
      remove.setAttribute('aria-label', `Rimuovi pagina ${id}`);
      remove.title = `Rimuovi pagina ${id}`;
      remove.textContent = '×';

      item.append(value, remove);
      listEl.appendChild(item);
    }
  }

  function save(raw) {
    const next = cleanList(raw);
    try {
      chrome.storage.sync.set({ [KEY]: next }, () => {
        render(next);
        committing = false;
        flashSaved();
      });
    } catch (_) { committing = false; }
  }

  function loadList() {
    try {
      chrome.storage.sync.get({ [KEY]: '', [FILTERS_KEY]: [], [PAGE_NAMES_KEY]: {} }, d => {
        updatePageNames(d && d[FILTERS_KEY], d && d[PAGE_NAMES_KEY]);
        render(d && d[KEY]);
      });
    } catch (_) { render(''); }
  }

  function addPage() {
    if (committing) return;
    const id = String(addEl.value || '').replace(/\D+/g, '');
    addEl.value = '';
    if (!id) return;
    committing = true;
    try {
      chrome.storage.sync.get({ [KEY]: '' }, d => save(`${(d && d[KEY]) || ''},${id}`));
    } catch (_) { committing = false; }
  }

  function removePage(id) {
    if (committing || !/^\d+$/.test(id)) return;
    committing = true;
    try {
      chrome.storage.sync.get({ [KEY]: '' }, d => {
        const next = idsFrom(d && d[KEY]).filter(value => value !== id).join(', ');
        save(next);
      });
    } catch (_) { committing = false; }
  }

  addEl.addEventListener('input', () => {
    const digits = addEl.value.replace(/\D+/g, '');
    if (digits !== addEl.value) addEl.value = digits;
  });
  addEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addPage(); }
    else if (e.key === 'Tab') addPage();
  });
  addEl.addEventListener('blur', addPage);
  listEl.addEventListener('click', e => {
    const button = e.target.closest('.included-page-remove');
    if (button) removePage(button.dataset.pageId || '');
  });

  try {
    chrome.storage.onChanged.addListener((changes, ns) => {
      if (ns !== 'sync') return;
      if (changes[KEY] || changes[FILTERS_KEY] || changes[PAGE_NAMES_KEY]) {
        chrome.storage.sync.get({ [KEY]: '', [FILTERS_KEY]: [], [PAGE_NAMES_KEY]: {} }, d => {
          updatePageNames(d && d[FILTERS_KEY], d && d[PAGE_NAMES_KEY]);
          render(d && d[KEY]);
        });
      }
    });
  } catch (_) {}

  loadList();
})();
