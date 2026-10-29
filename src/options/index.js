// Options page script (MV3): Force Layout + Force FactBox persistence (autosave).
(function(){
  // diagnostica UI condivisa
  const BC_DIAG_COMPONENT = 'options';
  const optionsRuntimeGuard = (()=>{
    const TIMEOUT_MS=2500;
    const documentName=location.pathname.split('/').pop() || '/';
    const nativeRuntime=typeof chrome!=='undefined' && chrome.runtime ? chrome.runtime : null;
    const nativeStorage=typeof chrome!=='undefined' && chrome.storage ? chrome.storage : null;
    const loadedId=(()=>{try{return nativeRuntime&&nativeRuntime.id||'';}catch(_){return '';}})();
    const version=(()=>{try{return String(nativeRuntime&&nativeRuntime.getManifest().version||'');}catch(_){return '';}})();
    let state='checking',checkPromise=null,reloadRequested=false,reloadTimer=null,lastChecked=0;
    const normalizedError=error=>{
      const message=String(error&&error.message||error||'unknown').slice(0,180);
      const invalid=!loadedId||/extension context invalidated|context invalidated|cannot access a chrome|runtime\.id/i.test(message)
        ||(()=>{try{return !nativeRuntime||nativeRuntime.id!==loadedId;}catch(_){return true;}})();
      return {message,type:invalid?'context-invalid':'operation-error',invalid};
    };
    const diagnostic=(event,operation,phase,error)=>{
      try{
        if(!nativeRuntime||!nativeRuntime.sendMessage||state==='reloading')return;
        // window.bcToolsDiagnostic is provided by shared bc_diagnostic.js
        window.bcToolsDiagnostic?.sendDiagnostic?.({
          component: BC_DIAG_COMPONENT,
          event,
          details:{operation,phase,errorType:error&&error.type||'unknown',reloadRequested,document:documentName,version}
        });
      }catch(_){ }
    };
    const requestReload=(operation,phase,error,event)=>{
      if(event&&typeof event.preventDefault==='function'){
        event.preventDefault();
        if(typeof event.stopImmediatePropagation==='function')event.stopImmediatePropagation();
      }
      if(reloadRequested)return true;
      reloadRequested=true;
      diagnostic('options-context-reload-requested',operation,phase,error);
      state='reloading';
      reloadTimer=setTimeout(()=>{reloadTimer=null;try{location.reload();}catch(_){}},0);
      return true;
    };
    const invoke=(operation,phase,starter,fallback,callback,options={})=>{
      let finished=false;
      const finish=(ok,value,error)=>{
        if(finished)return;finished=true;clearTimeout(timer);
        const normalized=error?normalizedError(error):null;
        if(!ok){
          diagnostic(error&&error.timeout?'options-operation-timeout':'options-operation-failed',operation,phase,normalized);
          if(normalized.invalid||options.reloadOnFailure===true)requestReload(operation,phase,normalized,options.event);
        }
        if(typeof callback==='function')callback(ok?value:fallback,{ok,error:normalized,invalid:!!(normalized&&normalized.invalid),timeout:!!(error&&error.timeout)});
      };
      const timer=setTimeout(()=>finish(false,fallback,{message:'callback-timeout',timeout:true}),TIMEOUT_MS);
      try{
        starter((value)=>{
          let lastError=null;
          try{lastError=nativeRuntime&&nativeRuntime.lastError;}catch(error){lastError=error;}
          if(lastError){finish(false,fallback,lastError);return;}
          finish(true,value,null);
        });
      }catch(error){finish(false,fallback,error);}
    };
    const area=name=>({
      get:(keys,callback)=>invoke(`storage.${name}.get`,'callback',done=>nativeStorage[name].get(keys,done),{},callback,{reloadOnFailure:false}),
      set:(value,callback)=>invoke(`storage.${name}.set`,'callback',done=>nativeStorage[name].set(value,()=>done(undefined)),undefined,callback,{reloadOnFailure:false}),
      remove:(keys,callback)=>invoke(`storage.${name}.remove`,'callback',done=>nativeStorage[name].remove(keys,()=>done(undefined)),undefined,callback,{reloadOnFailure:false})
    });
    const storage={sync:area('sync'),local:area('local'),onChanged:nativeStorage&&nativeStorage.onChanged};
    const sendMessage=(message,callback,operation='runtime.sendMessage')=>invoke(operation,'callback',done=>nativeRuntime.sendMessage(message,done),null,callback,{reloadOnFailure:false});
    const check=(operation='health-check',event)=>{
      if(state==='reloading')return Promise.resolve(false);
      if(checkPromise)return checkPromise;
      state='checking';
      checkPromise=new Promise(resolve=>{
        invoke('storage.local.get','health-check',done=>nativeStorage.local.get('__bcToolsOptionsHealth__',done),{},(_value,storageResult)=>{
          if(!storageResult.ok){state='reloading';requestReload(operation,'storage-health',storageResult.error,event);resolve(false);return;}
          // La lettura storage e' la prova operativa bloccante. Il ping distingue
          // in modo non bloccante un worker temporaneamente non raggiungibile.
          state='live';lastChecked=Date.now();resolve(true);
          sendMessage({type:'BC_TOOLS_OPTIONS_PING'},(_response,pingResult)=>{
            if(!pingResult.ok)diagnostic('options-context-check-failed',operation,'worker-ping',pingResult.error);
          },'options-worker-ping');
        },{reloadOnFailure:true,event});
      }).finally(()=>{checkPromise=null;});
      return checkPromise;
    };
    const identityIsLive=()=>{try{return !!(loadedId&&nativeRuntime&&nativeRuntime.id===loadedId&&nativeStorage&&nativeStorage.local);}catch(_){return false;}};
    const guardEvent=event=>{
      if(state==='reloading')return requestReload('user-interaction','reloading',null,event);
      if(!identityIsLive())return requestReload('user-interaction','identity',normalizedError('context invalidated'),event);
      if(Date.now()-lastChecked>900)check('user-interaction');
      return false;
    };
    return {storage,sendMessage,check,guardEvent,requestReload,version,get state(){return state;},get reloadRequested(){return reloadRequested;}};
  })();
  function bcDiagnostic(event, details) {
    const entry = { at:new Date().toISOString(), event:String(event || 'unknown'), details:details || {} };
    optionsRuntimeGuard.sendMessage({ type:'BC_TOOLS_DIAGNOSTIC_APPEND', component:BC_DIAG_COMPONENT, entry },()=>{},'diagnostic');
  }
  function bcDiagnosticTarget(target) {
    const el = target && target.closest ? target.closest('button,a,input,select,textarea,[role="button"]') : null;
    if (!el) return null;
    return { tag:String(el.tagName || '').toLowerCase(), id:String(el.id || '').slice(0,80), type:String(el.type || '').slice(0,30), role:String(el.getAttribute && el.getAttribute('role') || '').slice(0,30) };
  }
  document.addEventListener('click', event => { const target=bcDiagnosticTarget(event.target); if(target) bcDiagnostic('ui-click', target); }, true);
  document.addEventListener('change', event => { const target=bcDiagnosticTarget(event.target); if(target) bcDiagnostic('ui-change', target); }, true);
  document.addEventListener('submit', event => bcDiagnostic('ui-submit', bcDiagnosticTarget(event.target) || {}), true);
  window.addEventListener('error', event => bcDiagnostic('runtime-error', { message:String(event.message || '').slice(0,300), file:String(event.filename || '').split('/').pop(), line:event.lineno || null, column:event.colno || null }));
  window.addEventListener('unhandledrejection', event => bcDiagnostic('unhandled-rejection', { reason:String(event.reason && event.reason.message || event.reason || '').slice(0,300) }));
  bcDiagnostic('context-start', { document:location.pathname.split('/').pop() || '/', frame:window === window.top ? 'top' : 'child' });
  // I trigger esistenti condividono la stessa prova operativa e non sovrappongono controlli.
  document.addEventListener('pointerdown',event=>optionsRuntimeGuard.guardEvent(event),true);
  document.addEventListener('keydown', event=>{ if(event.key==='Enter'||event.key===' ') optionsRuntimeGuard.guardEvent(event); }, true);
  window.addEventListener('pageshow', event=>optionsRuntimeGuard.check('pageshow',event), true);
  window.addEventListener('focus', event=>optionsRuntimeGuard.check('focus',event), true);
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') optionsRuntimeGuard.check('visibilitychange'); }, true);
  setInterval(()=>optionsRuntimeGuard.check('periodic'),1000);
  const $ = s => document.querySelector(s);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'\"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
  const savedBadge = $('#savedBadge');
  const filtersArea = $('#filtersArea');
  const tablesArea = $('#tablesArea');

  const storageNS = optionsRuntimeGuard.storage;
  const kv = storageNS.sync;

  const DEFAULTS = {
    hideNotificationsButton:false,
    showValuesInMonospace:false,
    showHyphensInColumnCaptions:false,
    highlightStatusRows:false,
    autoOpenHomeSearch:false,
    showPageFieldCopyButton:false,
    pageFieldCopyEnabled:null,
    pageFieldCopyClickable:null,
    pageFieldCopyFlowField:null,
    pageFieldCopyMode:null,
    pageFieldCopyGlobalPreferences:true,
    saldoArticoloMovimentiWarehouse:false,
    showCreatedDocumentButton:true,
    enableTableExport:false,
    autoShowMore:false,
    autoSortFirstColumn:false,
    sortDirection:'desc',
    autoWide:false,
    layoutMode:'wide',
    forceFactbox:false,
    factboxMode:'closed',
    uiTheme: 'light',
    visualStyle: 'modern',
    popupLayout: 'a',
    includedPages:'',
    includedPageNames:{},
    optionsLayout:[],
    quickFilters: [],
    quickTables: []
  };

  const UI_KEYS = [
    'hideNotificationsButton','showValuesInMonospace','showHyphensInColumnCaptions','highlightStatusRows','autoOpenHomeSearch','showPageFieldCopyButton','pageFieldCopyEnabled','pageFieldCopyClickable','pageFieldCopyFlowField','pageFieldCopyMode','pageFieldCopyGlobalPreferences','showCreatedDocumentButton','enableTableExport',
    'autoShowMore','autoSortFirstColumn','sortDirection','autoWide','layoutMode','forceFactbox','factboxMode','uiTheme','visualStyle','popupLayout',
    'saldoArticoloMovimentiWarehouse'
  ];
  const UI_BACKUP_KEY = 'bcToolsUiSettings';
  const HIDDEN_COPY_FIELDS_KEY = 'bcToolsHiddenCopyFields';
  const SHOWN_COPY_FIELDS_KEY = 'bcToolsShownCopyFields';
  const GLOBAL_HIDDEN_COPY_FIELDS_KEY = 'bcToolsHiddenCopyFieldsGlobal';
  const GLOBAL_SHOWN_COPY_FIELDS_KEY = 'bcToolsShownCopyFieldsGlobal';
  const COPY_VISIBILITY_KEYS = [HIDDEN_COPY_FIELDS_KEY, SHOWN_COPY_FIELDS_KEY, GLOBAL_HIDDEN_COPY_FIELDS_KEY, GLOBAL_SHOWN_COPY_FIELDS_KEY];
  const uiPatchOf = value => Object.fromEntries(UI_KEYS.filter(key => Object.prototype.hasOwnProperty.call(value || {}, key)).map(key => [key, value[key]]));
  let state = { ...DEFAULTS };
  let settingsSaveChain = Promise.resolve();
  let settingsSaveVersion = 0;
  let uiWired = false;
  if(storageNS && storageNS.onChanged){
    storageNS.onChanged.addListener((changes, ns)=>{
      if(ns !== 'sync') return;
      ['includedPages','optionsLayout','popupLayout'].forEach(k=>{ if(changes[k]) state[k] = changes[k].newValue ?? DEFAULTS[k]; });
    });
  }

  const showSaved = ()=>{ if(!savedBadge) return; savedBadge.classList.add('show'); setTimeout(()=> savedBadge.classList.remove('show'), 800); };

  // Lo stile (temi chiaro/scuro e componenti) è definito in style.css.
  // Nessun CSS iniettato a runtime: eviterebbe di sovrascrivere il foglio di stile.

  function applyTheme(theme){ document.documentElement.classList.toggle('theme-dark', theme==='dark'); }

  function ensureHeaderToggle(){
    const h2 = document.querySelector('h2'); if(!h2) return;
    if(document.getElementById('hdrToggle')) return;
    const wrap = document.createElement('div'); wrap.className='hdr-ios-toggle'; wrap.id='hdrToggle';
    wrap.innerHTML = '<input type="checkbox" aria-label="Tema scuro">';
    h2.appendChild(wrap);
    const cb = wrap.querySelector('input');
    const setVisual = ()=>{ if(state.uiTheme==='dark'){ wrap.classList.add('on'); cb.checked=true; } else { wrap.classList.remove('on'); cb.checked=false; } };
    setVisual();
    wrap.addEventListener('click', ()=>{ state.uiTheme = (state.uiTheme==='dark')? 'light':'dark'; applyTheme(state.uiTheme); setVisual(); persist({ uiTheme: state.uiTheme }); });
  }

  const sanitize = (arr)=> Array.isArray(arr) ? arr.map(it=>{
    if(!it) return null;
    const page=(it.page || it.table || '').toString().trim();
    const label=(it.label || '').toString().trim();
    const field=(it.field || '').toString().trim();
    const astLeft=!!it.astLeft, astRight=!!it.astRight;
    const hideInPopup=!!it.hideInPopup;
    if(!(label || page || field || astLeft || astRight || hideInPopup)) return null;
    const out = {label,page,field,astLeft,astRight,hideInPopup};
    return out;
  }).filter(Boolean) : [];

  const sanitizeTables = (arr)=> Array.isArray(arr) ? arr.map(it=>{
    if(!it) return null;
    const table=(it.table || '').toString().trim();
    const label=(it.label || '').toString().trim();
    return (label || table) ? {label,table} : null;
  }).filter(Boolean) : [];

  function toggleBox(id, enabled){
    const box = document.getElementById(id);
    if(!box) return;
    box.style.opacity = enabled ? '1' : '0.5';
    box.style.pointerEvents = enabled ? 'auto' : 'none';
  }

  const UI_FLAG_HELP = {
    hideNotificationsButton:'Nasconde il pulsante delle notifiche nell’interfaccia di Business Central.',
    showValuesInMonospace:'Mostra valori e campi con un carattere a larghezza fissa, utile per confrontare codici e numeri.',
    showHyphensInColumnCaptions:'Consente la sillabazione delle intestazioni di colonna quando lo spazio è ridotto.',
    highlightStatusRows:'Evidenzia con colori tenui le righe con stato Aperto/Open e Rilasciato/Released; la riga selezionata resta bianca.',
    autoOpenHomeSearch:'Apre una sola volta la ricerca interna entrando nella pagina principale.',
    showPageFieldCopyButton:'Attiva o disattiva i pulsanti Copia nelle colonne Business Central.',
    pageFieldCopyGlobalPreferences:'Condivide Mostra/Nascondi tra ambienti e società per la stessa combinazione di ID pagina e colonna. Disattiva per usare le preferenze contestuali già salvate.',
    showCreatedDocumentButton:'Mostra “Apri documento” nei messaggi riconosciuti che confermano la creazione di un prelievo, uno stoccaggio o un ordine di produzione rilasciato.',
    enableTableExport:'Mostra nel popup il comando per esportare la tabella Business Central aperta con table=ID.',
    saldoArticoloMovimentiWarehouse:'Mostra nel popup il comando “Saldo articolo” per analizzare le righe della vista filtrata in “Movimenti warehouse”.',
    autoWide:'Mantiene il layout di pagina selezionato quando è attivo.',
    forceFactbox:'Mantiene aperta o chiusa la FactBox secondo la modalità selezionata.',
    autoShowMore:'Apre automaticamente “Mostra il resto” una volta per pagina. Una chiusura manuale resta rispettata.',
    autoSortFirstColumn:'Ordina automaticamente la prima colonna utilizzabile soltanto nelle pagine incluse.'
  };
  function infoButton(help,label){
    const button=document.createElement('button');
    button.type='button'; button.className='info-tooltip';
    button.textContent='i'; button.dataset.help=help;
    button.setAttribute('aria-label',`Informazioni: ${label}`);
    button.setAttribute('aria-expanded','false');
    return button;
  }
  function wireInfoTooltips(){
    Object.entries(UI_FLAG_HELP).forEach(([id,help])=>{
      const input=document.getElementById(id), label=input && input.closest('label');
      if(!label || label.parentElement?.classList.contains('setting-with-info')) return;
      const row=label.parentElement?.classList.contains('bc-ui-mode-row')?label.parentElement:null;
      if(row){ if(!row.querySelector('.info-tooltip')) row.append(infoButton(help,label.textContent.trim())); return; }
      const wrap=document.createElement('span'); wrap.className='setting-with-info';
      label.parentNode.insertBefore(wrap,label); wrap.append(label,infoButton(help,label.textContent.trim()));
    });
    document.querySelectorAll('.info-tooltip').forEach(button=>{
      if(button.dataset.wired==='1') return;
      button.dataset.wired='1';
      button.addEventListener('click',event=>{
        event.preventDefault(); event.stopPropagation();
        const open=!button.classList.contains('is-open');
        document.querySelectorAll('.info-tooltip.is-open').forEach(other=>{ other.classList.remove('is-open'); other.setAttribute('aria-expanded','false'); });
        button.classList.toggle('is-open',open); button.setAttribute('aria-expanded',open?'true':'false');
      });
    });
  }
  document.addEventListener('pointerdown',event=>{
    if(event.target.closest?.('.info-tooltip')) return;
    document.querySelectorAll('.info-tooltip.is-open').forEach(button=>{ button.classList.remove('is-open'); button.setAttribute('aria-expanded','false'); });
  },true);
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape') return;
    document.querySelectorAll('.info-tooltip.is-open').forEach(button=>{ button.classList.remove('is-open'); button.setAttribute('aria-expanded','false'); button.focus(); });
  },true);
  function render(){
    applyTheme(state.uiTheme || 'light');
    wireInfoTooltips();
    ensureHeaderToggle();

    const cur = sanitize(state.quickFilters);
    const rowsToShow = cur.length + 1;
    let html=`
      <div class="filters-flags-help" aria-label="Informazioni sui flag di ricerca">
        <div class="filters-flags-help-grid">
          <span class="filters-flag-help"><span class="filters-flag-positioner" aria-hidden="true">*val</span><button type="button" class="info-tooltip" data-help="Aggiunge un asterisco prima del valore cercato, per trovare risultati che terminano con il testo inserito." aria-label="Informazioni: asterisco prima del valore" aria-expanded="false">i</button></span>
          <span class="filters-flag-help"><span class="filters-flag-positioner" aria-hidden="true">val*</span><button type="button" class="info-tooltip" data-help="Aggiunge un asterisco dopo il valore cercato, per trovare risultati che iniziano con il testo inserito." aria-label="Informazioni: asterisco dopo il valore" aria-expanded="false">i</button></span>
          <span class="filters-flag-help"><span class="filters-flag-positioner" aria-hidden="true">no popup</span><button type="button" class="info-tooltip" data-help="Per impostazione predefinita la ricerca compare nel popup. Attiva questo flag per lasciarla disponibile soltanto nel menu contestuale." aria-label="Informazioni: no popup" aria-expanded="false">i</button></span>
        </div>
      </div>`;
    for(let i=0;i<rowsToShow;i++){
      const isPlaceholder = (i === cur.length);
      const it = isPlaceholder ? {label:'', page:'', field:'', astLeft:false, astRight:false, hideInPopup:false} : cur[i];
      html += `
        <div class="filters-row" data-idx="${i}" data-placeholder="${isPlaceholder?1:0}">
          <input class="f-label" type="text" placeholder="Etichetta" aria-label="Etichetta ricerca" value="${escapeHtml(it.label || '')}">
          <input class="f-page" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="ID pagina" aria-label="ID pagina" value="${escapeHtml(it.page || '')}">
          <input class="f-field" type="text" placeholder="Campo" aria-label="Campo di ricerca" value="${escapeHtml(it.field || '')}">
          <button class="removeBtn" type="button" title="Rimuovi" aria-label="Rimuovi ricerca">−</button>
          <div class="astBox">
            <label><input type="checkbox" class="astL" ${it.astLeft ? 'checked' : ''}><span>*val</span></label>
            <label><input type="checkbox" class="astR" ${it.astRight ? 'checked' : ''}><span>val*</span></label>
            <label><input type="checkbox" class="hidePop" ${it.hideInPopup ? 'checked' : ''}><span>no popup</span></label>
          </div>
        </div>`;
    }
    filtersArea.innerHTML = html;
    wireInfoTooltips();
  }

  function renderTableSection(area, arr){
    const cur = sanitizeTables(arr);
    const rowsToShow = cur.length + 1;
    let html='';
    for(let i=0;i<rowsToShow;i++){
      const isPlaceholder = (i === cur.length);
      const it = isPlaceholder ? {label:'', table:''} : cur[i];
      html += `
        <div class="tables-row" data-idx="${i}" data-placeholder="${isPlaceholder?1:0}">
          <input class="t-label" type="text" placeholder="Etichetta" aria-label="Etichetta tabella" value="${escapeHtml(it.label || '')}">
          <input class="t-table" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="ID tabella" aria-label="ID tabella" value="${escapeHtml(it.table || '')}">
          <button class="t-removeBtn" type="button" title="Rimuovi" aria-label="Rimuovi tabella">−</button>
        </div>`;
    }
    area.innerHTML = html;
  }
  function renderTables(){ renderTableSection(tablesArea, state.quickTables); }

  function persistDirect(changed, done){
    const uiChanged=uiPatchOf(changed);
    kv.set(changed,(_unused,syncResult)=>{
      if(!syncResult.ok){done(false,syncResult);return;}
      if(!Object.keys(uiChanged).length){done(true,syncResult);return;}
      storageNS.local.get({[UI_BACKUP_KEY]:{}},(current,getResult)=>{
        if(!getResult.ok){done(false,getResult);return;}
        const backup=Object.assign({},current[UI_BACKUP_KEY]||{},uiChanged);
        storageNS.local.set(Object.assign({[UI_BACKUP_KEY]:backup},uiChanged),(_value,setResult)=>done(setResult.ok,setResult));
      });
    });
  }
  function persist(patch, cb){
    const changed=Object.assign({},patch||{});
    settingsSaveVersion++;
    const save=()=>new Promise(resolve=>{
      const previousState=state;
      const complete=(saved,result)=>{
        if(saved)state=Object.assign({},state,changed);
        else state=previousState;
        if(optionsRuntimeGuard.state==='reloading'){if(cb)cb(false);resolve(false);return;}
        if(savedBadge)savedBadge.textContent=saved?'Salvato ✓':'Errore salvataggio';
        showSaved();
        try { if(cb)cb(saved); }
        finally { resolve(saved); }
      };
      optionsRuntimeGuard.check('persist').then(live=>{
        if(!live){complete(false);return;}
        optionsRuntimeGuard.sendMessage({type:'BC_TOOLS_SAVE_SETTINGS',payload:changed},(response,messageResult)=>{
          if(messageResult.ok&&response&&response.ok){complete(true,messageResult);return;}
          if(messageResult.invalid||optionsRuntimeGuard.state==='reloading'){complete(false,messageResult);return;}
          persistDirect(changed,complete);
        },'save-settings');
      }).catch(error=>complete(false,error));
    });
    settingsSaveChain=settingsSaveChain.then(save);
    return settingsSaveChain;
  }
  function applyUiControls(ui){
    ui = ui || {};
    ['hideNotificationsButton','showValuesInMonospace','showHyphensInColumnCaptions','highlightStatusRows','autoOpenHomeSearch','showCreatedDocumentButton','enableTableExport','saldoArticoloMovimentiWarehouse','autoSortFirstColumn','autoWide','forceFactbox','autoShowMore'].forEach(id=>{
      const el=document.getElementById(id);
      if(el && Object.prototype.hasOwnProperty.call(ui,id)) el.checked=!!ui[id];
    });
    const layoutModeEl=document.getElementById('layoutMode');
    if(layoutModeEl && Object.prototype.hasOwnProperty.call(ui,'layoutMode')) layoutModeEl.value=ui.layoutMode === 'normal' ? 'normal' : 'wide';
    const factboxModeEl=document.getElementById('factboxMode');
    if(factboxModeEl && Object.prototype.hasOwnProperty.call(ui,'factboxMode')) factboxModeEl.value=ui.factboxMode === 'open' ? 'open' : 'closed';
    const sdEl=document.getElementById('sortDirection');
    if(sdEl && Object.prototype.hasOwnProperty.call(ui,'sortDirection')) sdEl.value=ui.sortDirection === 'asc' ? 'asc' : 'desc';
    const popupLayoutEl=document.getElementById('popupLayout');
    if(popupLayoutEl && Object.prototype.hasOwnProperty.call(ui,'popupLayout')) popupLayoutEl.value=ui.popupLayout === 'vertical' ? 'vertical' : 'a';
    const savedMode=['none','underlined','teal','both'].includes(ui.pageFieldCopyMode)
      ? ui.pageFieldCopyMode : (ui.showPageFieldCopyButton ? 'both' : 'none');
    const pageFieldCopyEnabled=document.getElementById('showPageFieldCopyButton');
    if(pageFieldCopyEnabled) pageFieldCopyEnabled.checked=typeof ui.pageFieldCopyEnabled === 'boolean'
      ? ui.pageFieldCopyEnabled : savedMode !== 'none';
    const pageFieldCopyClickable=document.getElementById('pageFieldCopyClickable');
    if(pageFieldCopyClickable) pageFieldCopyClickable.checked=typeof ui.pageFieldCopyClickable === 'boolean'
      ? ui.pageFieldCopyClickable : (ui.pageFieldCopyMode == null || ['underlined','both'].includes(savedMode));
    const pageFieldCopyFlowField=document.getElementById('pageFieldCopyFlowField');
    if(pageFieldCopyFlowField) pageFieldCopyFlowField.checked=typeof ui.pageFieldCopyFlowField === 'boolean'
      ? ui.pageFieldCopyFlowField : (ui.pageFieldCopyMode == null || ['teal','both'].includes(savedMode));
    const pageFieldCopyGlobalPreferences=document.getElementById('pageFieldCopyGlobalPreferences');
    if(pageFieldCopyGlobalPreferences) pageFieldCopyGlobalPreferences.checked=ui.pageFieldCopyGlobalPreferences !== false;
    if(Object.prototype.hasOwnProperty.call(ui,'autoSortFirstColumn')) toggleBox('sortDirectionBox',!!ui.autoSortFirstColumn);
    if(Object.prototype.hasOwnProperty.call(ui,'uiTheme')) applyTheme(ui.uiTheme === 'dark' ? 'dark' : 'light');
  }

  const QUICK_GUIDE_SEEN_KEY = 'bcToolsQuickGuideSeen';
  const optionsNavigationState = window.bcToolsOptionsNavigationState || { tourActive:false, internalNavigation:false };
  window.bcToolsOptionsNavigationState = optionsNavigationState;
  function wireQuickGuide(){
    const button=document.getElementById('quickGuideButton');
    const menu=document.getElementById('quickGuideMenu');
    const tour=document.getElementById('quickGuideTour');
    const manualButton=document.getElementById('quickGuideManual');
    const manualDialog=document.getElementById('quickGuideManualDialog');
    const manualClose=document.getElementById('quickGuideManualClose');
    const manualStatus=document.getElementById('quickGuideManualStatus');
    const manualContent=document.getElementById('quickGuideManualContent');
    const hint=document.getElementById('quickGuideHint');
    const coach=document.getElementById('guidedTourCoach');
    const coachTitle=document.getElementById('guidedTourTitle');
    const coachText=document.getElementById('guidedTourText');
    const coachProgress=document.getElementById('guidedTourProgress');
    const coachVisual=document.getElementById('guidedTourVisual');
    const coachImage=document.getElementById('guidedTourImage');
    const coachCaption=document.getElementById('guidedTourCaption');
    const imageOpen=document.getElementById('guidedTourImageOpen');
    const imageDialog=document.getElementById('guidedTourImageDialog');
    const imageClose=document.getElementById('guidedTourImageClose');
    const imageLarge=document.getElementById('guidedTourImageLarge');
    const imageDialogTitle=document.getElementById('guidedTourImageDialogTitle');
    const imageDialogText=document.getElementById('guidedTourImageDialogText');
    const next=document.getElementById('guidedTourNext');
    const stop=document.getElementById('guidedTourStop');
    if(!button || !menu || !tour || !coach || !coachTitle || !coachText || !next || !stop) return;
    let activeTarget=null, stepTimer=null, menuTimer=null, step=-1, targetAdvance=null, internalNavigation=false, tourScope='all';
    const markSeen=()=>{
      button.classList.remove('is-new');
      if(hint) hint.hidden=true;
      if(storageNS && storageNS.local) storageNS.local.set({[QUICK_GUIDE_SEEN_KEY]:true});
    };
    const setMenuOpen=open=>{
      clearTimeout(menuTimer);
      const customizing=button.classList.contains('is-customize-confirm');
      const nextOpen=!!open&&!customizing;
      button.classList.toggle('is-menu-open',nextOpen);
      button.setAttribute('aria-expanded',nextOpen?'true':'false');
      button.setAttribute('aria-label',customizing?'Conferma e termina personalizzazione':nextOpen?'Chiudi il menu di assistenza':'Apri il menu di assistenza');
      if(nextOpen){
        markSeen(); menu.hidden=false;
        requestAnimationFrame(()=>menu.classList.add('is-open'));
        try{tour.focus();}catch(_){}
      }else{
        menu.classList.remove('is-open');
        menuTimer=setTimeout(()=>{ if(!menu.classList.contains('is-open'))menu.hidden=true; },240);
      }
    };
    const clearSpotlight=()=>{
      if(activeTarget) activeTarget.classList.remove('guided-tour-target');
      activeTarget=null;
      targetAdvance=null;
      coach.classList.remove('guided-tour-coach-above','guided-tour-coach-below');
      document.body.classList.remove('guided-tour-active');
    };
    const remember=value=>{ step=value; optionsNavigationState.tourActive=value>=0; };
    const targetFor=selector=>document.querySelector(selector);
    const TOUR_SUCCESSORS={3:4,5:6,6:7,7:9,10:11,11:15};
    const hasTourSuccessor=value=>tourScope==='all' && Object.prototype.hasOwnProperty.call(TOUR_SUCCESSORS,value);
    const positionCoach=()=>{
      if(coach.hidden || !activeTarget) return;
      const margin=16, gap=22, vw=innerWidth, vh=innerHeight;
      coach.classList.remove('guided-tour-coach-above','guided-tour-coach-below');
      coach.style.left=`${margin}px`; coach.style.top=`${margin}px`;
      coach.style.right='auto'; coach.style.bottom='auto'; coach.style.transform='none';
      const target=activeTarget.getBoundingClientRect();
      const box=coach.getBoundingClientRect();
      const clamp=(value,min,max)=>Math.max(min,Math.min(value,max));
      const candidates=[
        { side:'below', space:vh-target.bottom-gap, x:clamp(target.left+(target.width-box.width)/2,margin,vw-box.width-margin), y:target.bottom+gap },
        { side:'above', space:target.top-gap, x:clamp(target.left+(target.width-box.width)/2,margin,vw-box.width-margin), y:target.top-gap-box.height },
        { side:'right', space:vw-target.right-gap, x:target.right+gap, y:clamp(target.top+(target.height-box.height)/2,margin,vh-box.height-margin) },
        { side:'left', space:target.left-gap, x:target.left-gap-box.width, y:clamp(target.top+(target.height-box.height)/2,margin,vh-box.height-margin) }
      ];
      const fits=candidates.filter(item=>item.space >= (item.side==='below'||item.side==='above'?box.height:box.width));
      const chosen=(fits.find(item=>item.side==='below') || fits.sort((a,b)=>b.space-a.space)[0] || candidates.sort((a,b)=>b.space-a.space)[0]);
      coach.style.left=`${clamp(chosen.x,margin,Math.max(margin,vw-box.width-margin))}px`;
      coach.style.top=`${clamp(chosen.y,margin,Math.max(margin,vh-box.height-margin))}px`;
    };
    const showCoach=(target,title,text,options={})=>{
      clearSpotlight();
      if(!target) return false;
      activeTarget=target;
      targetAdvance=typeof options.onTarget === 'function' ? options.onTarget : null;
      document.body.classList.add('guided-tour-active');
      target.classList.add('guided-tour-target');
      target.scrollIntoView({behavior:'smooth',block:'center'});
      coachTitle.textContent=title;
      coachText.textContent=text;
      coachProgress.textContent=options.progress || '';
      if(coachVisual) coachVisual.hidden=options.showVisual!==true;
      if(options.showVisual && coachImage && imageLarge){
        const visual=options.visual || {
          src:'../../assets/tour/page-id-example.png',
          alt:'Barra degli indirizzi di Business Central con il valore del parametro page evidenziato',
          caption:'Il Page ID si trova nell’indirizzo dopo page=. Premi l’immagine per ingrandirla.',
          title:'Dove trovare il Page ID',
          detail:'Il numero subito dopo page= è il Page ID da inserire.'
        };
        coachImage.src=visual.src; coachImage.alt=visual.alt;
        imageLarge.src=visual.src; imageLarge.alt=visual.alt;
        if(coachCaption) coachCaption.textContent=visual.caption;
        if(imageDialogTitle) imageDialogTitle.textContent=visual.title;
        if(imageDialogText) imageDialogText.textContent=visual.detail;
      }
      next.textContent=options.nextText || (hasTourSuccessor(step)?'Continua':'Termina tour');
      next.hidden=options.hideNext===true;
      next.disabled=options.disableNext===true;
      coach.hidden=false;
      requestAnimationFrame(()=>requestAnimationFrame(positionCoach));
      return true;
    };
    const navigateInternally=action=>{
      internalNavigation=true;
      optionsNavigationState.internalNavigation=true;
      try{ action(); }finally{ setTimeout(()=>{ internalNavigation=false; optionsNavigationState.internalNavigation=false; },0); }
    };
    const clickCategory=key=>{
      const card=targetFor(`.settings-card[data-target="${key}"]`);
      if(card) navigateInternally(()=>card.click());
    };
    const goDashboard=()=>{
      const dashboard=document.getElementById('settingsDashboard');
      if(dashboard && !dashboard.hidden) return;
      const back=targetFor('.back-button');
      if(back) navigateInternally(()=>back.click());
    };
    const runRecommendedPresetFinale=()=>{
      const card=targetFor('.settings-card[data-target="iofile"]');
      const icon=card&&card.querySelector('.settings-card-icon');
      if(!card||!icon){
        bcDiagnostic('guided-tour-preset-finale-unavailable',{card:!!card,icon:!!icon});
        return;
      }
      let overlay=null,clone=null,message=null,motion=null,settled=false,cleaned=false;
      const temporary=[];
      const add=(target,type,listener,options)=>{target.addEventListener(type,listener,options);temporary.push(()=>target.removeEventListener(type,listener,options));};
      const clearMotion=()=>{
        if(motion){try{motion.cancel();}catch(_){} motion=null;}
        if(clone){clone.remove();clone=null;}
      };
      const clearVisuals=()=>{
        clearMotion();
        card.classList.remove('recommended-preset-finale-card','recommended-preset-finale-pulse');
        const entry=document.getElementById('recommendedPresetEntry');if(entry)entry.classList.remove('recommended-preset-entry-highlight');
        document.documentElement.classList.remove('recommended-preset-finale-lock');
      };
      const cleanup=()=>{
        if(cleaned)return;cleaned=true;
        temporary.splice(0).forEach(remove=>remove());
        clearVisuals();
        if(message){message.remove();message=null;}
        if(overlay){overlay.remove();overlay=null;}
      };
      const saveIgnored=done=>{
        if(storageNS&&storageNS.local) storageNS.local.set({[RECOMMENDED_PRESET_DECISION_KEY]:'ignored'},done);
        else done();
      };
      const highlightPresetEntry=()=>{
        const entry=targetFor('#recommendedPresetEntry');
        if(!entry)return;
        entry.classList.add('recommended-preset-entry-highlight');
        setTimeout(()=>entry.classList.remove('recommended-preset-entry-highlight'),1400);
      };
      const closeFinale=openSection=>{
        if(cleaned)return;
        saveIgnored(()=>{
          cleanup();
          if(openSection){
            const openSettingsSection=window.bcToolsOpenSettingsSection;
            if(typeof openSettingsSection==='function') openSettingsSection('iofile');
            else card.focus();
          }else card.focus();
        });
      };
      const panel=document.createElement('div');
      panel.className='recommended-preset-finale-message';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
      const title=document.createElement('h2');title.id='recommendedPresetFinaleTitle';title.textContent='Configurazione consigliata';panel.setAttribute('aria-labelledby',title.id);
      const text=document.createElement('p');text.textContent='La configurazione pronta all’uso si trova nella sezione Importa / Esporta. Puoi controllare tutte le modifiche prima di applicarla.';
      const actions=document.createElement('div');actions.className='recommended-preset-finale-actions';
      const openButton=document.createElement('button');openButton.type='button';openButton.className='recommended-preset-finale-primary';openButton.textContent='Apri Importa / Esporta';
      const understood=document.createElement('button');understood.type='button';understood.className='recommended-preset-finale-secondary';understood.textContent='Ho capito';
      actions.append(openButton,understood);panel.append(title,text,actions);message=panel;
      const showStatic=()=>{
        if(settled||cleaned)return;settled=true;clearMotion();
        card.classList.add('recommended-preset-finale-card');
        document.body.appendChild(message);
        const rect=card.getBoundingClientRect();
        const top=Math.min(innerHeight-message.offsetHeight-16,Math.max(16,rect.bottom+12));
        const left=Math.min(innerWidth-message.offsetWidth-16,Math.max(16,rect.right-message.offsetWidth));
        message.style.left=`${left}px`;message.style.top=`${top}px`;
        requestAnimationFrame(()=>{message.classList.add('is-visible');openButton.focus();});
      };
      const onKey=event=>{
        if(event.key==='Escape'){event.preventDefault();if(settled)closeFinale(false);else showStatic();return;}
        if(!settled||event.key!=='Tab')return;
        const controls=[openButton,understood],first=controls[0],last=controls[1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      };
      const interrupt=()=>{if(!settled&&!cleaned)showStatic();};
      overlay=document.createElement('div');overlay.className='recommended-preset-finale-overlay';overlay.setAttribute('aria-hidden','true');
      document.body.appendChild(overlay);document.documentElement.classList.add('recommended-preset-finale-lock');
      card.classList.add('recommended-preset-finale-card');
      openButton.addEventListener('click',()=>closeFinale(true));understood.addEventListener('click',()=>closeFinale(false));
      add(document,'keydown',onKey,true);add(window,'resize',interrupt,{passive:true});add(document,'visibilitychange',()=>{if(document.visibilityState!=='visible')interrupt();});
      add(overlay,'click',()=>settled?closeFinale(false):showStatic());
      const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      if(reduced){showStatic();return;}
      requestAnimationFrame(()=>{
        if(cleaned)return;
        const to=icon.getBoundingClientRect();
        if(!to.width||!to.height||!card.isConnected){bcDiagnostic('guided-tour-preset-finale-unmeasurable',{});cleanup();return;}
        clone=document.createElement('div');clone.className='recommended-preset-finale-clone';clone.setAttribute('aria-hidden','true');clone.tabIndex=-1;
        clone.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 4h14v16H5zM8 8h8M8 12h5M8 16h3"/></svg><span>Configurazione consigliata</span>`;
        const startWidth=Math.min(220,Math.max(188,innerWidth-32)),startHeight=38;
        const startLeft=Math.min(innerWidth-startWidth-16,Math.max(16,to.left+(to.width-startWidth)/2));
        const startTop=Math.max(16,Math.min(to.top-startHeight-24,innerHeight-startHeight-16));
        Object.assign(clone.style,{left:`${startLeft}px`,top:`${startTop}px`,width:`${startWidth}px`,height:`${startHeight}px`});
        document.body.appendChild(clone);
        const from=clone.getBoundingClientRect();
        const finalWidth=Math.min(34,to.width),finalHeight=Math.min(38,to.height);
        const endLeft=to.left+(to.width-finalWidth)/2,endTop=to.top+(to.height-finalHeight)/2;
        const midLeft=(from.left+endLeft)/2+24,midTop=(from.top+endTop)/2-28;
        const label=clone.querySelector('span');
        if(label)label.animate([{opacity:1,maxWidth:`${Math.max(1,label.scrollWidth)}px`},{opacity:0,maxWidth:'0px'}],{duration:460,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
        motion=clone.animate([
          {left:`${from.left}px`,top:`${from.top}px`,width:`${from.width}px`,height:`${from.height}px`,borderRadius:'10px'},
          {left:`${midLeft}px`,top:`${midTop}px`,width:`${Math.max(82,from.width*.48)}px`,height:`${Math.max(34,from.height*.9)}px`,borderRadius:'18px',offset:.58},
          {left:`${endLeft}px`,top:`${endTop}px`,width:`${finalWidth}px`,height:`${finalHeight}px`,borderRadius:'55% 55% 60% 60% / 45% 45% 70% 70%'}
        ],{duration:760,easing:'cubic-bezier(.2,.75,.2,1)',fill:'forwards'});
        motion.finished.then(()=>{
          if(cleaned||settled)return;
          clone.remove();clone=null;motion=null;
          card.classList.add('recommended-preset-finale-pulse');
          icon.addEventListener('animationend',()=>card.classList.remove('recommended-preset-finale-pulse'),{once:true});
          showStatic();
        }).catch(()=>{if(!cleaned)showStatic();});
      });
    };
    const runStep=value=>{
      clearTimeout(stepTimer);
      remember(value);
      if(value===2){
        goDashboard();
        setTimeout(()=>{
          const card=targetFor('.settings-card[data-target="ui"]');
          if(!showCoach(card,'1. Migliorie UI','Qui trovi i flag delle migliorie disponibili oggi e di quelle che saranno aggiunte in futuro. Apri la sezione evidenziata oppure premi Avanti.',{progress:'Passaggio 1 di 3',nextText:'Apri sezione',onTarget:()=>setTimeout(()=>runStep(3),80)})) return;
        },80);
        return;
      }
      if(value===3){
        setTimeout(()=>showCoach(targetFor('section[data-box="ui"] .bc-ui-grid3'),'Migliorie UI','Esplora le opzioni e attiva soltanto quelle che ti sono utili. Potrai modificarle in qualsiasi momento.',{progress:'Passaggio 1 di 3',nextText:'Continua'}),80);
        return;
      }
      if(value===4){
        goDashboard();
        setTimeout(()=>{
          const card=targetFor('.settings-card[data-target="filtri"]');
          if(!showCoach(card,'2. Ricerca e filtri','Ora configuriamo una ricerca rapida. Apri la sezione evidenziata oppure premi Avanti.',{progress:'Passaggio 2 di 3',nextText:'Apri sezione',onTarget:()=>setTimeout(()=>runStep(5),80)})) return;
        },80);
        return;
      }
      const firstRow=()=>targetFor('#filtersArea .filters-row');
      if(value===5){
        setTimeout(()=>showCoach(firstRow()?.querySelector('.f-label'),'Etichetta','È il nome leggibile che vedrai nel popup, per esempio “Ordine cliente” o “Articolo”.',{progress:'Passaggio 2 di 3',nextText:'Mostra Pagina ID'}),100);
        return;
      }
      if(value===6){
        showCoach(firstRow()?.querySelector('.f-page'),'Pagina ID','È il numero della pagina Business Central da aprire. Deve contenere soltanto cifre.',{progress:'Passaggio 2 di 3',nextText:'Mostra Campo',showVisual:true});
        return;
      }
      if(value===7){
        showCoach(firstRow()?.querySelector('.f-field'),'Campo','È il nome del campo Business Central sul quale applicare il filtro. La ricerca viene salvata automaticamente e compare nel popup, salvo attivazione di “no popup”.',{progress:tourScope==='all'?'Passaggio 2 di 3':'Tour della sezione'});
        return;
      }
      if(value===9){
        goDashboard();
        setTimeout(()=>{
          const card=targetFor('.settings-card[data-target="tabelle"]');
          showCoach(card,'3. Tabelle','Salva le tabelle Business Central che usi più spesso. Apri la sezione evidenziata oppure premi Avanti.',{progress:'Passaggio 3 di 3',nextText:'Apri sezione',onTarget:()=>setTimeout(()=>runStep(10),80)});
        },80);
        return;
      }
      const firstTableRow=()=>targetFor('#tablesArea .tables-row');
      if(value===10){
        setTimeout(()=>showCoach(firstTableRow()?.querySelector('.t-label'),'Etichetta tabella','È il nome leggibile che comparirà nell’elenco delle tabelle salvate.',{progress:tourScope==='all'?'Passaggio 3 di 3':'Tour della sezione',nextText:'Mostra Tabella ID'}),100);
        return;
      }
      if(value===11){
        showCoach(firstTableRow()?.querySelector('.t-table'),'Tabella ID','Inserisci l’ID numerico mostrato nel controllo pagina di Business Central, nella riga Tabella.',{progress:tourScope==='all'?'Passaggio 3 di 3':'Tour della sezione',nextText:tourScope==='all'?'Continua':'Termina tour',showVisual:true,visual:{src:'../../assets/tour/table-id-example.png',alt:'Controllo pagina di Business Central con ID tabella 5405 evidenziato',caption:'Il Table ID è il numero tra parentesi nella riga Tabella. Premi l’immagine per ingrandirla.',title:'Dove trovare il Table ID',detail:'Nel controllo pagina, cerca la riga Tabella: il numero tra parentesi è il Table ID da inserire.'}});
        return;
      }
      if(value===20){
        const section=targetFor('#settingsDetail section[data-box]:not([hidden])');
        const title=targetFor('.detail-title h1')?.textContent || 'Sezione corrente';
        showCoach(section,title,'Questa guida resta nella sezione aperta. Esplora i controlli evidenziati e interrompi il tour quando hai terminato.',{progress:'Tour della sezione',nextText:'Termina tour'});
        return;
      }
      const completedFullTour=tourScope==='all';
      clearSpotlight(); coach.hidden=true; remember(-1);
      if(completedFullTour) goDashboard();
      tourScope='all';
      if(completedFullTour && storageNS && storageNS.local){
        storageNS.local.set({bcToolsOnboardingState:'tour-completed',bcToolsRecommendedPresetDecision:'pending'},()=>{
          requestAnimationFrame(()=>requestAnimationFrame(runRecommendedPresetFinale));
        });
      }else button.focus();
    };
    const startFullTour=()=>{
      tourScope='all';
      setMenuOpen(false); coach.hidden=true;
      runStep(2);
    };
    const startTour=()=>{
      const current=targetFor('#settingsDetail section[data-box]:not([hidden])');
      const key=current && current.dataset ? current.dataset.box : '';
      if(!key){ startFullTour(); return; }
      tourScope=key;
      setMenuOpen(false); coach.hidden=true;
      if(key==='ui') runStep(3);
      else if(key==='filtri') runStep(5);
      else if(key==='tabelle') runStep(10);
      else runStep(20);
    };
    const stopTour=()=>{ tourScope='all'; clearTimeout(stepTimer); clearSpotlight(); coach.hidden=true; remember(-1); goDashboard(); button.focus(); };
    const appendInlineText=(parent,text)=>{
      const parts=String(text || '').split(/(`[^`]+`)/g);
      parts.forEach(part=>{
        if(part.startsWith('`') && part.endsWith('`')){ const code=document.createElement('code'); code.textContent=part.slice(1,-1); parent.appendChild(code); }
        else parent.appendChild(document.createTextNode(part));
      });
    };
    const renderManualMarkdown=text=>{
      manualContent.replaceChildren();
      let list=null, codeBlock=null;
      String(text || '').replace(/\r\n?/g,'\n').split('\n').forEach(line=>{
        if(line.trim().startsWith('```')){
          if(codeBlock){ manualContent.appendChild(codeBlock); codeBlock=null; }
          else{ codeBlock=document.createElement('pre'); }
          return;
        }
        if(codeBlock){ codeBlock.textContent+=(codeBlock.textContent?'\n':'')+line; return; }
        const heading=line.match(/^(#{1,6})\s+(.+)$/);
        if(heading){ list=null; const h=document.createElement(`h${Math.min(heading[1].length,4)}`); appendInlineText(h,heading[2]); manualContent.appendChild(h); return; }
        const item=line.match(/^\s*[-*]\s+(.+)$/);
        if(item){ if(!list){ list=document.createElement('ul'); manualContent.appendChild(list); } const li=document.createElement('li'); appendInlineText(li,item[1]); list.appendChild(li); return; }
        list=null;
        if(!line.trim()) return;
        const paragraph=document.createElement('p'); appendInlineText(paragraph,line.trim()); manualContent.appendChild(paragraph);
      });
      if(codeBlock) manualContent.appendChild(codeBlock);
    };
    const fetchManualText=async()=>{
      let lastError=null;
      for(const path of ['docs/BC_tools_funzioni.md','BC_tools_funzioni.md']){
        try{
          const response=await fetch(chrome.runtime.getURL(path),{cache:'no-store'});
          if(!response.ok) throw new Error(`HTTP ${response.status}`);
          return await response.text();
        }catch(error){ lastError=error; }
      }
      throw lastError || new Error('File manuale non trovato');
    };
    const openManual=async()=>{
      setMenuOpen(false);
      manualStatus.hidden=false; manualStatus.textContent='Caricamento manuale…'; manualContent.replaceChildren();
      manualDialog.showModal(); document.documentElement.classList.add('manual-dialog-lock'); manualClose.focus();
      try{
        renderManualMarkdown(await fetchManualText());
        manualStatus.hidden=true;
      }catch(error){
        manualStatus.hidden=false;
        manualStatus.textContent=`Manuale non disponibile: ${error && error.message ? error.message : 'errore di lettura'}`;
      }
    };
    button.addEventListener('click',()=>setMenuOpen(button.getAttribute('aria-expanded')!=='true'));
    if(manualButton && manualDialog && manualClose && manualStatus && manualContent){
      manualButton.addEventListener('click',openManual);
      manualClose.addEventListener('click',()=>manualDialog.close());
      manualDialog.addEventListener('click',event=>{ if(event.target===manualDialog) manualDialog.close(); });
      manualDialog.addEventListener('close',()=>{ document.documentElement.classList.remove('manual-dialog-lock'); try{manualButton.focus();}catch(_){} });
    }
    tour.addEventListener('click',startTour);
    if(imageOpen && imageDialog && imageClose){
      const closeImage=()=>{ if(imageDialog.open) imageDialog.close(); };
      imageOpen.addEventListener('click',()=>{ imageDialog.showModal(); imageClose.focus(); });
      imageClose.addEventListener('click',closeImage);
      imageDialog.addEventListener('click',event=>{ if(event.target===imageDialog) closeImage(); });
      imageDialog.addEventListener('close',()=>{ try{imageOpen.focus();}catch(_){} });
    }
    stop.addEventListener('click',stopTour);
    next.addEventListener('click',()=>{
      if(step===2){ clickCategory('ui'); runStep(3); return; }
      if(step===4){ clickCategory('filtri'); runStep(5); return; }
      if(step===9){ clickCategory('tabelle'); runStep(10); return; }
      if(tourScope!=='all' && (step===3 || step===7 || step===11 || step===14 || step===20)){ runStep(15); return; }
      const following=TOUR_SUCCESSORS[step];
      if(following!==undefined) runStep(following);
    });
    document.addEventListener('pointerdown',event=>{
      if(menu.hidden || button.contains(event.target) || menu.contains(event.target)) return;
      setMenuOpen(false);
    },true);
    document.addEventListener('keydown',event=>{
      if(event.key!=='Escape') return;
      if(!menu.hidden){ event.preventDefault(); setMenuOpen(false); button.focus(); return; }
      if(step>=0){ event.preventDefault(); stopTour(); }
    },true);
    const tourAllows=target=>{
      if(step<0 || internalNavigation) return true;
      return (imageDialog && imageDialog.open && imageDialog.contains(target)) || coach.contains(target) || (activeTarget && (target===activeTarget || activeTarget.contains(target)));
    };
    const blockOutsideTour=event=>{
      if(step<0 || internalNavigation || tourAllows(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      try{(next.hidden?stop:next).focus();}catch(_){}
    };
    document.addEventListener('pointerdown',blockOutsideTour,true);
    document.addEventListener('click',event=>{
      if(step<0) return;
      if(!tourAllows(event.target)){ blockOutsideTour(event); return; }
      if(activeTarget && (event.target===activeTarget || activeTarget.contains(event.target)) && targetAdvance){
        const advance=targetAdvance; targetAdvance=null; advance();
      }
    },true);
    document.addEventListener('focusin',event=>{
      if(step>=0 && !tourAllows(event.target)){ event.stopImmediatePropagation(); try{(next.hidden?stop:next).focus();}catch(_){} }
    },true);
    window.addEventListener('resize',positionCoach);
    window.addEventListener('scroll',positionCoach,true);
    document.addEventListener('visibilitychange',()=>{
    });
    if(storageNS && storageNS.local){
      storageNS.local.get({[QUICK_GUIDE_SEEN_KEY]:false},stored=>{
        if(stored && stored[QUICK_GUIDE_SEEN_KEY]) return;
        button.classList.add('is-new');
        if(hint) hint.hidden=false;
      });
    }
  }

  function load(){
    // Collega subito gli eventi ai controlli statici. Il caricamento asincrono
    // dello storage aggiorna in seguito i valori visualizzati, ma non può più
    // impedire il salvataggio dei click dell'utente.
    wireUI();
    wireQuickGuide();
    if(!kv){ render(); renderTables(); return; }
    // Mostra immediatamente il mirror locale delle preferenze UI; la lettura
    // sync successiva rimane canonica e conferma i valori completi.
    if(storageNS.local){
      storageNS.local.get([UI_BACKUP_KEY, ...UI_KEYS], local=>{
        const backup=local && local[UI_BACKUP_KEY] && typeof local[UI_BACKUP_KEY] === 'object' ? uiPatchOf(local[UI_BACKUP_KEY]) : {};
        const immediateUi=Object.assign({},backup,uiPatchOf(local || {}));
        state=Object.assign({},state,immediateUi);
        applyUiControls(immediateUi);
      });
    }
    const proceed = ()=> kv.get(DEFAULTS, data=>{
      const synced = Object.assign({}, DEFAULTS, data || {});
      const applyLoaded = local => {
        const backup = local && local[UI_BACKUP_KEY] && typeof local[UI_BACKUP_KEY] === 'object' ? uiPatchOf(local[UI_BACKUP_KEY]) : {};
        const direct = uiPatchOf(local || {});
        const effectiveUi = {};
        UI_KEYS.forEach(key => {
          // sync e' la fonte canonica. Il locale serve solo come fallback se la
          // chiave non e' ancora presente in sync, evitando override obsoleti.
          if(data && Object.prototype.hasOwnProperty.call(data, key)) effectiveUi[key] = data[key];
          else if(Object.prototype.hasOwnProperty.call(direct, key)) effectiveUi[key] = direct[key];
          else if(Object.prototype.hasOwnProperty.call(backup, key)) effectiveUi[key] = backup[key];
        });
        state = Object.assign({}, synced, effectiveUi);
        state.quickFilters = sanitize(state.quickFilters);
      state.quickTables = sanitizeTables(state.quickTables);

      applyUiControls(state);

      render();
      renderTables();
        wireUI();
      };
      if(storageNS.local) storageNS.local.get([UI_BACKUP_KEY, ...UI_KEYS], applyLoaded);
      else applyLoaded({});
    });
    // Default neutri; la prima installazione è inizializzata dal service worker.
    proceed();
  }

  // ===== Esporta / Importa impostazioni (file JSON) =====
  // Solo configurazione persistente: cache, job e stato di sessione restano esclusi.
  const LEGACY_URL_KEYS = ['baseUrl','page8700Url'];
  const IO_KEYS = Object.keys(DEFAULTS);
  const ZPL_MODELS_KEY = 'bcToolsZplModels';
  const MAX_ZPL_MODELS = 5;
  const IO_BOOLEAN_KEYS = new Set([
    'hideNotificationsButton','showValuesInMonospace','showHyphensInColumnCaptions','pageFieldCopyEnabled','pageFieldCopyClickable','pageFieldCopyFlowField','pageFieldCopyGlobalPreferences','autoShowMore',
    'highlightStatusRows','autoOpenHomeSearch','showPageFieldCopyButton','showCreatedDocumentButton','autoSortFirstColumn','autoWide','forceFactbox'
  ]);
  let ioWired = false;

  function ioValue(key, value){
    if(COPY_VISIBILITY_KEYS.includes(key)) return Array.isArray(value) ? value.filter(item=>typeof item === 'string' && /^copy-[a-z0-9]+$/.test(item)).slice(0,5000) : [];
    if(['pageFieldCopyEnabled','pageFieldCopyClickable','pageFieldCopyFlowField'].includes(key)) return typeof value === 'boolean' ? value : null;
    if(key === 'quickFilters') return sanitize(value);
    if(key === 'quickTables') return sanitizeTables(value);
    if(key === 'includedPages') return [...new Set(String(value || '').split(/[\s,;]+/).filter(v=>/^\d+$/.test(v)))].sort((a,b)=>Number(a)-Number(b)).join(', ');
    if(key === 'includedPageNames') return value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(([id,name])=>/^\d+$/.test(id) && String(name || '').trim()).map(([id,name])=>[id,String(name).replace(/\s+/g,' ').trim().slice(0,160)])) : {};
    if(key === 'optionsLayout') return Array.isArray(value) ? [...new Set(value.filter(v=>typeof v === 'string'))] : [];
    if(key === 'pageFieldCopyMode') return ['none','underlined','teal','both'].includes(value) ? value : 'none';
    if(IO_BOOLEAN_KEYS.has(key)) return value === true;
    if(key === 'layoutMode') return value === 'normal' ? 'normal' : 'wide';
    if(key === 'factboxMode') return value === 'open' ? 'open' : 'closed';
    if(key === 'sortDirection') return value === 'asc' ? 'asc' : 'desc';
    if(key === 'uiTheme') return value === 'dark' ? 'dark' : 'light';
    if(key === 'popupLayout') return value === 'vertical' ? 'vertical' : 'a';
    return value;
  }

  function sanitizeZplModels(value){
    if(!Array.isArray(value)) return [];
    return value.slice(0, MAX_ZPL_MODELS).map(model=>{
      if(!model || typeof model !== 'object') return null;
      const name=String(model.name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      const zpl=typeof model.zpl === 'string' ? model.zpl : '';
      if(!name || !zpl) return null;
      const density=['6','8','12','24'].includes(String(model.density)) ? String(model.density) : '8';
      const width=Number(model.width), height=Number(model.height), labelIndex=Number(model.index);
      return {
        name, zpl, density,
        width:Number.isFinite(width) && width > 0 && width <= 50 ? width : 4,
        height:Number.isFinite(height) && height > 0 && height <= 50 ? height : 6,
        index:Number.isInteger(labelIndex) && labelIndex >= 0 ? labelIndex : 0,
        tableSnapshot:model.tableSnapshot && typeof model.tableSnapshot === 'object' ? model.tableSnapshot : null
      };
    }).filter(Boolean);
  }

  function readCurrentSettings(done){
    if(!kv){ done(null); return; }
    kv.get(DEFAULTS,(synced,syncResult)=>{
      if(!syncResult.ok){done(null);return;}
      const finish = local=>{
        const backup = local && local[UI_BACKUP_KEY] && typeof local[UI_BACKUP_KEY] === 'object' ? uiPatchOf(local[UI_BACKUP_KEY]) : {};
        const direct = uiPatchOf(local || {});
        const settings = Object.assign({}, DEFAULTS, synced || {}, backup, direct);
        COPY_VISIBILITY_KEYS.forEach(key=>{ settings[key] = ioValue(key, local && local[key]); });
        if(!['none','underlined','teal','both'].includes(settings.pageFieldCopyMode)){
          settings.pageFieldCopyMode=settings.showPageFieldCopyButton?'both':'none';
        }
        settings[ZPL_MODELS_KEY] = sanitizeZplModels(local && local[ZPL_MODELS_KEY]);
        done(settings);
      };
      if(storageNS && storageNS.local) storageNS.local.get([UI_BACKUP_KEY, ZPL_MODELS_KEY, ...UI_KEYS, ...COPY_VISIBILITY_KEYS], finish);
      else finish({});
    });
  }

  function downloadSettings(settings){
    const out = { _app:'BC_tools', _type:'settings', _version:4, _exportedAt:new Date().toISOString() };
    IO_KEYS.forEach(key=>{ if(settings[key] !== undefined) out[key] = ioValue(key, settings[key]); });
    COPY_VISIBILITY_KEYS.forEach(key=>{ out[key] = ioValue(key, settings[key]); });
    out[ZPL_MODELS_KEY] = sanitizeZplModels(settings[ZPL_MODELS_KEY]);
    const blob = new Blob([JSON.stringify(out, null, 2)], {type:'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date();
    const stamp = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    link.href = url;
    link.download = `bc_tools_settings_${stamp}.json`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(()=>{ link.remove(); URL.revokeObjectURL(url); }, 1000);
  }

  function saveImportedSettings(patch, zplModels, done){
    if(!kv){ done(false); return; }
    const syncPatch = Object.fromEntries(Object.entries(patch).filter(([key])=>!COPY_VISIBILITY_KEYS.includes(key)));
    const copyVisibilityPatch = Object.fromEntries(COPY_VISIBILITY_KEYS.filter(key=>Object.prototype.hasOwnProperty.call(patch,key)).map(key=>[key,ioValue(key,patch[key])]));
    const saveLocal = ()=>{
      if(!storageNS.local){ done(!Object.keys(copyVisibilityPatch).length); return; }
      const uiPatch = uiPatchOf(patch);
      storageNS.local.get({[UI_BACKUP_KEY]:{}},(current,getResult)=>{
        if(!getResult.ok){done(false);return;}
        const backup = Object.assign({}, current[UI_BACKUP_KEY] || {}, uiPatch);
        const localPatch = Object.assign({[UI_BACKUP_KEY]:backup}, uiPatch, copyVisibilityPatch);
        if(zplModels !== undefined) localPatch[ZPL_MODELS_KEY] = sanitizeZplModels(zplModels);
        storageNS.local.set(localPatch,(_value,setResult)=>done(setResult.ok));
      });
    };
    if(!Object.keys(syncPatch).length){ saveLocal(); return; }
    kv.set(syncPatch,(_unused,syncResult)=>{
      if(!syncResult.ok){done(false);return;}
      saveLocal();
    });
  }

  const DIAGNOSTIC_KEY = 'bcToolsDiagnostics';
  function downloadDiagnosticJson(value, filename){
    const blob = new Blob([JSON.stringify(value, null, 2)], {type:'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href=url; link.download=filename; link.style.display='none'; document.body.appendChild(link); link.click();
    setTimeout(()=>{ link.remove(); URL.revokeObjectURL(url); },1000);
  }
  function wireDiagnostics(){
    const exportBtn=document.getElementById('diagnosticsExportBtn'), clearBtn=document.getElementById('diagnosticsClearBtn'), status=document.getElementById('diagnosticsStatus');
    if(!exportBtn || !clearBtn || !storageNS || !storageNS.local) return;
    const setStatus=text=>{ if(status) status.textContent=text; };
    exportBtn.addEventListener('click',()=>{
      exportBtn.disabled=true;
      storageNS.local.get({[DIAGNOSTIC_KEY]:[]},(stored,result)=>{
        exportBtn.disabled=false;
        if(!result.ok){setStatus('Lettura non riuscita');return;}
        const entries=Array.isArray(stored[DIAGNOSTIC_KEY])?stored[DIAGNOSTIC_KEY]:[], now=new Date();
        const stamp=now.toISOString().replace(/[:.]/g,'-');
        downloadDiagnosticJson({_app:'BC_tools',_type:'diagnostics',_version:2,_exportedAt:now.toISOString(),count:entries.length,entries},`bc_tools_diagnostics_${stamp}.json`);
        setStatus(`Esportati ${entries.length} eventi`);
      });
    });
    clearBtn.addEventListener('click',()=>{
      if(!confirm('Cancellare tutti i log diagnostici locali?')) return;
      clearBtn.disabled=true;
      storageNS.local.remove(DIAGNOSTIC_KEY,(_value,result)=>{clearBtn.disabled=false;setStatus(result.ok?'Diagnostica cancellata':'Cancellazione non riuscita');});
    });
  }
  const RECOMMENDED_PRESET_DECISION_KEY='bcToolsRecommendedPresetDecision';
  const RECOMMENDED_PRESET={hideNotificationsButton:true,showValuesInMonospace:true,showHyphensInColumnCaptions:true,autoOpenHomeSearch:true,showPageFieldCopyButton:false,pageFieldCopyMode:'both',showCreatedDocumentButton:true,autoSortFirstColumn:true,sortDirection:'desc',uiTheme:'dark',popupLayout:'a',includedPages:'7339, 9305, 9312, 9313, 9343, 9344',includedPageNames:{'7339':'Warehouse Shipments','9305':'Sales Orders','9312':'Warehouse Put-aways','9313':'Warehouse Picks','9343':'Registered Warehouse Put-aways','9344':'Registered Warehouse Picks'},optionsLayout:[],quickFilters:[{label:'OdV',page:'9305',field:'No.',astLeft:true,astRight:false,hideInPopup:false},{label:'Sped Ware',page:'7339',field:'No.',astLeft:true,astRight:false,hideInPopup:false},{label:'Prel Ware',page:'9313',field:'No.',astLeft:true,astRight:false,hideInPopup:true},{label:'Prel Ware Reg',page:'9344',field:'No.',astLeft:true,astRight:false,hideInPopup:true},{label:'Item BC',page:'31',field:'No.',astLeft:true,astRight:false,hideInPopup:false},{label:'Stoc Ware',page:'9312',field:'No.',astLeft:true,astRight:false,hideInPopup:true}],quickTables:[{label:'Righe Car War',table:'7317'},{label:'Righe Car War Reg',table:'7319'},{label:'Righe attività warehouse',table:'5767'},{label:'Righe attività warehouse reg',table:'5773'}]};
  function recommendedPresetPatch(){const patch={};IO_KEYS.forEach(key=>{if(Object.prototype.hasOwnProperty.call(RECOMMENDED_PRESET,key))patch[key]=ioValue(key,RECOMMENDED_PRESET[key]);});return patch;}
  const RECOMMENDED_PRESET_UI=[
    ['Nascondi notifiche','hideNotificationsButton','Attivo'],['Valori in monospace','showValuesInMonospace','Attivo'],['Sillabazione caption','showHyphensInColumnCaptions','Attiva'],['Ricerca nella pagina principale','autoOpenHomeSearch','Attiva'],['Copia codice articolo','showItemCopyButton','Attiva'],['Copia campi cliccabili','showPageFieldCopyButton','Attiva'],['Apertura documenti creati','showCreatedDocumentButton','Attiva'],['Layout popup','popupLayout','A'],['Tema','uiTheme','Dark'],['Ordinamento automatico','autoSortFirstColumn','Attivo'],['Direzione','sortDirection','Decrescente']
  ];
  RECOMMENDED_PRESET.autoWide=true;
  RECOMMENDED_PRESET.forceFactbox=true;
  RECOMMENDED_PRESET_UI.push(['Layout pagina','autoWide','Wide automatico'],['FactBox','forceFactbox','Chiusa automaticamente']);
  const copyItemPresetRow=RECOMMENDED_PRESET_UI.findIndex(([,key])=>key==='showItemCopyButton');
  if(copyItemPresetRow>=0)RECOMMENDED_PRESET_UI.splice(copyItemPresetRow,1);
  const pageFieldPresetRow=RECOMMENDED_PRESET_UI.find(([,key])=>key==='showPageFieldCopyButton');
  if(pageFieldPresetRow){pageFieldPresetRow[1]='pageFieldCopyMode';pageFieldPresetRow[2]='Entrambi';}
  const recommendedPresetIcon=path=>`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
  function renderRecommendedPresetPreview(){
    const summary=document.getElementById('recommendedPresetSummary'),grid=document.getElementById('recommendedPresetCards');
    if(!summary||!grid)return;
    const pages=String(RECOMMENDED_PRESET.includedPages||'').split(',').map(value=>value.trim()).filter(Boolean);
    const filters=Array.isArray(RECOMMENDED_PRESET.quickFilters)?RECOMMENDED_PRESET.quickFilters:[];
    const tables=Array.isArray(RECOMMENDED_PRESET.quickTables)?RECOMMENDED_PRESET.quickTables:[];
    const metrics=[[RECOMMENDED_PRESET_UI.length,'migliorie UI'],[pages.length,'pagine per ordinamento'],[filters.length,'ricerche e filtri'],[tables.length,'tabelle salvate'],[0,'modelli ZPL']];
    summary.replaceChildren(...metrics.map(([value,label])=>{const item=document.createElement('div');item.className='recommended-preset-summary-item';const number=document.createElement('strong');number.textContent=String(value);const text=document.createElement('span');text.textContent=label;item.append(number,text);return item;}));
    const card=(id,title,count,iconPath,wide=false)=>{const section=document.createElement('section');section.id=id;section.className='recommended-preset-card'+(wide?' recommended-preset-card-wide':'');section.tabIndex=-1;const head=document.createElement('header');head.className='recommended-preset-card-header';const icon=document.createElement('span');icon.className='recommended-preset-card-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML=recommendedPresetIcon(iconPath);const heading=document.createElement('h3');heading.textContent=title;const badge=document.createElement('span');badge.className='recommended-preset-count';badge.textContent=String(count);head.append(icon,heading,badge);section.append(head);return section;};
    const chip=(text,positive=false)=>{const item=document.createElement('span');item.className='recommended-preset-chip'+(positive?' recommended-preset-chip-good':'');item.textContent=(positive?'✓ ':'')+text;return item;};
    const ui=card('recommendedPresetUi','Migliorie UI',RECOMMENDED_PRESET_UI.length,'M4 5h16M4 12h16M4 19h16M8 3v4M15 10v4M11 17v4',true);const uiList=document.createElement('div');uiList.className='recommended-preset-values';RECOMMENDED_PRESET_UI.forEach(([label,key,fallback])=>{const row=document.createElement('div');row.className='recommended-preset-value-row';const name=document.createElement('span');name.textContent=label;const raw=RECOMMENDED_PRESET[key];let value=fallback;if(typeof raw==='boolean')value=raw?'Attivo':'Disattivo';row.append(name,chip(value,raw===true));uiList.append(row);});ui.append(uiList);
    const sort=card('recommendedPresetSort','Ordinamento automatico',pages.length,'M7 6h10M7 12h7M7 18h4');const sortList=document.createElement('div');sortList.className='recommended-preset-list';pages.forEach(page=>{const row=document.createElement('div');row.className='recommended-preset-id-row';const id=document.createElement('code');id.textContent=page;const name=document.createElement('span');name.textContent=(RECOMMENDED_PRESET.includedPageNames||{})[page]||'Pagina Business Central';row.append(id,name);sortList.append(row);});sort.append(sortList);
    const filterCard=card('recommendedPresetFilters','Ricerca e filtri',filters.length,'M4 6h16M7 12h10M10 18h4',true);const filterList=document.createElement('div');filterList.className='recommended-preset-list';filters.forEach(filter=>{const row=document.createElement('article');row.className='recommended-preset-filter';const title=document.createElement('strong');title.textContent=filter.label||'Filtro';const meta=document.createElement('div');meta.className='recommended-preset-filter-meta';meta.append(chip(`Pagina ${filter.page||''}`),chip(`Campo ${filter.field||''}`));if(filter.astLeft)meta.append(chip('Prefisso *'));if(filter.astRight)meta.append(chip('Suffisso *'));meta.append(chip(filter.hideInPopup?'Solo menu contestuale':'Nel popup'));row.append(title,meta);filterList.append(row);});filterCard.append(filterList);
    const tableCard=card('recommendedPresetTables','Tabelle salvate',tables.length,'M4 5h16v14H4zM4 10h16M10 5v14');const tableList=document.createElement('div');tableList.className='recommended-preset-list';tables.forEach(table=>{const row=document.createElement('div');row.className='recommended-preset-id-row';const id=document.createElement('code');id.textContent=table.table||'';const label=document.createElement('span');label.textContent=table.label||'Tabella';row.append(id,label);tableList.append(row);});tableCard.append(tableList);
    const empty=card('recommendedPresetZpl','Modelli ZPL',0,'M7 3h8l4 4v14H7zM15 3v5h5');const empties=document.createElement('div');empties.className='recommended-preset-empty-list';const item=document.createElement('div');item.className='recommended-preset-empty';const visual=document.createElement('span');visual.setAttribute('aria-hidden','true');visual.innerHTML=recommendedPresetIcon('M7 3h8l4 4v14H7zM15 3v5h5');const label=document.createElement('span');label.textContent='Nessun modello ZPL incluso';item.append(visual,label);empties.append(item);empty.append(empties);
    grid.replaceChildren(ui,sort,filterCard,tableCard,empty);
  }
  function wireRecommendedPreset(){
    const o=document.getElementById('recommendedPresetOpen'),d=document.getElementById('recommendedPresetDialog'),x=document.getElementById('recommendedPresetClose'),n=document.getElementById('recommendedPresetLater'),a=document.getElementById('recommendedPresetApply'),p=document.getElementById('recommendedPresetProgress'),t=document.getElementById('recommendedPresetProgressText'),content=document.getElementById('recommendedPresetContent'),intro=document.getElementById('recommendedPresetIntro'),error=document.getElementById('recommendedPresetError');
    if(!o||!d||!x||!n||!a||!p||!t||!content||!intro||!error)return;
    renderRecommendedPresetPreview();
    let opener=null,applying=false,minimumTimer=null,savedScrollTop=0;
    const controls=[x,n,a];
    const close=()=>{if(!applying&&d.open)d.close();};
    // Invariante UX: ogni chiusura volontaria dell'invito equivale a "Non ora".
    const dismissSuggestion=()=>{
      if(applying)return;
      storageNS.local.set({[RECOMMENDED_PRESET_DECISION_KEY]:'ignored'});
      close();
    };
    const setState=(name,message)=>{
      if(!d.isConnected)return false;
      if(name==='saving')savedScrollTop=content.scrollTop;
      d.classList.remove('is-saving','is-success','is-error');
      if(name!=='idle')d.classList.add(`is-${name}`);
      p.hidden=name==='idle'||name==='error';
      t.textContent=message||'';
      error.hidden=name!=='error';
      error.textContent=name==='error'?(message||'Applicazione non riuscita. Riprova.'):' ';
      d.setAttribute('aria-busy',name==='saving'?'true':'false');
      if(name==='error'){content.scrollTop=savedScrollTop;}
      return true;
    };
    const setControlsDisabled=disabled=>controls.forEach(button=>{button.disabled=disabled;});
    const open=e=>{opener=e.currentTarget;setState('idle','');d.showModal();document.documentElement.classList.add('recommended-preset-lock');requestAnimationFrame(()=>intro.focus());};
    const showError=()=>{
      if(minimumTimer!==null){clearTimeout(minimumTimer);minimumTimer=null;}
      applying=false;
      if(!setState('error','Applicazione non riuscita. Riprova.'))return;
      setControlsDisabled(false);
      try{a.focus();}catch(_){}
    };
    o.addEventListener('click',open);x.addEventListener('click',dismissSuggestion);
    content.querySelectorAll('[data-recommended-preset-target]').forEach(button=>button.addEventListener('click',()=>{const target=document.getElementById(button.dataset.recommendedPresetTarget);if(!target)return;target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});target.focus({preventScroll:true});}));
    d.addEventListener('cancel',e=>{e.preventDefault();if(!applying)dismissSuggestion();});
    d.addEventListener('click',e=>{if(e.target===d&&applying)e.preventDefault();});
    d.addEventListener('close',()=>{document.documentElement.classList.remove('recommended-preset-lock');if(opener&&!opener.hidden)opener.focus();});
    n.addEventListener('click',dismissSuggestion);
    a.addEventListener('click',()=>{
      if(applying)return;
      applying=true;setControlsDisabled(true);setState('saving','Applicazione configurazione in corso…');
      const minimumDuration=700+Math.floor(Math.random()*601);let saveSettled=false;
      const minimumElapsed=new Promise(resolve=>{minimumTimer=setTimeout(()=>{minimumTimer=null;resolve();},minimumDuration);});
      const settingsSaved=new Promise((resolve,reject)=>{saveImportedSettings(recommendedPresetPatch(),[],ok=>{if(saveSettled)return;saveSettled=true;if(ok)resolve();else reject(new Error('Salvataggio non riuscito'));});});
      Promise.all([settingsSaved,minimumElapsed]).then(()=>{if(!d.isConnected)throw new Error('Dialog non disponibile');storageNS.local.set({[RECOMMENDED_PRESET_DECISION_KEY]:'applied',bcToolsOnboardingState:'preset-applied'},()=>{if(typeof chrome!=='undefined'&&chrome.runtime&&chrome.runtime.lastError){showError();return;}if(!setState('success','Configurazione applicata'))return;setTimeout(()=>location.reload(),700);});}).catch(showError);
    });
  }

  function wireImportExport(){
    if(ioWired) return;
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const importFile = document.getElementById('importFile');
    if(!exportBtn || !importBtn || !importFile) return;
    ioWired = true;
    wireDiagnostics();

    exportBtn.addEventListener('click', ()=>{
      exportBtn.disabled = true;
      readCurrentSettings(settings=>{
        try{
          downloadSettings(settings);
          showSaved();
        }catch(error){
          alert(`Export non riuscito: ${error && error.message ? error.message : 'errore sconosciuto'}`);
        }finally{
          exportBtn.disabled = false;
        }
      });
    });

    importBtn.addEventListener('click', ()=>{
      importFile.value='';
      try{
        if(typeof importFile.showPicker === 'function') importFile.showPicker();
        else importFile.click();
      }catch(_){ importFile.click(); }
    });

    importFile.addEventListener('change', ()=>{
      const file = importFile.files && importFile.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = ()=>{
        let data;
        try{ data = JSON.parse(String(reader.result || '')); }
        catch(_){ alert('File non valido: non è un JSON leggibile.'); importFile.value=''; return; }
        if(!data || typeof data !== 'object' || Array.isArray(data)){
          alert('File non valido: contenuto non riconosciuto.'); importFile.value=''; return;
        }
        if(data._app !== undefined && data._app !== 'BC_tools'){
          alert('File non valido: non è un export di BC_tools.'); importFile.value=''; return;
        }
        const patch = {};
        IO_KEYS.forEach(key=>{
          if(Object.prototype.hasOwnProperty.call(data, key)) patch[key] = ioValue(key, data[key]);
        });
        COPY_VISIBILITY_KEYS.forEach(key=>{
          if(Object.prototype.hasOwnProperty.call(data, key)) patch[key] = ioValue(key, data[key]);
        });
        const hasLegacyUrlFields = LEGACY_URL_KEYS.some(key=>Object.prototype.hasOwnProperty.call(data, key));
        const hasZplModels = Object.prototype.hasOwnProperty.call(data, ZPL_MODELS_KEY);
        const zplModels = hasZplModels ? sanitizeZplModels(data[ZPL_MODELS_KEY]) : undefined;
        if(!Object.keys(patch).length && !hasZplModels && !hasLegacyUrlFields){
          alert('Nel file non ci sono impostazioni riconosciute.'); importFile.value=''; return;
        }
        const visibilitySummary = (hiddenKey, shownKey)=>{
          const items=[];
          if(Object.prototype.hasOwnProperty.call(patch,hiddenKey)) items.push(`${patch[hiddenKey].length} nascoste`);
          if(Object.prototype.hasOwnProperty.call(patch,shownKey)) items.push(`${patch[shownKey].length} mostrate`);
          return items.join(', ') || '—';
        };
        const msg = `Importare e SOVRASCRIVERE le impostazioni presenti nel file?\n\n`
          + `Filtri: ${patch.quickFilters ? patch.quickFilters.length : '—'}\n`
          + `Tabelle: ${patch.quickTables ? patch.quickTables.length : '—'}\n`
          + `Modelli ZPL: ${hasZplModels ? zplModels.length : '—'}\n`
          + `Preferenze contestuali Mostra/Nascondi: ${visibilitySummary(HIDDEN_COPY_FIELDS_KEY, SHOWN_COPY_FIELDS_KEY)}\n`
          + `Preferenze globali Mostra/Nascondi: ${visibilitySummary(GLOBAL_HIDDEN_COPY_FIELDS_KEY, GLOBAL_SHOWN_COPY_FIELDS_KEY)}\n`
          + `Pagine incluse: ${Object.prototype.hasOwnProperty.call(patch, 'includedPages') ? (patch.includedPages || 'nessuna') : '—'}\n`
          + `Ordine box: ${patch.optionsLayout ? 'incluso' : '—'}`;
        if(!confirm(msg)){ importFile.value=''; return; }
        importFile.value='';
        if(!Object.keys(patch).length && !hasZplModels){ showSaved(); return; }
        importBtn.disabled = true;
        saveImportedSettings(patch, zplModels, saved=>{
          importBtn.disabled = false;
          if(saved){ state=Object.assign({},state,patch); location.reload(); }
          else alert('Import non riuscito: le impostazioni non sono state salvate.');
        });
      };
      reader.onerror = ()=>{ alert('Lettura del file non riuscita.'); importFile.value=''; };
      reader.readAsText(file);
    });
  }

  function wireUI(){
    wireImportExport();
    wireRecommendedPreset();
    if(uiWired) return;
    uiWired = true;
    ['hideNotificationsButton','showValuesInMonospace','showHyphensInColumnCaptions','highlightStatusRows','autoOpenHomeSearch','showCreatedDocumentButton','enableTableExport','saldoArticoloMovimentiWarehouse','autoSortFirstColumn','autoWide','forceFactbox','autoShowMore'].forEach(id=>{
      const el = document.getElementById(id);
      if(!el) return;
      el.addEventListener('change', ()=>{
        const p={}; p[id]=el.checked; persist(p);
        if(id==='autoSortFirstColumn') toggleBox('sortDirectionBox', el.checked);
      });
    });

    const sortDirEl = document.getElementById('sortDirection');
    if(sortDirEl) sortDirEl.addEventListener('change', ()=>{
      persist({ sortDirection: sortDirEl.value === 'asc' ? 'asc' : 'desc' });
    });
    const popupLayoutEl = document.getElementById('popupLayout');
    if(popupLayoutEl) popupLayoutEl.addEventListener('change', ()=>{
      const value = popupLayoutEl.value === 'vertical' ? 'vertical' : 'a';
      persist({ popupLayout:value });
    });
    const layoutModeEl=document.getElementById('layoutMode');
    if(layoutModeEl) layoutModeEl.addEventListener('change',()=>persist({layoutMode:layoutModeEl.value === 'normal' ? 'normal' : 'wide'}));
    const factboxModeEl=document.getElementById('factboxMode');
    if(factboxModeEl) factboxModeEl.addEventListener('change',()=>persist({factboxMode:factboxModeEl.value === 'open' ? 'open' : 'closed'}));
    const pageFieldCopyEnabled=document.getElementById('showPageFieldCopyButton');
    const pageFieldCopyClickable=document.getElementById('pageFieldCopyClickable');
    const pageFieldCopyFlowField=document.getElementById('pageFieldCopyFlowField');
    const pageFieldCopyGlobalPreferences=document.getElementById('pageFieldCopyGlobalPreferences');
    const saveCopySettings=()=>{
      const clickable=pageFieldCopyClickable.checked, flowField=pageFieldCopyFlowField.checked;
      const mode=clickable?(flowField?'both':'underlined'):(flowField?'teal':'none');
      persist({
        showPageFieldCopyButton:pageFieldCopyEnabled.checked,
        pageFieldCopyEnabled:pageFieldCopyEnabled.checked,
        pageFieldCopyClickable:clickable,
        pageFieldCopyFlowField:flowField,
        pageFieldCopyGlobalPreferences:pageFieldCopyGlobalPreferences.checked,
        pageFieldCopyMode:mode
      });
    };
    if(pageFieldCopyEnabled && pageFieldCopyClickable && pageFieldCopyFlowField && pageFieldCopyGlobalPreferences){
      pageFieldCopyEnabled.addEventListener('change',saveCopySettings);
      pageFieldCopyClickable.addEventListener('change',saveCopySettings);
      pageFieldCopyFlowField.addEventListener('change',saveCopySettings);
      pageFieldCopyGlobalPreferences.addEventListener('change',saveCopySettings);
    }
    const restoreHiddenCopyButtons = document.getElementById('restoreHiddenCopyButtons');
    const restoreHiddenCopyButtonsStatus = document.getElementById('restoreHiddenCopyButtonsStatus');
    if(restoreHiddenCopyButtons) restoreHiddenCopyButtons.addEventListener('click', ()=>{
      restoreHiddenCopyButtons.disabled = true;
      storageNS.local.remove(COPY_VISIBILITY_KEYS,(_value,result)=>{
        restoreHiddenCopyButtons.disabled = false;
        if(restoreHiddenCopyButtonsStatus) restoreHiddenCopyButtonsStatus.textContent = result.ok
          ? 'Le preferenze contestuali e globali di visibilità dei pulsanti Copia sono state ripristinate.'
          : 'Ripristino non riuscito.';
      });
    });

    // ===== existing MVP input logic (kept) =====
    filtersArea.addEventListener('input', e=>{
      const row = e.target.closest('.filters-row'); if(!row) return;
      const i = parseInt(row.dataset.idx, 10);
      const isPlaceholder = row.dataset.placeholder==='1';
      const active = document.activeElement;
      const activeClass = (active && active.classList)?(active.classList.contains('f-label')?'f-label':active.classList.contains('f-page')?'f-page':active.classList.contains('f-field')?'f-field':null):null;
      const caretPos = (active && typeof active.selectionStart==='number')?active.selectionStart:null;
      const labelEl=row.querySelector('.f-label'); const pageRowEl=row.querySelector('.f-page'); const fieldEl=row.querySelector('.f-field');
      const L=labelEl.value.trim(); const P=(pageRowEl.value||'').replace(/\D+/g,''); const F=fieldEl.value.trim(); if(pageRowEl.value!==P){ pageRowEl.value=P; }
      if(isPlaceholder){
        const cur=sanitize(state.quickFilters);
        if(L||P||F){
          cur.push({label:L,page:P,field:F,astLeft:false,astRight:false,hideInPopup:false});
          state.quickFilters=cur;
          persist({quickFilters:state.quickFilters}, ()=>{ render(); restoreFocus(i,activeClass,caretPos); });
          return;
        }
      } else {
        const cur=sanitize(state.quickFilters);
        // Preserve the existing wildcard and visibility choices.
        if(i<cur.length){ cur[i]={...cur[i], label:L, page:P, field:F}; state.quickFilters=cur; persist({quickFilters:state.quickFilters}); }
      }
    });

    function restoreFocus(rowIndex, cls, caret){
      if(!cls) return;
      const rows=filtersArea.querySelectorAll('.filters-row');
      const targetRow=rows[rowIndex];
      if(!targetRow) return;
      const el=targetRow.querySelector('.'+cls);
      if(el){ el.focus(); if(typeof caret==='number' && el.setSelectionRange){ try{ el.setSelectionRange(caret, caret);}catch(_){} } }
    }

    filtersArea.addEventListener('keydown', (e)=>{
      const input=e.target.closest('.f-page'); if(!input) return;
      const allowed=['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'];
      if(allowed.includes(e.key)) return;
      if((e.ctrlKey||e.metaKey) && ['a','c','v','x','z','y','A','C','V','X','Z','Y'].includes(e.key)) return;
      if(!/^\d$/.test(e.key)) e.preventDefault();
    }, true);

    filtersArea.addEventListener('paste', (e)=>{
      const input=e.target.closest('.f-page'); if(!input) return;
      e.preventDefault();
      const txt=(e.clipboardData||window.clipboardData).getData('text')||'';
      const only=txt.replace(/\D+/g,'');
      const start=input.selectionStart||0; const end=input.selectionEnd||0; const val=input.value||'';
      input.value = val.slice(0,start)+only+val.slice(end);
      const caret=start+only.length; try{ input.setSelectionRange(caret, caret);}catch(_){}
      input.dispatchEvent(new Event('input',{bubbles:true}));
    }, true);

    filtersArea.addEventListener('change', e=>{
      const row=e.target.closest('.filters-row'); if(!row) return; const i=parseInt(row.dataset.idx, 10);
      if(!(e.target.classList.contains('astL') || e.target.classList.contains('astR') || e.target.classList.contains('hidePop'))) return;
      let cur=sanitize(state.quickFilters);
      if(row.dataset.placeholder==='1'){
        cur.push({label:'',page:'',field:'',astLeft:e.target.classList.contains('astL')?e.target.checked:false,astRight:e.target.classList.contains('astR')?e.target.checked:false,hideInPopup:e.target.classList.contains('hidePop')?e.target.checked:false});
        state.quickFilters=cur; persist({quickFilters:state.quickFilters}, ()=>render());
        return;
      }
      if(i<cur.length){
        const it=cur[i]||{label:'',page:'',field:''};
        if(e.target.classList.contains('astL')) it.astLeft=e.target.checked;
        if(e.target.classList.contains('astR')) it.astRight=e.target.checked;
        if(e.target.classList.contains('hidePop')) it.hideInPopup=e.target.checked;
        cur[i]=it; state.quickFilters=cur; persist({quickFilters:state.quickFilters});
      }
    });

    filtersArea.addEventListener('click', e=>{
      const rm=e.target.closest('.removeBtn'); if(!rm) return;
      const row=rm.closest('.filters-row'); const i=parseInt(row.dataset.idx, 10);
      if(row.dataset.placeholder==='1') return;
      const cur=sanitize(state.quickFilters);
      if(i<cur.length){ cur.splice(i,1); state.quickFilters=cur; persist({quickFilters:state.quickFilters}, ()=>render()); }
    });

    // ===== Tabelle (apertura diretta) =====
    function wireTableSection(area, key, renderFn){
      function restoreTableFocus(rowIndex, cls, caret){
        if(!cls) return;
        const rows=area.querySelectorAll('.tables-row');
        const targetRow=rows[rowIndex];
        if(!targetRow) return;
        const el=targetRow.querySelector('.'+cls);
        if(el){ el.focus(); if(typeof caret==='number' && el.setSelectionRange){ try{ el.setSelectionRange(caret, caret);}catch(_){} } }
      }

      area.addEventListener('input', e=>{
        const row = e.target.closest('.tables-row'); if(!row) return;
        const i = parseInt(row.dataset.idx, 10);
        const isPlaceholder = row.dataset.placeholder==='1';
        const active = document.activeElement;
        const activeClass = (active && active.classList)?(active.classList.contains('t-label')?'t-label':active.classList.contains('t-table')?'t-table':null):null;
        const caretPos = (active && typeof active.selectionStart==='number')?active.selectionStart:null;
        const labelEl=row.querySelector('.t-label'); const tableEl=row.querySelector('.t-table');
        const L=labelEl.value.trim(); const T=(tableEl.value||'').replace(/\D+/g,''); if(tableEl.value!==T){ tableEl.value=T; }
        if(isPlaceholder){
          const cur=sanitizeTables(state[key]);
          if(L||T){
            cur.push({label:L,table:T});
            state[key]=cur;
            persist({[key]:state[key]}, ()=>{ renderFn(); restoreTableFocus(i,activeClass,caretPos); });
            return;
          }
        } else {
          const cur=sanitizeTables(state[key]);
          if(i<cur.length){ cur[i]={label:L,table:T}; state[key]=cur; persist({[key]:state[key]}); }
        }
      });

      area.addEventListener('keydown', (e)=>{
        const input=e.target.closest('.t-table'); if(!input) return;
        const allowed=['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'];
        if(allowed.includes(e.key)) return;
        if((e.ctrlKey||e.metaKey) && ['a','c','v','x','z','y','A','C','V','X','Z','Y'].includes(e.key)) return;
        if(!/^\d$/.test(e.key)) e.preventDefault();
      }, true);

      area.addEventListener('paste', (e)=>{
        const input=e.target.closest('.t-table'); if(!input) return;
        e.preventDefault();
        const txt=(e.clipboardData||window.clipboardData).getData('text')||'';
        const only=txt.replace(/\D+/g,'');
        const start=input.selectionStart||0; const end=input.selectionEnd||0; const val=input.value||'';
        input.value = val.slice(0,start)+only+val.slice(end);
        const caret=start+only.length; try{ input.setSelectionRange(caret, caret);}catch(_){}
        input.dispatchEvent(new Event('input',{bubbles:true}));
      }, true);

      area.addEventListener('click', e=>{
        const rm=e.target.closest('.t-removeBtn'); if(!rm) return;
        const row=rm.closest('.tables-row'); const i=parseInt(row.dataset.idx, 10);
        if(row.dataset.placeholder==='1') return;
        const cur=sanitizeTables(state[key]);
        if(i<cur.length){ cur.splice(i,1); state[key]=cur; persist({[key]:state[key]}, ()=>renderFn()); }
      });
    }

    wireTableSection(tablesArea, 'quickTables', renderTables);


  }

  function refreshOpenedSettingsSection(){
    // I controlli Importa/Esporta vengono collegati anche quando la relativa
    // sezione viene montata nel dettaglio dopo l'avvio della pagina.
    wireImportExport();
    const refresh=()=>{
      const version=settingsSaveVersion;
      if(!kv){
        applyUiControls(state);
        render();
        renderTables();
        return;
      }
      kv.get(DEFAULTS, data=>{
        if(version!==settingsSaveVersion){
          settingsSaveChain.then(refresh);
          return;
        }
        state=Object.assign({},DEFAULTS,data || {});
        state.quickFilters=sanitize(state.quickFilters);
        state.quickTables=sanitizeTables(state.quickTables);
        applyUiControls(state);
        render();
        renderTables();
      });
    };
    settingsSaveChain.then(refresh);
  }
  document.addEventListener('bc-tools-settings-section-opened', refreshOpenedSettingsSection);
  load();
})();
