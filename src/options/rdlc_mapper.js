(function () {
  'use strict';
  const core = globalThis.BcToolsRdlcCore, preview = globalThis.BcToolsRdlcPreview;
  if (!core || !preview) return;
  const byId = id => document.getElementById(id);
  const ui = {
    file: byId('rdlcFile'), workspace: byId('rdlcWorkspace'), grid: byId('rdlcWorkspaceGrid'),
    center: document.querySelector('.rdlc-column-center'), right: document.querySelector('.rdlc-column-right'),
    status: byId('rdlcStatus'), detail: byId('rdlcReferenceDetail'), choices: byId('rdlcReferenceChoices'),
    warnings: byId('rdlcWarnings'), search: byId('rdlcStructureSearch'), searchStatus: byId('rdlcStructureSearchStatus'),
    outline: byId('rdlcPreviewOutline'), undo: byId('rdlcUndo'), redo: byId('rdlcRedo'),
    reset: byId('rdlcReset'), validate: byId('rdlcValidate'), save: byId('rdlcSave'),
    mapping: byId('rdlcMapping'), empty: byId('rdlcSelectionEmpty'), newField: byId('rdlcNewField'),
    apply: byId('rdlcApply')
  };
  if (!ui.file) return;

  let state = { name: '', original: '', xml: '', model: null, undo: [], redo: [], selected: null, selectedPath: '', validated: false, preview: null, zoom: 1, fitMode: true };
  const canvas = byId('rdlcPreviewCanvas'), viewport = byId('rdlcPreviewViewport'), zoomOutput = byId('rdlcPreviewZoom');

  function previewSize() {
    const stage = canvas.firstElementChild;
    return stage ? { stage, width: stage.scrollWidth, height: stage.scrollHeight } : null;
  }

  function setPreviewZoom(value, fit = false) {
    const size = previewSize();
    if (!size) return;
    state.zoom = Math.max(.1, Math.min(3, value));
    canvas.style.width = `${Math.ceil(size.width * state.zoom)}px`;
    canvas.style.height = `${Math.ceil(size.height * state.zoom)}px`;
    size.stage.style.width = `${size.width}px`;
    size.stage.style.height = `${size.height}px`;
    size.stage.style.transform = `scale(${state.zoom})`;
    viewport.classList.toggle('is-zoomed', !fit && state.zoom > state.fitScale);
    zoomOutput.textContent = `${Math.round(state.zoom * 100)}%`;
  }

  function fitPreview() {
    const size = previewSize();
    if (!size || !size.width || !size.height) return;
    const bounds = viewport.getBoundingClientRect(), styles = getComputedStyle(viewport);
    const padding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const width = Math.max(1, Math.floor(bounds.width - padding - 36));
    const height = Math.max(1, viewport.clientHeight - 24);
    state.fitScale = preview.fitScale(size.width, size.height, width, height);
    state.fitMode = true;
    setPreviewZoom(state.fitScale, true);
  }

  function drawPreview() {
    state.preview = preview.build(state.model);
    state.fitMode = true;
    preview.render(canvas, ui.outline, state.preview, selectVisual, state.model);
    requestAnimationFrame(fitPreview);
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { if (state.fitMode) fitPreview(); }).observe(viewport);

  const setText = (id, value) => { const element = byId(id); if (element) element.textContent = String(value); };
  function status(message, error = false) {
    ui.status.textContent = message;
    ui.status.classList.toggle('is-error', error);
  }
  function diagnostic(event, details) {
    try {
      chrome.runtime.sendMessage({ type: 'BC_TOOLS_DIAGNOSTIC_APPEND', component: 'rdlc-lab', entry: { at: new Date().toISOString(), event, details } }, () => void chrome.runtime.lastError);
    } catch (_) {}
  }
  function setWorkspaceLoaded(loaded) {
    ui.workspace.hidden = !loaded;
    ui.center.hidden = !loaded;
    ui.right.hidden = !loaded;
    ui.grid.classList.toggle('is-empty', !loaded);
  }
  function enable() {
    const loaded = !!state.model;
    ui.undo.disabled = !state.undo.length;
    ui.redo.disabled = !state.redo.length;
    ui.reset.disabled = !loaded || state.xml === state.original;
    ui.validate.disabled = !loaded;
    ui.save.disabled = !loaded || !state.validated;
  }
  function renderWarnings(result = null) {
    ui.warnings.replaceChildren();
    const groups = result ? [
      ['Errore strutturale', result.errors, 'is-error'],
      ['Avviso', result.warnings, ''],
      ['Supporto parziale', result.partial, ''],
      ['Informazione', result.information, '']
    ] : [['Avviso', state.model.warnings, '']];
    const total = groups.reduce((count, [, messages]) => count + messages.length, 0), visibleLimit = 200;
    let rendered = 0;
    for (const [label, messages, className] of groups) {
      for (const message of messages) {
        if (rendered >= visibleLimit) break;
        const row = document.createElement('p');
        row.className = `rdlc-warning ${className}`.trim();
        row.textContent = `${label}: ${message}`;
        ui.warnings.appendChild(row);
        rendered++;
      }
    }
    if (total > rendered) {
      const remainder = document.createElement('p');
      remainder.className = 'rdlc-warning';
      remainder.textContent = `${total - rendered} ulteriori segnalazioni non mostrate.`;
      ui.warnings.appendChild(remainder);
    }
    setText('rdlcWarningCount', state.model.warnings.length + (result ? result.errors.length + result.partial.length : 0));
  }

  function detailsList(rows) {
    const list = document.createElement('dl');
    list.className = 'rdlc-reference-details';
    for (const [label, value] of rows) {
      if (value === '' || value === null || value === undefined) continue;
      const row = document.createElement('div'), term = document.createElement('dt'), description = document.createElement('dd');
      term.textContent = label;
      description.textContent = String(value);
      row.append(term, description);
      list.appendChild(row);
    }
    return list;
  }

  function selectSynced(treePath, visualPath = treePath) {
    state.selectedPath = treePath;
    preview.select(canvas, visualPath, null);
    preview.select(null, treePath, ui.outline);
  }

  function clearSelection(message = 'Seleziona un elemento nell’albero o nell’anteprima per visualizzarne proprietà e riferimenti.') {
    state.selected = null;
    state.selectedPath = '';
    ui.detail.replaceChildren();
    ui.detail.textContent = message;
    ui.choices.replaceChildren();
    ui.choices.hidden = true;
    ui.mapping.hidden = true;
    ui.empty.hidden = false;
    ui.empty.textContent = 'Seleziona un riferimento di campo modificabile per sostituire una singola occorrenza.';
    if (state.preview) {
      preview.select(canvas, '', null);
      preview.select(null, '', ui.outline);
    }
  }

  function propertyRows(selection, refs) {
    const rows = [['Elemento', `${selection.type || 'Report'} · ${selection.name || selection.type || ''}`], ['Percorso XML', selection.path]];
    const properties = selection.props || {};
    for (const name of ['DataSetName', 'Top', 'Left', 'Width', 'Height', 'ZIndex', 'CanGrow', 'CanShrink', 'RowSpan', 'ColSpan', 'Rows', 'Columns', 'Style', 'Visibility']) {
      if (properties[name] !== undefined && properties[name] !== null && properties[name] !== '') rows.push([name, properties[name]]);
    }
    if (selection.tablix) {
      const groups = [];
      const collect = members => members.forEach(member => {
        if (member.group) groups.push(`${member.group.name || 'Gruppo'}${member.group.expressions.length ? ` (${member.group.expressions.join(', ')})` : ''}`);
        collect(member.children);
      });
      collect(selection.tablix.rowHierarchy);
      collect(selection.tablix.columnHierarchy);
      if (groups.length) rows.push(['Gruppi / espressioni', groups.join('; ')]);
    }
    if (selection.fields && selection.fields.length) rows.push(['Campi', selection.fields.join(', ')]);
    if (refs.length) {
      rows.push(['Dataset', refs[0].dataset || 'Ambiguo']);
      rows.push(['Scope', refs[0].scope || refs[0].explicitScope || 'Ambiguo']);
      rows.push(['Supporto', refs.map(ref => ref.support).join(', ')]);
    }
    if (selection.interpreted === false) rows.push(['Supporto elemento', 'Non interpretato; contenuto XML conservato.']);
    return rows;
  }

  function showSelection(selection, refs) {
    ui.detail.replaceChildren();
    ui.detail.appendChild(detailsList(propertyRows(selection, refs)));
    const related = state.model.refs.filter(ref => (selection.relatedRefs || []).includes(ref.id));
    const candidates = refs.length ? refs : related.slice(0, 100);
    const formulas = state.model.expressions.filter(expression => expression.path === selection.path || expression.ownerPath === selection.path);
    const activeFormula = formulas[0];
    const present = activeFormula ? (state.model.references || []).filter(reference => reference.path === activeFormula.path) : [];
    if (present.length) ui.detail.appendChild(detailsList([['Riferimenti presenti', present.map(reference => `${reference.type || reference.referenceType}!${reference.field || reference.name}`).join(', ')]]));
    if (refs.length || activeFormula) {
      const label = document.createElement('strong');
      label.textContent = 'Formula originale';
      const expression = document.createElement('pre');
      expression.className = 'rdlc-expression rdlc-reference-expression';
      expression.textContent = refs[0]?.expression || activeFormula.expression;
      ui.detail.append(label, expression);
    } else if (selection.label) {
      const label = document.createElement('strong');
      label.textContent = 'Contenuto';
      const value = document.createElement('pre');
      value.className = 'rdlc-expression rdlc-reference-expression';
      value.textContent = selection.label;
      ui.detail.append(label, value);
    }
    ui.empty.hidden = false;
    ui.empty.textContent = candidates.length ? 'Scegli il riferimento specifico per visualizzarne il dettaglio o modificarlo.' : 'Questo elemento non contiene riferimenti di campo rimappabili.';
    ui.mapping.hidden = true;
    ui.choices.hidden = candidates.length === 0;
    ui.choices.replaceChildren();
    for (const ref of candidates) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'rdlc-reference-choice';
      button.setAttribute('aria-label', `${ref.referenceType} ${ref.field || ref.name}, ${ref.editable ? 'modificabile' : 'sola lettura'}`);
      const heading = document.createElement('strong');
      heading.textContent = `${ref.referenceType}!${ref.field || ref.name} · ${ref.dataset || 'dataset non determinabile'}`;
      const position = document.createElement('span');
      position.className = 'rdlc-reference-choice-position';
      position.textContent = ref.fieldCount > 1 ? `Riferimento ${ref.fieldIndex + 1} di ${ref.fieldCount}` : ref.editable ? 'Riferimento modificabile' : ref.reason;
      button.append(heading, position);
      button.addEventListener('click', () => selectReference(ref.id));
      ui.choices.appendChild(button);
    }
    if (related.length > candidates.length) {
      const note = document.createElement('p');
      note.className = 'help';
      note.textContent = `${related.length - candidates.length} altri riferimenti: seleziona l’elemento specifico nell’albero.`;
      ui.choices.appendChild(note);
    }
    if (candidates.length === 1) selectReference(candidates[0].id, false);
  }

  function selectReference(id, redraw = true) {
    const ref = state.model.refs.find(item => item.id === id);
    if (!ref) return;
    state.selected = ref.id;
    const field = state.model.datasets.find(dataset => dataset.name === ref.dataset)?.fields.find(item => item.name === ref.field);
    const visualPath = ref.visualPath || ref.path;
    selectSynced(ref.path, visualPath);
    ui.detail.replaceChildren();
    ui.detail.appendChild(detailsList([
      ['Elemento', `${ref.elementType} · ${ref.element}`], ['Percorso XML', ref.path],
      ['Dataset', ref.dataset || 'Non determinabile'], ['Scope', ref.scope || 'Ambiguo'],
      ['Tipo riferimento', ref.referenceType], ['Campo/DataField', ref.field ? `${ref.field}${field && field.dataField ? ` · ${field.dataField}` : ''}` : '—'],
      ['Funzione contenitore', ref.function || '—'], ['Scope esplicito', ref.explicitScope || '—'],
      ['Supporto', ref.support], ['Motivo blocco', ref.reason || '—'],
      ['Occorrenza', ref.fieldCount > 1 ? `${ref.fieldIndex + 1} di ${ref.fieldCount}` : 'Unica']
    ]));
    const label = document.createElement('strong');
    label.textContent = 'Formula originale';
    const expression = document.createElement('pre');
    expression.className = 'rdlc-expression rdlc-reference-expression';
    expression.textContent = ref.expression;
    const references = (state.model.references || []).filter(item => item.path === ref.path).map(item => `${item.type}!${item.field || item.name}`);
    ui.detail.appendChild(detailsList([['Riferimenti presenti', references.join(', ') || 'Nessuno']]));
    ui.detail.append(label, expression);
    ui.choices.hidden = true;
    ui.empty.hidden = !ref.editable;
    ui.mapping.hidden = !ref.editable;
    ui.empty.textContent = ref.editable ? 'Rimappa solo l’occorrenza selezionata.' : `Modifica non consentita: ${ref.reason}`;
    if (!ref.editable) return;
    setText('rdlcMapElement', `${ref.elementType} ${ref.element}`);
    setText('rdlcMapDataset', ref.dataset);
    setText('rdlcMapCurrent', `${ref.field}${ref.fieldCount > 1 ? ` · riferimento ${ref.fieldIndex + 1} di ${ref.fieldCount}` : ''}`);
    setText('rdlcBefore', ref.expression);
    setText('rdlcExpressionHint', 'Viene sostituito solo il riferimento selezionato: formula, spaziatura e altri riferimenti restano invariati.');
    ui.newField.replaceChildren();
    const dataset = state.model.datasets.find(item => item.name === ref.dataset);
    for (const item of dataset.fields) {
      const option = document.createElement('option');
      option.value = item.name;
      option.textContent = item.name + (item.dataField ? ` · ${item.dataField}` : '');
      option.selected = item.name === ref.field;
      ui.newField.appendChild(option);
    }
    if (redraw) updateFormulaPreview();
  }

  function selectVisual(selection) {
    const matching = preview.referencesForItem(selection, state.model.refs);
    const path = selection.path || '';
    const visualPath = selection.visualPath || (state.preview.byPath.has(path) ? path : matching[0]?.visualPath) || path;
    selectSynced(path, visualPath);
    showSelection(selection, matching);
  }

  function updateFormulaPreview() {
    const ref = state.model && state.model.refs.find(item => item.id === state.selected);
    if (!ref) return;
    try {
      setText('rdlcAfter', core.replaceFieldReference(ref.expression, ref.fieldIndex, ref.field, ui.newField.value));
    } catch (error) {
      setText('rdlcAfter', error.message);
    }
    ui.apply.disabled = !ui.newField.value || ui.newField.value === ref.field;
  }

  function renderOutline() {
    const matches = preview.renderOutline(ui.outline, state.preview, selectVisual, ui.search.value, state.model);
    const query = String(ui.search.value || '').trim();
    ui.searchStatus.textContent = query ? matches ? `${matches} elementi corrispondenti.` : 'Nessun elemento corrispondente nella struttura.' : '';
    if (state.selectedPath) preview.select(null, state.selectedPath, ui.outline);
  }

  function refresh(message, selectionHint = null) {
    setText('rdlcFileName', state.name);
    setText('rdlcNamespace', state.model.namespace || '(assente)');
    setText('rdlcDatasetCount', state.model.datasets.length);
    setText('rdlcFieldCount', state.model.datasets.reduce((count, dataset) => count + dataset.fields.length, 0));
    setText('rdlcReferenceCount', (state.model.references || state.model.refs).length);
    renderWarnings();
    drawPreview();
    if (ui.search.value) renderOutline();
    setWorkspaceLoaded(true);
    state.validated = false;
    if (selectionHint) {
      const ref = state.model.refs.find(item => item.path === selectionHint.path && item.fieldIndex === selectionHint.fieldIndex);
      if (ref) selectReference(ref.id);
    } else clearSelection();
    status(message || 'Analisi locale completata. La struttura visualizzata non è un rendering ufficiale.');
    enable();
  }

  function commitXml(xml, name, message, selectionHint = null) {
    const model = core.analyze(xml);
    state.xml = xml;
    state.model = model;
    if (name !== undefined) state.name = name;
    refresh(message, selectionHint);
    return model;
  }

  ui.file.addEventListener('change', async () => {
    const file = ui.file.files && ui.file.files[0];
    ui.file.value = '';
    if (!file) return;
    if (!/\.(rdlc|rdl)$/i.test(file.name)) {
      status('Estensione non ammessa. Seleziona un file .rdlc o .rdl.', true);
      diagnostic('import-failed', { category: 'extension', count: 0 });
      return;
    }
    if (file.size > core.limits.maxXmlChars) {
      status('File troppo grande: limite locale 10 MiB.', true);
      diagnostic('import-failed', { category: 'size', count: 0 });
      return;
    }
    try {
      const xml = await file.text();
      const model = core.analyze(xml);
      state = { name: file.name, original: xml, xml, model, undo: [], redo: [], selected: null, selectedPath: '', validated: false, preview: null, zoom: 1, fitMode: true };
      refresh('File analizzato localmente. Controlla struttura e avvisi prima di rimappare.');
      diagnostic('import-ok', { category: 'rdlc', datasets: model.datasets.length, fields: model.datasets.reduce((count, dataset) => count + dataset.fields.length, 0), references: model.references.length });
    } catch (error) {
      status(error.message || 'Importazione bloccata. Il documento corrente non è stato modificato.', true);
      diagnostic('import-failed', { category: 'xml', count: 0 });
    }
  });

  ui.search.addEventListener('input', () => state.model && renderOutline());
  ui.newField.addEventListener('change', updateFormulaPreview);
  ui.apply.addEventListener('click', () => {
    const ref = state.model.refs.find(item => item.id === state.selected);
    if (!ref) return;
    try {
      const change = core.remap(state.model, ref.id, ui.newField.value);
      const xml = core.serialize(state.model.doc);
      state.undo.push(change);
      state.redo = [];
      commitXml(xml, undefined, 'Rimappata una singola occorrenza; il resto dell’espressione è stato mantenuto.', { path: change.path, fieldIndex: change.fieldIndex });
      diagnostic('remap-ok', { category: 'field-reference', count: 1 });
    } catch (error) {
      status(error.message, true);
      diagnostic('remap-failed', { category: 'validation', count: 1 });
    }
  });

  function applyHistory(change, useAfter) {
    const model = core.analyze(state.xml);
    const target = model.refs.find(ref => ref.path === change.path && ref.fieldIndex === change.fieldIndex);
    if (!target) throw new Error('La modifica storica non è più applicabile.');
    core.remap(model, target.id, useAfter ? change.newField : change.oldField);
    const xml = core.serialize(model.doc);
    state.xml = xml;
    state.model = core.analyze(xml);
    refresh(useAfter ? 'Modifica ripristinata.' : 'Modifica annullata.', { path: change.path, fieldIndex: change.fieldIndex });
  }
  ui.undo.addEventListener('click', () => {
    const change = state.undo[state.undo.length - 1];
    if (!change) return;
    try { applyHistory(change, false); state.undo.pop(); state.redo.push(change); enable(); }
    catch (error) { status(error.message, true); }
  });
  ui.redo.addEventListener('click', () => {
    const change = state.redo[state.redo.length - 1];
    if (!change) return;
    try { applyHistory(change, true); state.redo.pop(); state.undo.push(change); enable(); }
    catch (error) { status(error.message, true); }
  });
  ui.reset.addEventListener('click', () => {
    try {
      const model = core.analyze(state.original);
      state.undo = [];
      state.redo = [];
      state.xml = state.original;
      state.model = model;
      refresh('Ripristinato il file originale.');
    } catch (error) { status(error.message, true); }
  });
  ui.validate.addEventListener('click', () => {
    const result = core.validate(state.model);
    state.validated = result.ok;
    renderWarnings(result);
    status(result.ok ? 'Struttura locale coerente per le regole supportate. Non certifica la validità per Business Central.' : `Validazione strutturale bloccante: ${result.errors.join(' ')}`, !result.ok);
    enable();
    diagnostic('validate', { category: result.ok ? 'ok' : 'blocked', warnings: result.warnings.length, errors: result.errors.length });
  });
  ui.save.addEventListener('click', () => {
    try {
      const result = core.validate(state.model);
      if (!result.ok) throw new Error('Salvataggio bloccato: la struttura contiene errori.');
      const blob = new Blob([core.serialize(state.model.doc)], { type: 'application/xml;charset=utf-8' });
      const link = document.createElement('a'), base = state.name.replace(/\.(rdlc|rdl)$/i, '');
      const extension = /\.rdl$/i.test(state.name) ? '.rdl' : '.rdlc';
      link.href = URL.createObjectURL(blob);
      link.download = `${base}_edited${extension}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 0);
      status('Esportazione riuscita in una nuova copia. Il file originale non è stato sovrascritto.');
      diagnostic('export-ok', { category: 'rdlc', count: 1 });
    } catch (error) {
      status(error.message, true);
      diagnostic('export-failed', { category: 'validation', count: 0 });
    }
  });

  byId('rdlcPreviewFit').addEventListener('click', fitPreview);
  byId('rdlcPreviewActual').addEventListener('click', () => { state.fitMode = false; setPreviewZoom(1); });
  byId('rdlcPreviewMinus').addEventListener('click', () => { state.fitMode = false; setPreviewZoom(state.zoom - .1); });
  byId('rdlcPreviewPlus').addEventListener('click', () => { state.fitMode = false; setPreviewZoom(state.zoom + .1); });
  enable();
})();
