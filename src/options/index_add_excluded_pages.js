// ── DA APPENDERE IN FONDO A index.js ────────────────────────────────────────
// Blocco indipendente: gestisce solo il campo "Pagine escluse" del sort.
// Non tocca l'autosave esistente. Usa una chiave storage a se' (excludedPages),
// quindi non interferisce con gli altri set/get gia' presenti nella pagina.
//
// NOTA export/import: se vuoi che questa impostazione finisca anche nel JSON di
// esportazione, la chiave 'excludedPages' va aggiunta all'insieme di chiavi che
// il tuo export legge — quello sta dentro index.js, mandamelo e lo integro.
(function () {
  const el = document.getElementById('autoSortExcludedPages');
  if (!el) return;

  const KEY = 'excludedPages';
  const badge = document.getElementById('savedBadge');
  let t = null;

  // carica il valore salvato
  try {
    chrome.storage.sync.get({ [KEY]: '' }, (d) => {
      el.value = (d && d[KEY]) || '';
    });
  } catch (_) {}

  function flashSaved() {
    if (!badge) return;
    badge.classList.add('show');
    clearTimeout(flashSaved._t);
    flashSaved._t = setTimeout(() => badge.classList.remove('show'), 900);
  }

  // salva (debounce). Nello STORAGE va la forma normalizzata (solo ID, virgola);
  // nel campo lascio quello che digita l'utente per non far saltare il cursore.
  el.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const norm = String(el.value || '')
        .split(/[\s,;]+/)
        .map(s => s.trim())
        .filter(s => /^\d+$/.test(s))
        .join(', ');
      try { chrome.storage.sync.set({ [KEY]: norm }, flashSaved); } catch (_) {}
    }, 400);
  });

  // Alla perdita di focus riscrivo il campo nella forma pulita.
  el.addEventListener('blur', () => {
    const norm = String(el.value || '')
      .split(/[\s,;]+/)
      .map(s => s.trim())
      .filter(s => /^\d+$/.test(s))
      .join(', ');
    if (norm !== el.value) el.value = norm;
  });
})();
