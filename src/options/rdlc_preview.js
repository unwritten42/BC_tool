(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BcToolsRdlcPreview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const core = typeof module === 'object' && module.exports ? require('./rdlc_core.js') : globalThis.BcToolsRdlcCore;
  const visualTypes = new Set(['Textbox', 'Rectangle', 'Line', 'Image', 'Tablix', 'Table', 'Matrix', 'List', 'Chart', 'GaugePanel', 'Gauge', 'Map', 'Subreport', 'CustomReportItem']);
  const containers = new Set(['Rectangle', 'List', 'Tablix', 'Table', 'Matrix']);
  const local = core.local;
  const kids = core.children;
  const first = core.firstChild;
  const text = core.text;
  const size = core.length;
  const prop = (node, name) => text(first(node, name));
  const refsFor = (model, path) => model.refs.filter(ref => ref.path === path || ref.path.startsWith(path + '/'));
  const attr = (node, name) => node && node.getAttribute ? node.getAttribute(name) || '' : '';

  function fitScale(contentWidth, contentHeight, availableWidth, availableHeight) {
    if (!(contentWidth > 0 && contentHeight > 0 && availableWidth > 0 && availableHeight > 0)) return 1;
    return Math.min(1, availableWidth / contentWidth, availableHeight / contentHeight);
  }

  function item(node, section, model) {
    const path = core.pathOf(node), refs = refsFor(model, path), directRefs = refs.filter(ref => ref.visualPath === path);
    const type = local(node), fields = [...new Set(refs.filter(ref => !ref.referenceType || ref.referenceType === 'Fields').map(ref => ref.field).filter(Boolean))];
    const staticText = Array.from(node.getElementsByTagName('*')).filter(child => local(child) === 'Value')
      .map(text).filter(value => value && !value.startsWith('=')).join(' ');
    const value = kids(node, 'Value').map(text).find(Boolean) || '';
    const z = prop(node, 'ZIndex'), hiddenValue = prop(first(node, 'Visibility'), 'Hidden');
    const hidden = !!hiddenValue && hiddenValue.toLowerCase() !== 'false';
    const tablixDefinition = (model.tablixes || []).find(item => item.path === path);
    const v = {
      path, type, name: attr(node, 'Name') || '(senza nome)', section,
      top: size(prop(node, 'Top')), left: size(prop(node, 'Left')), width: size(prop(node, 'Width')), height: size(prop(node, 'Height')),
      z: z === '' ? null : Number(z), refs: refs.map(ref => ref.id), directRefs: directRefs.map(ref => ref.id),
      datasetName: prop(node, 'DataSetName') || tablixDefinition && tablixDefinition.dataSetName || (model.datasets || []).length === 1 && model.datasets[0].name || '',
      style: first(node, 'Style') ? text(first(node, 'Style')) : '',
      visibility: hiddenValue,
      fields, value, staticText, hidden, canGrow: prop(node, 'CanGrow').toLowerCase() === 'true',
      canShrink: prop(node, 'CanShrink').toLowerCase() === 'true',
      pageBreak: !!first(node, 'PageBreak') && prop(first(node, 'PageBreak'), 'Disabled').toLowerCase() !== 'true',
      supported: !['Chart', 'Gauge', 'GaugePanel', 'Map', 'Subreport', 'CustomReportItem'].includes(type),
      children: [], tablix: ['Tablix', 'Table', 'Matrix'].includes(type) ? tablixDefinition && tablixDefinition.tablix || core.tablixDetails(node) : null
    };
    v.positionable = [v.top, v.left, v.width, v.height].every(Number.isFinite);
    v.isContainer = containers.has(v.type);
    if (v.type === 'Image') v.label = 'Immagine';
    else if (v.type === 'Line') v.label = 'Linea';
    else if (v.type === 'Textbox' && v.fields.length) v.label = v.fields.join(', ');
    else if (v.value.startsWith('=')) v.label = v.value.slice(0, 70);
    else v.label = v.staticText ? v.staticText.slice(0, 56) : v.type;
    v.fieldDetails = refs.map(ref => {
      const dataset = (model.datasets || []).find(item => item.name === ref.dataset);
      const field = dataset && dataset.fields.find(item => item.name === ref.field);
      return [ref.field, ref.dataset, field && field.dataField || ''];
    }).flat();
    v.searchText = [v.name, v.type, v.label, ...v.fields, ...v.fieldDetails, v.staticText].filter(Boolean).join(' ').toLocaleLowerCase();
    return v;
  }

  function setMapVisibility(items, parentVisible = true) {
    for (const visual of items) {
      visual.mapVisible = parentVisible && visual.positionable;
      setMapVisibility(visual.children, visual.mapVisible);
    }
  }

  function partItems(node, name, model) {
    if (!node) return { roots: [], all: [] };
    const elements = Array.from(node.getElementsByTagName('*')).filter(element => visualTypes.has(local(element)));
    const byNode = new Map(elements.map(element => [element, item(element, name, model)])), roots = [];
    for (const element of elements) {
      let parent = element.parentNode;
      while (parent && parent !== node && !byNode.has(parent)) parent = parent.parentNode;
      const visual = byNode.get(parent), current = byNode.get(element);
      if (visual) visual.children.push(current);
      else roots.push(current);
    }
    setMapVisibility(roots);
    return { roots, all: elements.map(element => byNode.get(element)) };
  }

  function build(model) {
    const report = model.doc.documentElement, reportSections = first(report, 'ReportSections');
    const sectionNodes = reportSections ? kids(reportSections, 'ReportSection') : kids(report, 'ReportSection');
    const sections = [], allItems = [];
    for (const sectionNode of sectionNodes.length ? sectionNodes : [report]) {
      const page = first(sectionNode, 'Page') || sectionNode, parts = [];
      for (const [name, node] of [
        ['Page Header', first(sectionNode, 'PageHeader') || first(page, 'PageHeader')],
        ['Body', first(sectionNode, 'Body')],
        ['Page Footer', first(sectionNode, 'PageFooter') || first(page, 'PageFooter')]
      ]) {
        const tree = partItems(node, name, model);
        allItems.push(...tree.all);
        const partHeight = node ? size(prop(node, 'Height')) : null;
        parts.push({ name, height: partHeight > 0 ? partHeight : 32, items: tree.roots });
      }
      const pageWidth = size(prop(page, 'PageWidth')), pageHeight = size(prop(page, 'PageHeight'));
      sections.push({
        path: core.pathOf(sectionNode),
        width: pageWidth > 0 ? pageWidth : 816, height: pageHeight > 0 ? pageHeight : 1056,
        margins: {
          top: size(prop(page, 'TopMargin')), right: size(prop(page, 'RightMargin')),
          bottom: size(prop(page, 'BottomMargin')), left: size(prop(page, 'LeftMargin'))
        },
        parts
      });
    }
    return { sections, items: allItems, byPath: new Map(allItems.map(visual => [visual.path, visual])) };
  }

  function el(tag, cls, value) {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    if (value !== undefined) element.textContent = value;
    return element;
  }

  function setItemGeometry(node, visual) {
    Object.assign(node.style, {
      position: 'absolute', top: `${visual.top}px`, left: `${visual.left}px`,
      width: `${Math.max(visual.width, 2)}px`, height: `${Math.max(visual.height, 2)}px`
    });
    if (visual.z !== null && Number.isFinite(visual.z)) node.style.zIndex = String(visual.z);
  }

  function labelForNode(node) {
    const field = node.type === 'Field' || node.type === 'DataSet' ? node.name : '';
    const value = node.type === 'Value' ? String(node.value || '').trim() : '';
    return field || value.slice(0, 42) || node.type;
  }

  function treeButton(node, depth, onSelect, model) {
    const row = el('li', 'rdlc-outline-entry'), button = el('button', `rdlc-outline-item${node.searchMatch ? ' is-search-match' : ''}`);
    button.type = 'button';
    button.dataset.path = node.path;
    button.dataset.refs = node.directRefs.join(',');
    button.style.setProperty('--rdlc-depth', String(depth));
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `${node.type}${node.name ? ` ${node.name}` : ''}${node.directRefs.length ? `, ${node.directRefs.length} riferimenti diretti` : ''}${node.interpreted ? '' : ', non interpretato'}${node.mapVisible === false ? ', avvertenza: posizione non è determinabile' : ''}`);
    const title = el('span', 'rdlc-outline-title', `${node.type}${node.name ? ` · ${node.name}` : ''}`);
    const supportLabel = node.support === 'partial' ? 'Supporto parziale · ' : '';
    const detail = el('small', 'rdlc-outline-detail', `${node.interpreted ? '' : 'Non interpretato · '}${supportLabel}${node.summary || labelForNode(node)}`);
    button.append(title, detail);
    if (node.mapVisible === false) {
      const warning = el('span', 'rdlc-outline-warning', '⚠');
      warning.setAttribute('title', node.positionable ? 'Il contenitore padre non è collocabile nella mappa.' : 'Posizione o dimensioni non presenti; elemento non visualizzato nella mappa.');
      warning.setAttribute('aria-hidden', 'true');
      button.appendChild(warning);
    }
    button.addEventListener('click', () => onSelect && onSelect({
      path: node.path, type: node.type, name: node.name || node.type,
      directRefs: node.directRefs, fields: node.fields, props: node.props,
      relatedRefs: node.relatedRefs, tablix: node.tablix,
      interpreted: node.interpreted, label: node.summary, visualPath: node.visualPath
    }));
    row.appendChild(button);
    if (node.children.length) {
      const children = el('ul', 'rdlc-outline-children');
      node.children.forEach(child => children.appendChild(treeButton(child, depth + 1, onSelect, model)));
      row.appendChild(children);
    }
    return row;
  }

  function treeModel(model) {
    const refsAt = path => model.refs.filter(ref => ref.path === path);
    const buildNode = node => {
      const direct = refsAt(node.path);
      const children = node.children.map(buildNode);
      let summary = node.type === 'DataSet' ? `${node.children.find(child => child.type === 'Fields')?.children.length || 0} campi` : '';
      if (node.type === 'Field') summary = node.props.DataField || '';
      if (node.type === 'Value') summary = String(node.value || '');
      if (direct.length) summary = direct.map(ref => `${ref.referenceType}!${ref.field || ref.name}`).join(', ');
      const descendants = refsFor(model, node.path), visualRef = descendants.find(ref => ref.visualPath);
      return {
        ...node, directRefs: direct.map(ref => ref.id), fields: [...new Set(descendants.filter(ref => ref.field).map(ref => ref.field))],
        relatedRefs: descendants.map(ref => ref.id), visualPath: visualRef && visualRef.visualPath, children, summary
      };
    };
    return buildNode(model.normalized);
  }

  function filteredTree(node, term, count) {
    const children = node.children.map(child => filteredTree(child, term, count)).filter(Boolean);
    const matched = !term || [node.type, node.name, node.summary, ...node.fields, ...(node.fieldDetails || [])].join(' ').toLocaleLowerCase().includes(term);
    if (matched) count.value++;
    return matched || children.length ? { ...node, children, searchMatch: !!term && matched } : null;
  }

  function renderOutline(target, view, onSelect, query = '', model = null) {
    const outline = el('div', 'rdlc-outline'), heading = el('h4', 'rdlc-outline-heading', 'Struttura del report');
    outline.appendChild(heading);
    const tree = el('ul', 'rdlc-outline-tree');
    let count = { value: 0 };
    if (model && model.normalized) {
      const root = filteredTree(treeModel(model), String(query || '').trim().toLocaleLowerCase(), count);
      if (root) tree.appendChild(treeButton(root, 0, onSelect, model));
    } else {
      view.sections.forEach((section, index) => {
        const entry = el('li', 'rdlc-outline-section'), title = el('strong', '', `Sezione report ${index + 1}`);
        entry.appendChild(title);
        const children = el('ul', 'rdlc-outline-children');
        section.parts.forEach(part => {
          const filtered = filterItems(part.items, query);
          count.value += filtered.matchCount;
          filtered.items.forEach(visual => children.appendChild(treeButton({
            ...visual, interpreted: true, directRefs: visual.directRefs, summary: visual.label,
            children: (visual.children || []).map(child => ({ ...child, interpreted: true, summary: child.label }))
          }, 0, onSelect, model)));
        });
        entry.appendChild(children);
        tree.appendChild(entry);
      });
    }
    if (String(query || '').trim() && !count.value) tree.appendChild(el('li', 'rdlc-outline-empty', 'Nessun elemento corrispondente nella struttura'));
    outline.appendChild(tree);
    target.replaceChildren(outline);
    return count.value;
  }

  function referencesForItem(visual, references) {
    const ids = new Set(visual && Array.isArray(visual.directRefs) ? visual.directRefs : []);
    return (references || []).filter(reference => ids.has(reference.id));
  }

  function renderTablix(visual, node, onSelect, model) {
    if (!visual.tablix || !visual.tablix.rows.length) return;
    const grid = el('table', 'rdlc-tablix-grid');
    grid.setAttribute('role', 'grid');
    const columnCount = Math.max(1, visual.tablix.columns.length, ...visual.tablix.rows.map(item => item.cells.reduce((count, cell) => count + cell.colSpan, 0)));
    grid.setAttribute('aria-rowcount', String(visual.tablix.rows.length));
    grid.setAttribute('aria-colcount', String(columnCount));
    const columnGroup = el('colgroup');
    for (const width of visual.tablix.columns) {
      const column = el('col'), pixels = size(width);
      if (Number.isFinite(pixels)) column.style.width = `${Math.max(1, pixels)}px`;
      columnGroup.appendChild(column);
    }
    grid.appendChild(columnGroup);
    const body = el('tbody');
    const members = [];
    const flatten = (list, inDynamicGroup = false) => list.forEach(member => {
      members.push({ ...member, inDynamicGroup });
      flatten(member.children, inDynamicGroup || member.dynamic);
    });
    flatten(visual.tablix.rowHierarchy);
    const occupied = visual.tablix.rows.map(() => []);
    visual.tablix.rows.forEach((row, rowIndex) => {
      const member = members[rowIndex], kind = member && member.dynamic
        ? `Gruppo${member.name ? ` · ${member.name}` : ''}`
        : member && member.inDynamicGroup ? 'Dettaglio'
          : rowIndex === 0 ? 'Intestazione statica' : 'Statica';
      const rowElement = el('tr', `rdlc-tablix-row${member && member.dynamic ? ' is-dynamic' : ' is-static'}`);
      rowElement.setAttribute('role', 'row');
      const rowHeight = size(row.height);
      if (Number.isFinite(rowHeight)) rowElement.style.height = `${Math.max(1, rowHeight)}px`;
      let logicalColumn = 0;
      row.cells.forEach((cell, cellIndex) => {
        while (occupied[rowIndex][logicalColumn]) logicalColumn++;
        const path = cell.contentPath || visual.path;
        const refs = (model && model.refs || []).filter(ref => ref.path === path || ref.path.startsWith(path + '/'));
        const tableCell = el('td');
        tableCell.setAttribute('role', 'gridcell');
        if (cell.colSpan > 1) tableCell.colSpan = cell.colSpan;
        if (cell.rowSpan > 1) tableCell.rowSpan = cell.rowSpan;
        const button = el('button', `rdlc-tablix-cell${refs.length ? ' has-reference' : ''}`);
        button.type = 'button';
        button.dataset.path = path;
        button.dataset.refs = refs.map(ref => ref.id).join(',');
        button.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-rowindex', String(rowIndex + 1));
        button.setAttribute('aria-colindex', String(logicalColumn + 1));
        button.setAttribute('aria-label', `Tablix, ${kind}, riga ${rowIndex + 1}, cella ${cellIndex + 1}`);
        const contentType = cell.contentType || 'Cella vuota';
        const expression = cell.expression ? cell.expression.replace(/^=/, '') : '';
        button.textContent = expression || (cell.contentName ? `${contentType} · ${cell.contentName}` : contentType);
        button.addEventListener('click', event => {
          event.stopPropagation();
          onSelect({
            path, type: cell.contentType || 'TablixCell', name: cell.contentName || `Riga ${rowIndex + 1}, cella ${cellIndex + 1}`,
            directRefs: refs.map(ref => ref.id), fields: [...new Set(refs.map(ref => ref.field).filter(Boolean))],
            props: { RowSpan: cell.rowSpan, ColSpan: cell.colSpan }, interpreted: !!cell.contentType,
            label: expression || contentType
          });
        });
        tableCell.appendChild(button);
        rowElement.appendChild(tableCell);
        for (let rowOffset = rowIndex; rowOffset < Math.min(visual.tablix.rows.length, rowIndex + cell.rowSpan); rowOffset++) {
          for (let columnOffset = logicalColumn; columnOffset < logicalColumn + cell.colSpan; columnOffset++) occupied[rowOffset][columnOffset] = true;
        }
        logicalColumn += cell.colSpan;
      });
      body.appendChild(rowElement);
    });
    grid.appendChild(body);
    node.appendChild(grid);
  }

  function renderItem(visual, parent, onSelect, model) {
    if (!visual.positionable) return null;
    const container = visual.isContainer || visual.children.length > 0;
    const node = el(container ? 'div' : 'button', `rdlc-preview-item rdlc-preview-${visual.type.toLowerCase()}${container ? ' rdlc-preview-container' : ''}${visual.supported ? '' : ' is-placeholder'}${visual.hidden ? ' is-hidden' : ''}`);
    if (!container) node.type = 'button';
    node.dataset.path = visual.path;
    node.dataset.refs = visual.directRefs.join(',');
    node.setAttribute('aria-pressed', 'false');
    node.setAttribute('aria-label', `${visual.type} ${visual.name}${visual.fields.length ? `, campi ${visual.fields.join(', ')}` : ''}${visual.hidden ? ', nascosto' : ''}`);
    setItemGeometry(node, visual);
    if (container) {
      node.setAttribute('role', 'group');
      node.tabIndex = 0;
      node.appendChild(el('span', 'rdlc-preview-container-label', visual.type === 'Tablix' || visual.type === 'Table' || visual.type === 'Matrix' ? `${visual.type} · griglia strutturale` : visual.type));
    }
    const activate = event => {
      event.stopPropagation();
      onSelect({
        path: visual.path, type: visual.type, name: visual.name, directRefs: visual.directRefs, relatedRefs: visual.refs,
        fields: visual.fields, tablix: visual.tablix,
        props: {
          DataSetName: visual.datasetName, Style: visual.style, Visibility: visual.visibility,
          Top: visual.top, Left: visual.left, Width: visual.width, Height: visual.height, ZIndex: visual.z,
          Rows: visual.tablix && visual.tablix.rows.length, Columns: visual.tablix && visual.tablix.columns.length
        },
        interpreted: visual.supported, label: visual.label
      });
    };
    node.addEventListener('click', activate);
    if (container) node.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(event); }
    });
    if (visual.type === 'Tablix' || visual.type === 'Table' || visual.type === 'Matrix') {
      renderTablix(visual, node, onSelect, model);
    } else if (visual.type === 'Image') node.appendChild(el('span', 'rdlc-image-placeholder', 'Immagine'));
    else if (!container) node.textContent = visual.label;
    if (visual.canGrow || visual.canShrink || visual.hidden || visual.pageBreak) {
      const markers = [visual.hidden ? 'Nascosto' : '', visual.canGrow ? 'CanGrow' : '', visual.canShrink ? 'CanShrink' : '', visual.pageBreak ? 'Interruzione pagina' : ''].filter(Boolean);
      node.appendChild(el('span', 'rdlc-preview-flags', markers.join(' · ')));
    }
    for (const child of visual.children) if (child.positionable) renderItem(child, node, onSelect, model);
    parent.appendChild(node);
    return node;
  }

  function render(target, outlineTarget, view, onSelect, model = null) {
    target.replaceChildren();
    const stage = el('div', 'rdlc-preview-stage');
    for (const section of view.sections) {
      const width = section.width || 816, height = section.height || 1056;
      const page = el('div', 'rdlc-preview-page');
      page.style.width = `${width}px`;
      page.style.height = `${height}px`;
      page.style.position = 'relative';
      const margins = section.margins || {};
      const innerHeight = Math.max(32, height - (margins.top || 0) - (margins.bottom || 0));
      const partsHeight = section.parts.reduce((sum, part) => sum + (part.height || 0), 0);
      let top = margins.top || 0;
      section.parts.forEach(part => {
        const region = el('section', `rdlc-preview-region rdlc-preview-region-${part.name.toLowerCase().replace(/\s+/g, '-')}`);
        const regionHeight = part.height === null ? Math.max(32, (innerHeight - partsHeight) / Math.max(1, section.parts.filter(item => item.name === 'Body').length)) : part.height;
        region.style.position = 'absolute';
        region.style.top = `${part.name === 'Page Footer' ? height - (margins.bottom || 0) - regionHeight : top}px`;
        region.style.left = `${margins.left || 0}px`;
        region.style.width = `${Math.max(1, width - (margins.left || 0) - (margins.right || 0))}px`;
        region.style.height = `${Math.max(regionHeight, 32)}px`;
        region.appendChild(el('span', 'rdlc-preview-region-label', part.name));
        if (!part.items.some(item => item.positionable)) region.appendChild(el('span', 'rdlc-preview-empty', 'Nessun elemento posizionabile'));
        for (const visual of part.items) if (visual.positionable) renderItem(visual, region, onSelect, model);
        page.appendChild(region);
        if (part.name !== 'Page Footer') top += regionHeight;
      });
      stage.appendChild(page);
    }
    target.appendChild(stage);
    renderOutline(outlineTarget, view, onSelect, '', model);
    return view;
  }

  function filterItems(items, query) {
    const term = String(query || '').trim().toLocaleLowerCase();
    if (!term) return { items, matchCount: 0 };
    let matchCount = 0;
    const filtered = [];
    for (const visual of items) {
      const children = filterItems(visual.children || [], term);
      const matched = String(visual.searchText || '').includes(term);
      if (matched) matchCount++;
      if (matched || children.items.length) filtered.push({ ...visual, children: children.items, searchMatch: matched });
      matchCount += children.matchCount;
    }
    return { items: filtered, matchCount };
  }
  const referenceForItem = visual => visual && Array.isArray(visual.directRefs) && visual.directRefs.length === 1 ? visual.directRefs[0] : null;

  function select(target, path, outlineTarget) {
    [target, outlineTarget].filter(Boolean).forEach(container => container.querySelectorAll('[data-path]').forEach(element => {
      const selected = !!path && element.dataset.path === path;
      element.classList.toggle('is-selected', selected);
      element.setAttribute('aria-pressed', String(selected));
    }));
    const hit = [outlineTarget, target].filter(Boolean).map(container => Array.from(container.querySelectorAll('[data-path]')).find(element => path && element.dataset.path === path)).find(Boolean);
    if (hit) hit.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  }

  return { build, render, renderOutline, fitScale, select, referencesForItem, referenceForItem, filterItems, size };
});
