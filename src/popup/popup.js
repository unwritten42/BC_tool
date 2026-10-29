const BC_DIAG_COMPONENT = 'popup';
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
bcDiagnostic('context-start', { document:'popup' });

const tiles = document.getElementById('tiles');

function getActivePageIdFromUrl() {
  try {
    const m = String(location.href || '').match(/[?&]page=(\d+)/i);
    return m ? Number(m[1]) : null;
  } catch (_) { return null; }
}

function setSaldoArticoloCommandVisibility(active, pageId) {
  const btn = document.getElementById('openSaldoArticolo');
  if (!btn) return;
  const shouldShow = !!active && pageId === 7318;
  btn.style.display = shouldShow ? '' : 'none';
}


function normalize(s){ return String(s || '').trim(); }
function escapeHtml(value){
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
}
async function getCfg(keys){
  const synced = await new Promise(resolve=> chrome.storage.sync.get(keys, resolve));
  if(!keys.includes('popupLayout') || !chrome.storage.local) return synced || {};
  const local = await new Promise(resolve=> chrome.storage.local.get(['popupLayout','bcToolsUiSettings'], resolve));
  const backup = local && local.bcToolsUiSettings && typeof local.bcToolsUiSettings === 'object' ? local.bcToolsUiSettings : {};
  const syncedLayout = synced && (synced.popupLayout === 'vertical' || synced.popupLayout === 'a') ? synced.popupLayout : '';
  const fallbackLayout = backup.popupLayout || (local && local.popupLayout);
  const localLayout = fallbackLayout === 'vertical' || fallbackLayout === 'a' ? fallbackLayout : '';
  const localTheme = backup.uiTheme === 'dark' || backup.uiTheme === 'light' ? backup.uiTheme : '';
  return Object.assign({}, synced || {}, syncedLayout ? {popupLayout:syncedLayout} : localLayout ? {popupLayout:localLayout} : {}, localTheme ? {uiTheme:localTheme} : {});
}

// ---------- UI helpers (toast + modal) ----------
// Il tema scuro è definito in popup.css (variabili sotto .theme-dark):
// niente più CSS iniettato con colori hardcoded.

let __toastTimer = null;
function showToast(msg, ms=2600){
  const el = document.getElementById('toast');
  if(!el) return;
  el.textContent = msg;
  el.classList.add('show');
  if(__toastTimer) clearTimeout(__toastTimer);
  __toastTimer = setTimeout(()=> el.classList.remove('show'), ms);
}

async function checkForUpdates(){
  const notice = document.getElementById('updateNotice');
  const message = document.getElementById('updateMessage');
  const changes = document.getElementById('updateChanges');
  if(!notice || !message || !changes) return;

  try{
    const update = await BcToolsUpdateCheck.check(chrome.runtime.getManifest().version);
    if(!update) return;
    message.textContent = `È disponibile la versione ${update.version}.`;
    changes.href = update.changesUrl;
    changes.hidden = false;
    notice.hidden = false;
  }catch(error){
    bcDiagnostic('update-check-failed', {
      reason:String(error && error.message || 'update-check-failed').slice(0,120)
    });
    message.textContent = 'Impossibile controllare gli aggiornamenti.';
    changes.hidden = true;
    notice.hidden = false;
  }
}
checkForUpdates();

function safeDecodeCompany(v){
  try{ return decodeURIComponent(v||''); }catch(_){ return v||''; }
}
function normalizeCompany(v){ return (safeDecodeCompany(v)||'').trim(); }

async function buildBusinessCentralUrl(options, component){
  try{
    const context = await BcToolsUrlContext.resolve();
    return BcToolsUrlContext.build(context, options);
  }catch(error){
    BcToolsUrlContext.reportError(component, error);
    return '';
  }
}
async function openBusinessCentralUrl(url, component){
  try{
    await chrome.tabs.create({url});
  }catch(_){
    BcToolsUrlContext.reportError(component, {code:'tab-open-failed'});
    alert('Impossibile aprire la scheda Business Central.');
  }
}

