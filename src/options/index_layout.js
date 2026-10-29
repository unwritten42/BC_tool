// index_layout.js — Dashboard a card e viste dedicate delle Impostazioni.
(function () {
  'use strict';

  const sections = Array.from(document.querySelectorAll('section[data-box]'));
  const title = document.querySelector('h2');
  if (!title || !sections.length) return;

  const restoreLegacyView = () => {
    const app = document.getElementById('settingsApp');
    if (app) app.remove();
    document.body.classList.remove('detail-open', 'settings-customizing');
    sections.forEach(section => {
      section.hidden = false;
      section.removeAttribute('aria-hidden');
      section.classList.remove('settings-panel-active');
      if (!section.isConnected) document.body.appendChild(section);
    });
  };

  try {

  const ICONS = {
    ui: '<img src="../../assets/vendor/lucide/sliders-horizontal.svg" alt="">',
    filtri: '<img src="../../assets/vendor/lucide/search.svg" alt="">',
    tabelle: '<img src="../../assets/vendor/lucide/table-2.svg" alt="">',
    zpl: '<img src="../../assets/vendor/lucide/file-code.svg" alt="">',
    iofile: '<img src="../../assets/vendor/lucide/download.svg" alt="">',
    rdlc: '<img src="../../assets/vendor/lucide/file-check.svg" alt="">'
  };
  const META = {
    ui:{icon:ICONS.ui,title:'Migliorie UI',description:'Layout Wide, FactBox chiusa, visualizzazione e ordinamento automatico.',tags:['Wide','FactBox chiusa','Auto sort']},
    filtri:{icon:ICONS.filtri,title:'Ricerca e filtri',description:'Filtri rapidi, wildcard e visibilità nel popup.',tags:['Filtri salvati']},
    tabelle:{icon:ICONS.tabelle,title:'Tabelle',description:'Collegamenti diretti alle tabelle usate più spesso.',tags:['Tabelle salvate']},
    zpl:{icon:ICONS.zpl,title:'ZPL Viewer',description:'Incolla o importa ZPL e genera l’anteprima dell’etichetta.',tags:['ZPL','PNG','Labelary']},
    iofile:{icon:ICONS.iofile,title:'Importa / Esporta',description:'Backup, ripristino e migrazione delle impostazioni.',tags:['JSON','Backup completo']},
    rdlc:{icon:ICONS.rdlc,title:'RDLC Field Mapper',description:'Analizza i campi disponibili e modifica puntamenti semplici senza alterare la struttura del report.',tags:['RDLC','Dataset','Campi']}
  };
  const sectionByKey = new Map(sections.map(section => [section.dataset.box, section]));

  const app = document.createElement('main');
  app.id = 'settingsApp';

  const dashboardHeader = document.createElement('div');
  dashboardHeader.className = 'dashboard-header';
  dashboardHeader.innerHTML = '<div><h1>Impostazioni</h1><p>Scegli un’area da configurare.</p></div>';

  const searchLabel = document.createElement('label');
  searchLabel.className = 'settings-search';
  searchLabel.innerHTML = '<span class="sr-only">Cerca nelle impostazioni</span><input id="settingsSearch" type="search" autocomplete="off" placeholder="Cerca nelle impostazioni…" aria-label="Cerca nelle impostazioni">';
  dashboardHeader.appendChild(searchLabel);

  const visualStyleLabel = document.createElement('label');
  visualStyleLabel.className = 'settings-customize-appearance';
  visualStyleLabel.hidden = true;
  visualStyleLabel.innerHTML = '<span>Stile applicazione</span><select id="settingsVisualStyle" aria-label="Stile applicazione"><option value="modern">Moderno</option><option value="classic">Classico</option></select>';
  dashboardHeader.appendChild(visualStyleLabel);
  const visualStyleSelect = visualStyleLabel.querySelector('select');
  const STYLE_KEY = 'visualStyle';
  function applyVisualStyle(value) {
    const style = value === 'classic' ? 'classic' : 'modern';
    const modernLink = document.getElementById('modernStyle');
    const classicLink = document.getElementById('classicStyle');
    if (modernLink) modernLink.disabled = style !== 'modern';
    if (classicLink) classicLink.disabled = style !== 'classic';
    document.documentElement.dataset.visualStyle = style;
    visualStyleSelect.value = style;
  }
  applyVisualStyle('modern');
  try {
    chrome.storage.sync.get({ [STYLE_KEY]: 'modern' }, data => applyVisualStyle(data && data[STYLE_KEY]));
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync' && changes[STYLE_KEY]) applyVisualStyle(changes[STYLE_KEY].newValue);
    });
  } catch (_) {}
  visualStyleSelect.addEventListener('change', () => {
    const visualStyle = visualStyleSelect.value === 'classic' ? 'classic' : 'modern';
    applyVisualStyle(visualStyle);
    const patch = { [STYLE_KEY]: visualStyle };
    try {
      chrome.runtime.sendMessage({ type: 'BC_TOOLS_SAVE_SETTINGS', payload: patch }, response => {
        if (chrome.runtime.lastError || !response || !response.ok) chrome.storage.sync.set(patch);
      });
    } catch (_) {
      try { chrome.storage.sync.set(patch); } catch (_) {}
    }
  });

  const dashboard = document.createElement('div');
  dashboard.id = 'settingsDashboard';
  dashboard.className = 'settings-dashboard';
  dashboard.setAttribute('aria-label', 'Categorie impostazioni');

  const emptySearch = document.createElement('p');
  emptySearch.id = 'settingsSearchEmpty';
  emptySearch.className = 'settings-search-empty';
  emptySearch.textContent = 'Nessuna categoria corrisponde alla ricerca.';
  emptySearch.hidden = true;

  const detail = document.createElement('div');
  detail.id = 'settingsDetail';
  detail.className = 'settings-detail';
  detail.hidden = true;

  const detailHeader = document.createElement('div');
  detailHeader.className = 'detail-header';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'back-button';
  back.textContent = '← Tutte le impostazioni';
  const detailTitle = document.createElement('div');
  detailTitle.className = 'detail-title';
  detailHeader.append(back, detailTitle);
  detail.appendChild(detailHeader);

  function cardFor(key, meta) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'settings-card';
    card.dataset.target = key;
    card.setAttribute('aria-label', `Apri ${meta.title}`);

    const icon = document.createElement('span');
    icon.className = 'settings-card-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = meta.icon;

    const body = document.createElement('span');
    body.className = 'settings-card-body';
    const heading = document.createElement('span');
    heading.className = 'settings-card-title';
    heading.textContent = meta.title;
    const description = document.createElement('span');
    description.className = 'settings-card-description';
    description.textContent = meta.description;
    const tags = document.createElement('span');
    tags.className = 'settings-card-tags';
    meta.tags.forEach(text => {
      const tag = document.createElement('span');
      tag.textContent = text;
      tags.appendChild(tag);
    });
    body.append(heading, description, tags);

    const arrow = document.createElement('span');
    arrow.className = 'settings-card-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '›';
    card.append(icon, body, arrow);
    return card;
  }

  const ORDER_KEY = 'optionsLayout';
  const defaultOrder = Object.keys(META).filter(key => sectionByKey.has(key));
  let currentOrder = [...defaultOrder];
  let customizing = false;
  let selectedSwapKey = '';

  const normalizedOrder = value => {
    const known = Array.isArray(value) ? value.filter((key, index, array) => sectionByKey.has(key) && array.indexOf(key) === index) : [];
    return [...known, ...defaultOrder.filter(key => !known.includes(key))];
  };
  function renderCards(order=currentOrder) {
    currentOrder = normalizedOrder(order);
    dashboard.replaceChildren();
    currentOrder.forEach((key, index) => {
      const card = cardFor(key, META[key]);
      const number = document.createElement('span');
      number.className = 'settings-card-number';
      number.setAttribute('aria-hidden', 'true');
      number.textContent = String(index + 1);
      card.appendChild(number);
      dashboard.appendChild(card);
    });
  }
  function saveOrder() {
    const patch = { [ORDER_KEY]:currentOrder };
    try {
      chrome.runtime.sendMessage({ type:'BC_TOOLS_SAVE_SETTINGS', patch }, response => {
        if (chrome.runtime.lastError || !response || !response.ok) chrome.storage.sync.set(patch);
      });
    } catch (_) {
      try { chrome.storage.sync.set(patch); } catch (_) {}
    }
  }
  function setCustomizing(active) {
    customizing = !!active;
    selectedSwapKey = '';
    document.body.classList.toggle('settings-customizing', customizing);
    dashboard.querySelectorAll('.settings-card').forEach(card => card.classList.remove('is-swap-selected'));
    let status = dashboardHeader.querySelector('.settings-customize-status');
    if (customizing && !status) {
      status = document.createElement('p');
      status.className = 'settings-customize-status';
      status.setAttribute('role', 'status');
      dashboardHeader.firstElementChild.appendChild(status);
    }
    if (status) {
      status.textContent = customizing ? 'Scegli lo stile e seleziona due sezioni per scambiarle. Premi Esc per terminare.' : '';
      status.hidden = !customizing;
    }
    visualStyleLabel.hidden = !customizing;
    const customizeButton = document.getElementById('quickGuideCustomize');
    if (customizeButton) {
      customizeButton.setAttribute('aria-pressed', customizing ? 'true' : 'false');
      const strong = customizeButton.querySelector('strong');
      if (strong) strong.textContent = customizing ? 'Termina personalizzazione' : 'Personalizza';
    }
    const guideButton = document.getElementById('quickGuideButton');
    if (guideButton) {
      guideButton.classList.toggle('is-customize-confirm', customizing);
      guideButton.classList.remove('is-menu-open');
      guideButton.setAttribute('aria-expanded', 'false');
      guideButton.setAttribute('aria-label', customizing ? 'Conferma e termina personalizzazione' : 'Apri il menu di assistenza');
      guideButton.title = customizing ? 'Conferma e termina personalizzazione' : '';
    }
  }
  function swapCards(firstKey, secondKey) {
    const first = currentOrder.indexOf(firstKey), second = currentOrder.indexOf(secondKey);
    if (first < 0 || second < 0 || first === second) return;
    [currentOrder[first], currentOrder[second]] = [currentOrder[second], currentOrder[first]];
    renderCards(currentOrder);
    saveOrder();
  }
  renderCards();
  try { chrome.storage.sync.get({ [ORDER_KEY]:[] }, data => renderCards(data && data[ORDER_KEY])); } catch (_) {}

  const navigationState = () => window.bcToolsOptionsNavigationState || {};
  function openCategory(key, pushState) {
    const section = sectionByKey.get(key);
    const meta = META[key];
    if (!section || !meta) return;

    sections.forEach(item => {
      const active = item === section;
      item.hidden = !active;
      item.setAttribute('aria-hidden', active ? 'false' : 'true');
      item.classList.toggle('settings-panel-active', active);
    });
    detailTitle.replaceChildren();

    const icon = document.createElement('span');
    icon.className = 'detail-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = meta.icon;
    const text = document.createElement('div');
    const heading = document.createElement('h1');
    heading.textContent = meta.title;
    const description = document.createElement('p');
    description.textContent = meta.description;
    text.append(heading, description);
    detailTitle.append(icon, text);
    // Monta nel dettaglio esclusivamente la sezione selezionata.
    detail.replaceChildren(detailHeader, section);

    dashboardHeader.hidden = true;
    dashboard.hidden = true;
    emptySearch.hidden = true;
    detail.hidden = false;
    document.body.classList.add('detail-open');
    document.dispatchEvent(new CustomEvent('bc-tools-settings-section-opened', { detail:{ key } }));
    if (pushState) history.pushState({ settingsCategory:key }, '', `#${key}`);
    back.focus();
  }
  window.bcToolsOpenSettingsSection = key => {
    if (sectionByKey.has(key)) openCategory(key, true);
  };

  function showDashboard(pushState) {
    sections.forEach(section => {
      section.hidden = true;
      section.setAttribute('aria-hidden', 'true');
      section.classList.remove('settings-panel-active');
    });
    detail.hidden = true;
    dashboardHeader.hidden = false;
    dashboard.hidden = false;
    document.body.classList.remove('detail-open');
    if (pushState) history.pushState({}, '', location.pathname + location.search);
  }

  dashboard.addEventListener('click', event => {
    const card = event.target.closest('.settings-card');
    if (!card) return;
    const key = card.dataset.target;
    if (!customizing) {
      openCategory(key, true);
      return;
    }
    if (!selectedSwapKey) {
      selectedSwapKey = key;
      card.classList.add('is-swap-selected');
      card.setAttribute('aria-pressed', 'true');
      return;
    }
    if (selectedSwapKey === key) {
      selectedSwapKey = '';
      card.classList.remove('is-swap-selected');
      card.removeAttribute('aria-pressed');
      return;
    }
    swapCards(selectedSwapKey, key);
    selectedSwapKey = '';
  });
  back.addEventListener('click', () => showDashboard(true));

  searchLabel.querySelector('input').addEventListener('input', event => {
    const query = event.target.value.trim().toLocaleLowerCase('it');
    let visible = 0;
    dashboard.querySelectorAll('.settings-card').forEach(card => {
      const match = !query || card.textContent.toLocaleLowerCase('it').includes(query);
      card.hidden = !match;
      if (match) visible++;
    });
    emptySearch.hidden = visible !== 0;
  });

  const editableTarget = target => !!(target && (target.matches('input,textarea,select') || target.isContentEditable));
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (document.querySelector('dialog[open]') || !document.getElementById('guidedTourCoach')?.hidden) return;
    if (event.key === 'Escape') {
      if (customizing) {
        event.preventDefault();
        setCustomizing(false);
      } else if (!detail.hidden) {
        event.preventDefault();
        showDashboard(true);
      }
      return;
    }
    if (editableTarget(event.target) || customizing || detail.hidden === false || !/^[1-9]$/.test(event.key)) return;
    const key = currentOrder[Number(event.key) - 1];
    if (!key) return;
    event.preventDefault();
    openCategory(key, true);
  });
  const guideButton = document.getElementById('quickGuideButton');
  if (guideButton) guideButton.addEventListener('click', event => {
    if (!customizing) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setCustomizing(false);
    guideButton.focus();
  }, true);
  const customizeButton = document.getElementById('quickGuideCustomize');
  if (customizeButton) customizeButton.addEventListener('click', () => {
    if (!detail.hidden) showDashboard(true);
    setCustomizing(!customizing);
    const menu = document.getElementById('quickGuideMenu');
    if (menu) {
      menu.classList.remove('is-open');
      menu.hidden = true;
    }
    const guide = document.getElementById('quickGuideButton');
    if (guide) guide.setAttribute('aria-expanded', 'false');
    dashboard.querySelector('.settings-card')?.focus();
  });
  try {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync' && changes[ORDER_KEY] && !customizing) renderCards(changes[ORDER_KEY].newValue);
    });
  } catch (_) {}

  window.addEventListener('popstate', () => {
    const key = location.hash.replace(/^#/, '');
    if (sectionByKey.has(key)) openCategory(key, false);
    else showDashboard(false);
  });

  title.after(app);
  app.append(dashboardHeader, dashboard, emptySearch, detail);
  sections.forEach(section => {
    section.hidden = true;
    section.setAttribute('aria-hidden', 'true');
    section.remove();
  });

  const initialKey = location.hash.replace(/^#/, '');
  if (sectionByKey.has(initialKey)) openCategory(initialKey, false);
  else showDashboard(false);
  } catch (error) {
    console.error('BC_tools options layout fallback:', error);
    restoreLegacyView();
  }
})();