// Mini-popup con l'elenco delle tabelle salvate: click = apre table=ID.
function openTablesModal(cfg){
  const overlay = document.getElementById('tablesModal');
  const listEl = document.getElementById('tablesList');
  const closeBtn = document.getElementById('tablesClose');
  if(!overlay || !listEl || !closeBtn) return;

  const groupHtml = (title, arr)=>{
    const items = (arr || []).filter(it=> it && it.label && it.table);
    if(!items.length) return '';
    return `<div class="modal-line" style="font-weight:700;margin-top:8px;margin-bottom:2px">${escapeHtml(title)}</div>` +
           items.map(it=> `<button class="tblItem btn" data-table="${escapeHtml(String(it.table).trim())}">${escapeHtml(it.label)}</button>`).join('');
  };

  const classic = groupHtml('Classiche', cfg.quickTables);
  if(!classic){
    listEl.innerHTML = `<div class="modal-line">Nessuna tabella salvata. Aggiungile nelle Opzioni.</div>`;
  } else {
    listEl.innerHTML = classic;
  }

  const onListClick = async (e)=>{
    const b = e.target.closest('.tblItem'); if(!b) return;
    const tid = (b.dataset.table || '').trim(); if(!tid) return;
    const url = await buildBusinessCentralUrl({set:{table:tid},remove:['page','filter','mode','dc','bookmark'],hash:''}, 'saved-table');
    if(!url){ alert('Apri una scheda Business Central valida prima di aprire una tabella.'); return; }
    await openBusinessCentralUrl(url, 'saved-table');
  };

  const cleanup = ()=>{
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden','true');
    listEl.removeEventListener('click', onListClick);
    closeBtn.removeEventListener('click', cleanup);
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e)=>{ if(e.key==='Escape') cleanup(); };

  listEl.addEventListener('click', onListClick);
  closeBtn.addEventListener('click', cleanup);
  document.addEventListener('keydown', onKey, true);

  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden','false');
}

// ---------- Page info extraction ----------
function extractPageId(url){
  try{
    const u = new URL(url);
    const usp = new URLSearchParams(u.search);
    const candidates = [usp.get('page'), usp.get('Page'), usp.get('pageId'), usp.get('pageid')].filter(Boolean);
    const raw = candidates[0] || '';
    const m = raw.match(/\d+/);
    return m ? m[0] : '';
  }catch(_){
    return '';
  }
}

function extractPageLabelFromTabTitle(title){
  const t = (title||'').trim();
  if(!t) return '';
  const parts = t.split(' - ').map(s=>s.trim()).filter(Boolean);
  if(parts.length === 0) return '';
  const last = parts[parts.length-1].toLowerCase();
  if(last.includes('business central')){
    if(parts.length >= 2) return parts[parts.length-2];
  }
  return parts[0];
}

async function writePageIdAndLabelToOptions(pageId, label){
  if(!pageId) return false;
  const data = await new Promise(res=> chrome.storage.sync.get(['quickFilters'], res));
  const qf = Array.isArray(data.quickFilters) ? data.quickFilters : [];

  let idx = qf.findIndex(it => it && (!it.page || String(it.page).trim()===''));
  const patch = (it)=>{
    const out = Object.assign({}, it||{});
    out.page = String(pageId);
    out.label = String(label||'').trim();
    if(out.astLeft === undefined) out.astLeft = false;
    if(out.astRight === undefined) out.astRight = false;
    if(out.hideInPopup === undefined) out.hideInPopup = false;
    return out;
  };

  if(idx >= 0){
    qf[idx] = patch(qf[idx]);
  } else {
    qf.push({ label:String(label||'').trim(), page:String(pageId), field:'', astLeft:false, astRight:false, hideInPopup:false });
  }
  await new Promise(res=> chrome.storage.sync.set({ quickFilters: qf }, res));
  return true;
}

let tableExportOperation=null;
function openTableExport(context,tab){
  const overlay=document.getElementById('tableExportModal'), title=document.getElementById('tableExportTitle'), status=document.getElementById('tableExportStatus'), loaded=document.getElementById('tableExportLoaded'), cancel=document.getElementById('tableExportCancel');
  if(!overlay||!title||!status||!loaded||!cancel||tableExportOperation)return;
  const operation={cancelled:false,busy:false,tabId:tab.id,url:tab.url}; tableExportOperation=operation;
  title.textContent=`Esporta tabella ${context.tableId}`; status.textContent='Scegli la modalità di esportazione.'; loaded.textContent='Righe caricate';
  overlay.classList.add('show'); overlay.setAttribute('aria-hidden','false'); title.focus();
  const close=()=>{ if(operation.busy){operation.cancelled=true;status.textContent='Annullamento in corso…';return;} cleanup(); };
  const cleanup=()=>{ overlay.classList.remove('show');overlay.setAttribute('aria-hidden','true');loaded.removeEventListener('click',run);cancel.removeEventListener('click',close);overlay.removeEventListener('click',backdrop);document.removeEventListener('keydown',key,true);tableExportOperation=null;try{document.getElementById('openTableExport').focus();}catch(_){} };
  const key=e=>{if(e.key==='Escape')close();}; const backdrop=e=>{if(e.target===overlay)close();};
  const run=async()=>{ if(operation.busy)return; operation.busy=true;loaded.disabled=true;status.textContent='Scansione della griglia e caricamento delle righe raggiungibili…';
    try{
      const current=(await new Promise(r=>chrome.tabs.query({active:true,currentWindow:true},r))||[])[0];
      if(!current||current.id!==operation.tabId||current.url!==operation.url)throw new Error('La scheda o la navigazione è cambiata.');
      const result=await new Promise((resolve,reject)=>chrome.tabs.sendMessage(operation.tabId,{type:'BC_TOOLS_EXPORT_LOADED_TABLE',tableId:context.tableId},{frameId:0},response=>{const e=chrome.runtime.lastError;if(e)reject(new Error('Pagina non disponibile.'));else resolve(response);}));
      if(operation.cancelled)return; if(!result||!result.ok)throw new Error(result&&result.error||'Impossibile acquisire la tabella.');
      status.textContent=`Righe acquisite: ${result.rows.length}. ${result.complete?'Scansione della griglia completata.':'Esportazione parziale: alcune righe potrebbero non essere state caricate.'}`;
      loaded.textContent='Scarica XLSX'; loaded.disabled=false; operation.busy=false;
      loaded.removeEventListener('click',run); loaded.addEventListener('click',()=>{
        if(operation.busy||operation.cancelled)return;
        operation.busy=true;
        try{
          const bytes=BcToolsXlsxLocal.workbookBytes(result.headers,result.rows,`Table ${context.tableId}`);
          const stamp=BcToolsXlsxLocal.timestamp(new Date()),company=BcToolsXlsxLocal.safeFilePart(context.company);
          const name=`Table_${context.tableId}${company?'_'+company:''}_${stamp}.xlsx`;
          BcToolsXlsxLocal.download(bytes,name);
          cleanup();
          setTimeout(()=>window.close(),1500);
        }catch(error){
          operation.busy=false;
          status.textContent=String(error&&error.message||'Download non riuscito.');
        }
      },{once:true});
    }catch(error){operation.busy=false;loaded.disabled=false;status.textContent=String(error&&error.message||'Esportazione non riuscita.');}
  };
  loaded.addEventListener('click',run);cancel.addEventListener('click',close);overlay.addEventListener('click',backdrop);document.addEventListener('keydown',key,true);
}

(async function render(){
  const cfg = await getCfg(['quickFilters','uiTheme','visualStyle','popupLayout','quickTables','enableTableExport','saldoArticoloMovimentiWarehouse']);
  const TARGET_ZPL_PAGE = '5107911';
  let activeTab = null;
  try {
    const tabs = await new Promise(res => chrome.tabs.query({active:true, currentWindow:true}, res));
    activeTab = (tabs && tabs[0]) || null;
  } catch (_) {}
  const activePageId = activeTab && activeTab.url ? extractPageId(activeTab.url) : '';
  function tableExportContext(url){
    try {
      const u=new URL(url); if(u.origin!=='https://businesscentral.dynamics.com') return null;
      const values=u.searchParams.getAll('table'); if(values.length!==1 || !/^[1-9]\d*$/.test(values[0])) return null;
      const parts=u.pathname.split('/').filter(Boolean);
      return {tableId:values[0],tenant:parts[0]||'',environment:parts[1]||'',company:normalizeCompany(u.searchParams.get('company')||'')};
    } catch(_) { return null; }
  }
  const exportContext=cfg.enableTableExport && activeTab && activeTab.url ? tableExportContext(activeTab.url) : null;
  const exportAction=document.getElementById('tableExportAction');
  const exportTrigger=document.getElementById('openTableExport');
  if(exportAction) exportAction.hidden=!exportContext;
  if(exportContext && exportTrigger) exportTrigger.addEventListener('click',()=>openTableExport(exportContext,activeTab));
  const zplButton = document.getElementById('openZplFromPage');
  if (zplButton) zplButton.hidden = activePageId !== TARGET_ZPL_PAGE;
  const theme = (cfg.uiTheme || 'light');
  const visualStyle = cfg.visualStyle === 'classic' ? 'classic' : 'modern';
  const popupLayout = (cfg.popupLayout === 'vertical') ? 'vertical' : 'a';
  const modernStyle = document.getElementById('modernStyle');
  const classicStyle = document.getElementById('classicStyle');
  if(modernStyle) modernStyle.disabled = visualStyle !== 'modern';
  if(classicStyle) classicStyle.disabled = visualStyle !== 'classic';
  document.documentElement.classList.toggle('theme-dark', theme==='dark');
  document.documentElement.classList.toggle('popup-layout-a', popupLayout === 'a');
  document.documentElement.classList.toggle('popup-layout-vertical', popupLayout === 'vertical');

  const saldoActive = !!cfg.saldoArticoloMovimentiWarehouse;
  const showSaldoButton = saldoActive && activePageId === '7318';
  const saldoAction = document.getElementById('saldoArticoloAction');
  const saldoButton = document.getElementById('openSaldoArticolo');
  if(saldoAction) saldoAction.hidden = !showSaldoButton;
  if(saldoButton && showSaldoButton){
    saldoButton.addEventListener('click',async()=>{
      bcDiagnostic('saldo-command-clicked', { pageId: activePageId });
      let timeoutId;
      try{
        const request = new Promise((resolve,reject)=>{
          try{
            chrome.runtime.sendMessage({ type:'BC_TOOLS_SALDO_ARTICOLO' },response=>{
              if(chrome.runtime.lastError){ reject({code:'message-error'}); return; }
              resolve(response);
            });
            bcDiagnostic('saldo-message-sent', {});
          }catch(_){ reject({code:'message-error'}); }
        });
        const timeout = new Promise((_,reject)=>{
          timeoutId = setTimeout(()=>reject({code:'timeout'}),30000);
        });
        const response = await Promise.race([request,timeout]);
        if(!response) throw {code:'empty-response'};
        const knownErrors = ['wrong-page','running','grid-not-found','required-columns-missing','no-scroller','header-row-not-found','view-changed','cancelled','no-active-tab','content-script-unavailable','active-tab-query-failed','empty-response','relay-failed','command-failed'];
        const diagnosticError = knownErrors.includes(response.error) ? response.error : response.error ? 'other' : null;
        bcDiagnostic('saldo-response-received', { ok:!!response.ok, error:diagnosticError });
        if(response.started){
          window.close();
          return;
        }
        if(!response.ok){
          const feedback = {
            'wrong-page':'Apri la pagina Movimenti warehouse (7318) per usare Saldo articolo.',
            running:'Saldo articolo già in aggiornamento.',
            'no-active-tab':'Nessuna scheda attiva.',
            'content-script-unavailable':'BC_tools non è disponibile in questa scheda. Ricarica la pagina e riprova.',
            'active-tab-query-failed':'Impossibile verificare la scheda attiva. Riprova.',
            timeout:'Il comando Saldo articolo non ha risposto. Riprova.',
            'empty-response':'Il comando Saldo articolo non ha restituito un esito.',
            'grid-not-found':'Impossibile trovare la griglia Movimenti warehouse.',
            'required-columns-missing':'Colonne necessarie non trovate nella griglia'
          };
          showToast(feedback[response.error] || 'Impossibile completare il saldo articolo.',7000);
          return;
        }
      }catch(error){
        const reason = error && error.code || 'message-error';
        bcDiagnostic('saldo-command-error', { reason });
        const feedback = reason === 'timeout'
          ? 'Il comando Saldo articolo non ha risposto. Riprova.'
          : 'Impossibile avviare il saldo articolo.';
        showToast(feedback,7000);
      }finally{
        if(timeoutId) clearTimeout(timeoutId);
      }
    });
  }

  const filters = (cfg.quickFilters || []).filter(it=> it && it.label && it.page && it.field && !it.hideInPopup);
  const shown = filters;
  const totalTiles = 1 + shown.length;

  // La griglia (3 colonne fino a 12 tile) è definita in popup.css.
  tiles.className = `tiles-grid tiles-${totalTiles}`;

  const parts = [];
  if(popupLayout === 'a'){
    parts.push(`
      <section class="tile tv" aria-labelledby="tableViewerTitle">
        <div class="label" id="tableViewerTitle">Apri tabella</div>
        <div class="box">
          <label class="sr-only" for="tableId">ID tabella</label>
          <input type="text" id="tableId" placeholder="ID tabella" inputmode="numeric" autocomplete="off" />
          <button id="viewTable" class="btn primary">Apri</button>
          <button id="openSavedTables" class="btn secondary">Salvate</button>
        </div>
      </section>
    `);
    shown.forEach((it, idx)=>{
      const inputId = `qf_val_${idx}`;
      const btnId = `qf_btn_${idx}`;
      const title = String(it.label || '').trim();
      parts.push(`
        <section class="tile qf" aria-labelledby="${btnId}_title">
          <div class="title" id="${btnId}_title">${escapeHtml(title)}</div>
          <div class="box">
            <label class="sr-only" for="${inputId}">Valore per ${escapeHtml(title)}</label>
            <input id="${inputId}" type="text" placeholder="${escapeHtml(it.field)}">
            <button id="${btnId}" class="btn primary" aria-label="Cerca ${escapeHtml(title)}" title="Cerca ${escapeHtml(title)}"><img src="../../assets/vendor/lucide/search.svg" alt="" /></button>
          </div>
        </section>
      `);
    });
  } else {
    parts.push(`
      <section class="tile tv" aria-labelledby="tableViewerTitle">
        <div class="tile-header">
          <span class="tile-icon" aria-hidden="true"><img src="../../assets/vendor/lucide/table-2.svg" alt="" /></span>
          <div><div class="label" id="tableViewerTitle">Apri tabella</div></div>
        </div>
        <div class="box">
          <label class="sr-only" for="tableId">ID tabella</label>
          <input type="text" id="tableId" placeholder="ID tabella" inputmode="numeric" autocomplete="off" />
          <button id="viewTable" class="btn primary">Apri</button>
          <button id="openSavedTables" class="btn secondary">Tabelle salvate</button>
        </div>
      </section>
    `);
    shown.forEach((it, idx)=>{
      const inputId = `qf_val_${idx}`;
      const btnId = `qf_btn_${idx}`;
      const title = String(it.label || '').trim();
      parts.push(`
        <section class="tile qf" aria-labelledby="${btnId}_title">
          <div class="tile-header">
            <span class="tile-icon" aria-hidden="true"><img src="../../assets/vendor/lucide/search.svg" alt="" /></span>
            <div><div class="title" id="${btnId}_title">${escapeHtml(title)}</div><div class="tile-meta">Pagina ${escapeHtml(String(it.page).trim())} · ${escapeHtml(it.field)}</div></div>
          </div>
          <div class="box">
            <label class="sr-only" for="${inputId}">Valore per ${escapeHtml(title)}</label>
            <input id="${inputId}" type="text" placeholder="Valore da cercare">
            <button id="${btnId}" class="btn primary" aria-label="Cerca ${escapeHtml(title)}" title="Cerca ${escapeHtml(title)}"><img src="../../assets/vendor/lucide/search.svg" alt="" /></button>
          </div>
        </section>
      `);
    });
  }
  tiles.innerHTML = parts.join('');

  // Bind TV
  const tvInput = document.getElementById('tableId');
  const tvBtn = document.getElementById('viewTable');
  tvBtn.addEventListener('click', async ()=>{
    const tableID = tvInput.value.trim();
    if(!tableID){ alert('Inserisci un ID tabella.'); return; }
    if(!/^\d+$/.test(tableID)){ alert('Inserisci un ID tabella numerico.'); return; }

    const url = await buildBusinessCentralUrl({set:{table:tableID},remove:['page','filter','mode','dc','bookmark'],hash:''}, 'table-viewer');
    if(!url){ alert('Apri una scheda Business Central valida prima di aprire una tabella.'); return; }
    await openBusinessCentralUrl(url, 'table-viewer');
  });
  tvInput.addEventListener('keydown', e=>{ if(e.key==='Enter') tvBtn.click(); });

  // Mini-popup tabelle salvate
  document.getElementById('openSavedTables')?.addEventListener('click', ()=> openTablesModal(cfg));

  // Bind filters
  shown.forEach((it, idx)=>{
    const input = document.getElementById(`qf_val_${idx}`);
    const btn = document.getElementById(`qf_btn_${idx}`);
    const go = async ()=>{
      let v = input.value.trim(); if(!v) return;
      if (it.astLeft && !v.startsWith('*')) v = `*${v}`;
      if (it.astRight && !v.endsWith('*')) v = `${v}*`;

      const filterExpr = `'${it.field}' IS '${v.replace(/'/g, "''")}'`;
      const url = await buildBusinessCentralUrl({
        set:{page:String(it.page).trim(),filter:filterExpr},
        remove:['table','mode','dc','bookmark'],
        hash:'#bc-tools-open-single'
      }, 'popup-filter');
      if(!url) return alert('Apri una scheda Business Central valida prima di avviare la ricerca.');
      await openBusinessCentralUrl(url, 'popup-filter');
    };
    btn.addEventListener('click', go);
    input.addEventListener('keydown', e=>{ if(e.key==='Enter') go(); });
  });

  // ZPL Viewer contestuale per la pagina Layout etichetta stampa.
  zplButton?.addEventListener('click', async () => {
    let source;
    try { source = await BcToolsUrlContext.resolveTab(); }
    catch (error) {
      BcToolsUrlContext.reportError('zpl-viewer', error);
      showToast('Apri una scheda Business Central valida.', 5000);
      return;
    }
    const sourceTab = source.tab;
    const sourcePageId = extractPageId(source.url.href);
    if (!sourceTab || !sourceTab.id || sourcePageId !== TARGET_ZPL_PAGE) {
      showToast('Apri la pagina 5107911 di Business Central.');
      return;
    }
    zplButton.disabled = true;
    showToast('Lettura completa delle righe ZPL…', 5000);
    let handoffKey = '';
    try {
      const handoffToken = crypto.randomUUID();
      handoffKey = `bcToolsZplSourceContext:${handoffToken}`;
      const response = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(sourceTab.id, {
          type:'BC_TOOLS_SCAN_ZPL',
          expectedPageId:TARGET_ZPL_PAGE
        }, result => {
          const err = chrome.runtime.lastError;
          if (err) reject(new Error(err.message));
          else resolve(result);
        });
      });
      if (!response || !response.ok || !response.zpl) {
        throw new Error((response && response.error) || 'Nessun frame ha trovato la colonna “Stringa fissa”. Attendi il caricamento completo della tabella e riprova.');
      }
      await new Promise((resolve, reject) => {
        chrome.storage.session.set({ [handoffKey]:source.url.href }, () => {
          if (chrome.runtime.lastError) reject(new Error('Contesto ZPL non disponibile.'));
          else resolve();
        });
      });
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({
          bcToolsPendingZpl:{
            zpl:response.zpl,
            pageId:TARGET_ZPL_PAGE,
            rowsRead:response.rowsRead || 0,
            tableSnapshot:response.tableSnapshot || null,
            createdAt:Date.now()
          }
        }, () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve());
      });
      await chrome.tabs.create({ url:`${chrome.runtime.getURL('src/options/index.html')}?bcToolsContext=${encodeURIComponent(handoffToken)}#zpl` });
      window.close();
    } catch (error) {
      try {
        if(handoffKey) await chrome.storage.session.remove(handoffKey);
        await chrome.storage.local.remove('bcToolsPendingZpl');
      } catch (_) {}
      showToast(`ZPL non disponibile: ${error && error.message ? error.message : 'errore di lettura'}`, 7000);
    } finally {
      zplButton.disabled = false;
    }
  });

  // Header actions
  document.getElementById('addCurrentPageToSort')?.addEventListener('click', async ()=>{
    try{
      const source = await BcToolsUrlContext.resolveTab();
      const pageId = extractPageId(source.url.href);
      if(!pageId){
        showToast('La pagina corrente non contiene un Page ID.');
        return;
      }
      const data = await new Promise(res=> chrome.storage.sync.get({includedPages:'', includedPageNames:{}}, res));
      const ids = String((data && data.includedPages) || '').split(/[\s,;]+/)
        .map(v=>v.trim()).filter(v=>/^\d+$/.test(v));
      const alreadyIncluded = ids.includes(pageId);
      const next = [...new Set(ids.concat(pageId))]
        .sort((a,b)=>Number(a)-Number(b)).join(', ');
      const pageName = extractPageLabelFromTabTitle(source.tab.title) || `Page ${pageId}`;
      const includedPageNames = Object.assign({}, data && data.includedPageNames || {}, { [pageId]:pageName });
      await new Promise(res=> chrome.storage.sync.set({includedPages:next, includedPageNames}, res));
      showToast(alreadyIncluded
        ? `Pagina ${pageId} già presente nell'ordinamento automatico.`
        : `Pagina ${pageId} aggiunta all'ordinamento automatico.`);
    }catch(error){
      BcToolsUrlContext.reportError('autosort-page-capture', error);
      showToast('Impossibile aggiungere la pagina corrente.');
    }
  });
  document.getElementById('openOptions')?.addEventListener('click', ()=>{
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
  });

  document.getElementById('openBookmark')?.addEventListener('click', async ()=>{
    const url = await buildBusinessCentralUrl({set:{page:'8700'},remove:['table','filter','mode','dc','bookmark'],hash:''}, 'page-8700');
    if(!url){ alert('Apri una scheda Business Central valida prima di aprire la pagina 8700.'); return; }
    await openBusinessCentralUrl(url, 'page-8700');
  });

  // The crosshair captures only the Page ID and label from the active BC tab.
  document.getElementById('pickFromBC')?.addEventListener('click', async ()=>{
    try{
      const source = await BcToolsUrlContext.resolveTab();
      const pageId = extractPageId(source.url.href);
      if(!pageId){ alert('Nessun Page ID trovato nel link della scheda attiva.'); return; }

      const label = extractPageLabelFromTabTitle(source.tab.title) || `Page ${pageId}`;
      const ok = await writePageIdAndLabelToOptions(pageId, label);
      if(!ok){ alert('Non posso scrivere il Page ID (raggiunto il limite oppure nessuna riga disponibile).'); }
    }catch(error){
      BcToolsUrlContext.reportError('page-id-capture', error);
      showToast('Apri una scheda Business Central valida.');
    }
  });
})();
