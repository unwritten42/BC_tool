(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BcToolsRdlcCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_XML_CHARS = 10 * 1024 * 1024;
  const MAX_XML_NODES = 20000;
  const MAX_XML_DEPTH = 128;
  const MAX_EXPRESSION_CHARS = 250000;
  const MAX_EXPRESSION_TOKENS = 50000;
  const MAX_DOCUMENT_TOKENS = 200000;
  const VISUAL_TYPES = new Set(['Textbox', 'Rectangle', 'Line', 'Image', 'Tablix', 'Table', 'Matrix', 'List', 'Chart', 'Gauge', 'GaugePanel', 'Map', 'Subreport', 'CustomReportItem']);
  const AGGREGATES = new Set(['sum', 'avg', 'count', 'countdistinct', 'first', 'last', 'min', 'max']);
  const AGGREGATE_FUNCTIONS = new Set([...AGGREGATES, 'aggregate', 'previous', 'stdev', 'stdevp', 'var', 'varp', 'runningvalue']);
  const LOGICAL_OPERATORS = new Set(['and', 'andalso', 'or', 'orelse', 'not', 'xor', 'mod', 'like', 'is', 'isnot']);
  const PARTIAL_ELEMENTS = new Set(['Image', 'Tablix', 'Table', 'Matrix', 'List', 'Chart', 'GaugePanel', 'Gauge', 'Map', 'Subreport', 'CustomReportItem']);
  const KNOWN_ELEMENTS = new Set(('Report ReportSections ReportSection Page PageHeader PageFooter Body ReportItems DataSets DataSet Fields Field DataField DataSetName Query CommandText CommandType DataSourceName TypeName Value Textbox Paragraphs Paragraph TextRuns TextRun MarkupType Label Rectangle Line Image Tablix TablixBody TablixColumns TablixColumn TablixRows TablixRow TablixCells TablixCell CellContents RowSpan ColSpan TablixRowHierarchy TablixColumnHierarchy TablixMembers TablixMember Group GroupExpressions GroupExpression SortExpressions SortExpression Visibility Hidden ToggleItem Style Top Left Width Height PageWidth PageHeight TopMargin BottomMargin LeftMargin RightMargin ZIndex CanGrow CanShrink PageBreak BreakLocation Disabled RepeatOnNewPage KeepWithGroup KeepTogether NoRows NoRowsMessage DataElementName DataElementOutput DataElementStyle DataElementLabel Color BackgroundColor BackgroundRepeat Border BorderColor BorderStyle BorderWidth FontFamily FontSize FontWeight FontStyle Format TextAlign VerticalAlign PaddingLeft PaddingRight PaddingTop PaddingBottom Language Direction WritingMode Source MIMEType Sizing EmbeddedImages EmbeddedImage ReportParameters ReportParameter Prompt Nullable DefaultValue ValidValues UsedInQuery Action Hyperlink Bookmark BookmarkId PageName PageBreakLocation').split(' '));

  const local = node => String(node && (node.localName || node.nodeName) || '').split(':').pop();
  const elements = (node, name = '*') => {
    const result = [];
    const walk = current => {
      for (const child of Array.from(current && current.childNodes || [])) {
        if (child.nodeType !== 1) continue;
        if (name === '*' || local(child) === name) result.push(child);
        walk(child);
      }
    };
    walk(node);
    return result;
  };
  const children = (node, name) => Array.from(node && node.childNodes || []).filter(el => el.nodeType === 1 && (!name || local(el) === name));
  const firstChild = (node, name) => children(node, name)[0] || null;
  const text = node => node ? String(node.textContent || '').trim() : '';
  const attr = (node, name) => node && node.getAttribute ? node.getAttribute(name) || '' : '';
  const spanValue = value => {
    const number = Number(value || 1);
    return Number.isSafeInteger(number) && number > 0 && number <= 1000 ? number : 1;
  };

  function pathOf(node) {
    const parts = [];
    for (let current = node; current && current.nodeType === 1; current = current.parentNode) {
      let index = 0;
      for (let previous = current.previousSibling; previous; previous = previous.previousSibling) {
        if (previous.nodeType === 1 && local(previous) === local(current)) index++;
      }
      parts.unshift(`${local(current)}[${index}]`);
    }
    return parts.join('/');
  }

  function scanExpression(expression) {
    const source = String(expression || ''), tokens = [], references = [], functions = [];
    if (source.length > MAX_EXPRESSION_CHARS) throw new Error('Formula troppo lunga: limite locale 250000 caratteri.');
    let index = 0;
    while (index < source.length) {
      const char = source[index];
      if (/\s/.test(char)) { index++; continue; }
      if (char === '"') {
        const start = index++;
        let value = '', closed = false;
        while (index < source.length) {
          if (source[index] === '"' && source[index + 1] === '"') { value += '"'; index += 2; continue; }
          if (source[index] === '"') { index++; closed = true; break; }
          value += source[index++];
        }
        tokens.push({ type: 'string', value, start, end: index, closed });
        if (tokens.length > MAX_EXPRESSION_TOKENS) throw new Error('Formula troppo complessa: limite locale 50000 token.');
        continue;
      }
      if (/[A-Za-z_\u0080-\uFFFF]/.test(char)) {
        const start = index++;
        while (index < source.length && /[A-Za-z0-9_\u0080-\uFFFF]/.test(source[index])) index++;
        tokens.push({ type: 'word', value: source.slice(start, index), start, end: index });
        if (tokens.length > MAX_EXPRESSION_TOKENS) throw new Error('Formula troppo complessa: limite locale 50000 token.');
        continue;
      }
      tokens.push({ type: char === '(' || char === ')' || char === ',' ? 'punctuation' : 'operator', value: char, start: index, end: ++index });
      if (tokens.length > MAX_EXPRESSION_TOKENS) throw new Error('Formula troppo complessa: limite locale 50000 token.');
    }

    const openCalls = [];
    for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
      const token = tokens[tokenIndex], next = tokens[tokenIndex + 1], after = tokens[tokenIndex + 2];
      if (token.value === '(') {
        const name = tokens[tokenIndex - 1];
        if (name && name.type === 'word') {
          const call = { name: name.value, lowerName: name.value.toLowerCase(), startIndex: tokenIndex, endIndex: -1, openStart: token.start, closeEnd: source.length, scope: '' };
          functions.push(call);
          openCalls.push(call);
        } else openCalls.push(null);
      } else if (token.value === ')') {
        const call = openCalls.pop();
        if (call) { call.endIndex = tokenIndex; call.closeEnd = token.end; }
      }

      if (token.type !== 'word' || !next || next.value !== '!' || !after || after.type !== 'word') continue;
      const kind = token.value.toLowerCase();
      if (!['fields', 'parameters', 'reportitems', 'globals', 'variables', 'user'].includes(kind)) continue;
      const valueToken = tokens[tokenIndex + 3];
      const hasValue = valueToken && valueToken.value === '.' && tokens[tokenIndex + 4] && tokens[tokenIndex + 4].type === 'word' && tokens[tokenIndex + 4].value.toLowerCase() === 'value';
      if (['fields', 'parameters', 'reportitems', 'variables'].includes(kind) && !hasValue) continue;
      const enclosingCalls = functions.filter(call => call.endIndex >= tokenIndex && call.startIndex < tokenIndex)
        .sort((a, b) => (a.endIndex - a.startIndex) - (b.endIndex - b.startIndex));
      const aggregate = enclosingCalls.find(call => AGGREGATE_FUNCTIONS.has(call.lowerName));
      references.push({
        type: ({ fields: 'Fields', parameters: 'Parameters', reportitems: 'ReportItems', globals: 'Globals', variables: 'Variables', user: 'User' })[kind],
        name: after.value,
        field: kind === 'fields' ? after.value : '',
        start: after.start,
        end: after.end,
        tokenIndex: tokenIndex + 2,
        function: enclosingCalls.length ? enclosingCalls[0].name : '',
        aggregateFunction: aggregate ? aggregate.name : '',
        explicitScope: aggregate ? aggregate.scope : ''
      });
    }

    for (const call of functions) {
      if (call.endIndex < 0) continue;
      if (AGGREGATE_FUNCTIONS.has(call.lowerName) || ['lookup', 'lookupset', 'multilookup'].includes(call.lowerName)) {
        const args = [];
        let depth = 0, start = call.startIndex + 1;
        for (let i = start; i < call.endIndex; i++) {
          if (tokens[i].value === '(') depth++;
          else if (tokens[i].value === ')') depth--;
          else if (tokens[i].value === ',' && depth === 0) { args.push(tokens.slice(start, i)); start = i + 1; }
        }
        args.push(tokens.slice(start, call.endIndex));
        const last = args[args.length - 1] || [];
        if (last.length === 1 && last[0].type === 'string') call.scope = last[0].value;
      }
    }
    for (const reference of references) {
      const enclosingCalls = functions.filter(call => call.endIndex >= reference.tokenIndex && call.startIndex < reference.tokenIndex)
        .sort((a, b) => (a.endIndex - a.startIndex) - (b.endIndex - b.startIndex));
      const containing = enclosingCalls[0];
      reference.function = containing ? containing.name : '';
      reference.containerFunctions = enclosingCalls.map(call => call.name);
      const lookup = enclosingCalls.find(call => ['lookup', 'lookupset', 'multilookup'].includes(call.lowerName));
      reference.lookupFunction = lookup ? lookup.name : '';
      const aggregate = functions.filter(call => AGGREGATE_FUNCTIONS.has(call.lowerName) && call.endIndex >= reference.tokenIndex && call.startIndex < reference.tokenIndex)
        .sort((a, b) => (a.endIndex - a.startIndex) - (b.endIndex - b.startIndex))[0];
      reference.aggregateFunction = aggregate ? aggregate.name : '';
      reference.explicitScope = aggregate ? aggregate.scope : '';
    }

    for (const token of tokens) {
      if (token.type === 'word' && token.value.toLowerCase() === 'code' && source.slice(token.end).match(/^\s*\.\s*[A-Za-z_][\w]*/)) {
        const functionName = source.slice(token.end).match(/^\s*\.\s*([A-Za-z_][\w]*)/)[1];
        references.push({ type: 'Code', name: functionName, field: '', start: token.start, end: token.end, function: functionName, explicitScope: '' });
      }
    }
    const fieldTokens = tokens.filter((token, index) => token.type === 'word' && token.value.toLowerCase() === 'fields' && ['!', '('].includes(tokens[index + 1]?.value));
    return {
      source, tokens, references, functions,
      operators: tokens.filter(token => token.type === 'operator' || token.type === 'word' && LOGICAL_OPERATORS.has(token.value.toLowerCase())).map(token => token.value),
      dynamicFields: fieldTokens.length > references.filter(reference => reference.type === 'Fields').length ||
        fieldTokens.some(token => tokens.some(candidate => candidate.start === token.end && candidate.value === '('))
    };
  }

  function fieldReferences(expression) {
    return scanExpression(expression).references.filter(reference => reference.type === 'Fields').map((reference, fieldIndex, all) => ({
      field: reference.field, fieldIndex, start: reference.start, end: reference.end, fieldCount: all.length
    }));
  }

  function replaceFieldReference(expression, fieldIndex, currentField, newField) {
    const source = String(expression || ''), reference = fieldReferences(source)[Number(fieldIndex)];
    if (!reference || reference.field !== currentField) throw new Error('Il riferimento selezionato non è più coerente.');
    if (!/^[A-Za-z_\u0080-\uFFFF][A-Za-z0-9_\u0080-\uFFFF]*$/.test(String(newField || ''))) throw new Error('Nome campo non valido.');
    return source.slice(0, reference.start) + newField + source.slice(reference.end);
  }

  function parse(xml, deps) {
    const source = String(xml || '');
    if (source.length > MAX_XML_CHARS) throw new Error('File XML troppo grande: limite locale 10 MiB.');
    const Parser = deps && deps.DOMParser || globalThis.DOMParser;
    if (!Parser) throw new Error('Parser XML non disponibile.');
    const doc = new Parser().parseFromString(source, 'application/xml');
    if (elements(doc, 'parsererror').length) throw new Error('XML non valido.');
    const report = doc.documentElement;
    if (!report || local(report) !== 'Report') throw new Error('Documento non riconosciuto come RDL/RDLC.');
    let count = 0;
    const visit = (node, depth) => {
      if (++count > MAX_XML_NODES) throw new Error('Documento XML troppo complesso: limite di 20000 elementi.');
      if (depth > MAX_XML_DEPTH) throw new Error('Documento XML troppo profondo: limite di 128 livelli.');
      for (const child of children(node)) visit(child, depth + 1);
    };
    visit(report, 1);
    return doc;
  }

  function nodeByPath(doc, path) {
    let current = doc;
    for (const part of String(path).split('/')) {
      const match = part.match(/^(.*)\[(\d+)\]$/);
      if (!match) return null;
      const list = Array.from(current.childNodes || []).filter(node => node.nodeType === 1 && local(node) === match[1]);
      current = list[Number(match[2])];
      if (!current) return null;
    }
    return current;
  }

  function ancestor(node, predicate) {
    for (let current = node; current && current.nodeType === 1; current = current.parentNode) if (predicate(current)) return current;
    return null;
  }

  function explicitDataset(node) {
    for (let current = node; current && current.nodeType === 1; current = current.parentNode) {
      const value = text(firstChild(current, 'DataSetName'));
      if (value) return value;
    }
    return '';
  }

  function collectDatasets(doc) {
    return elements(doc, 'DataSet').map(dataset => {
      const fieldsNode = firstChild(dataset, 'Fields');
      return {
        name: attr(dataset, 'Name'),
        path: pathOf(dataset),
        fields: fieldsNode ? children(fieldsNode, 'Field').map(field => ({
          name: attr(field, 'Name'),
          path: pathOf(field),
          dataField: text(firstChild(field, 'DataField')),
          typeName: text(firstChild(field, 'TypeName')),
          uses: 0
        })) : []
      };
    });
  }

  function resolveContext(node, reference, datasets) {
    const explicit = explicitDataset(node);
    const dataRegion = ancestor(node, current => ['Tablix', 'Table', 'Matrix', 'List', 'Chart', 'GaugePanel', 'Map'].includes(local(current)));
    const regionDataset = dataRegion ? text(firstChild(dataRegion, 'DataSetName')) : '';
    const member = ancestor(node, current => local(current) === 'TablixMember');
    const group = member && firstChild(member, 'Group');
    const groupScope = group && attr(group, 'Name') || attr(member, 'Name');
    const scopedDataset = datasets.some(item => item.name === reference.explicitScope) ? reference.explicitScope : '';
    const candidates = [explicit, regionDataset, scopedDataset, datasets.length === 1 ? datasets[0].name : ''];
    const dataset = candidates.find(Boolean) || '';
    const scope = explicit || regionDataset || groupScope || reference.explicitScope || (datasets.length === 1 ? datasets[0].name : '');
    const ambiguous = !dataset || !datasets.some(item => item.name === dataset);
    return { dataset, scope, explicitDataset: explicit, regionDataset, groupScope, explicitScope: reference.explicitScope, ambiguous };
  }

  function ownerInfo(node) {
    const owner = ancestor(node, current => attr(current, 'Name') || VISUAL_TYPES.has(local(current))) || node.parentNode;
    return { element: attr(owner, 'Name') || local(owner) || '(senza nome)', elementType: local(owner) || 'Report', elementPath: pathOf(owner) };
  }

  function tablixDetails(node) {
    const body = firstChild(node, 'TablixBody'), columnsNode = body && firstChild(body, 'TablixColumns'), rowsNode = body && firstChild(body, 'TablixRows');
    const hierarchy = name => {
      const root = firstChild(node, name), members = root && firstChild(root, 'TablixMembers');
      const read = parent => children(parent, 'TablixMember').map(member => {
        const group = firstChild(member, 'Group'), groupExpressions = group && firstChild(group, 'GroupExpressions');
        const sortExpressions = firstChild(member, 'SortExpressions');
        return {
          name: attr(member, 'Name'),
          dynamic: !!group,
          group: group ? { name: attr(group, 'Name'), expressions: groupExpressions ? children(groupExpressions, 'GroupExpression').map(text) : [] } : null,
          sortExpressions: sortExpressions ? children(sortExpressions, 'SortExpression').map(text) : [],
          visibility: text(firstChild(firstChild(member, 'Visibility'), 'Hidden')),
          children: read(firstChild(member, 'TablixMembers'))
        };
      });
      return members ? read(members) : [];
    };
    const rows = rowsNode ? children(rowsNode, 'TablixRow').map(row => {
      const cells = firstChild(row, 'TablixCells');
      return {
        height: text(firstChild(row, 'Height')),
        cells: cells ? children(cells, 'TablixCell').map(cell => {
          const contents = firstChild(cell, 'CellContents'), content = contents && children(contents)[0];
          const rowSpan = attr(contents, 'RowSpan') || text(firstChild(contents, 'RowSpan'));
          const colSpan = attr(contents, 'ColSpan') || text(firstChild(contents, 'ColSpan'));
          return {
            rowSpan: spanValue(rowSpan),
            colSpan: spanValue(colSpan),
            invalidSpan: !!((rowSpan && spanValue(rowSpan) === 1 && rowSpan !== '1') || (colSpan && spanValue(colSpan) === 1 && colSpan !== '1') ||
              Number(rowSpan || 1) > 1000 || Number(colSpan || 1) > 1000),
            contentType: content ? local(content) : '',
            contentName: attr(content, 'Name'),
            contentPath: content ? pathOf(content) : '',
            expression: content ? elements(content, 'Value').map(text).find(Boolean) || '' : '',
            references: []
          };
        }) : []
      };
    }) : [];
    return {
      columns: columnsNode ? children(columnsNode, 'TablixColumn').map(column => text(firstChild(column, 'Width'))) : [],
      rows,
      rowHierarchy: hierarchy('TablixRowHierarchy'),
      columnHierarchy: hierarchy('TablixColumnHierarchy')
    };
  }

  function normalizeNode(node, datasets = []) {
    const type = local(node), attributes = {};
    for (const attribute of Array.from(node.attributes || [])) attributes[attribute.name] = attribute.value;
    const props = {};
    for (const name of ['DataSetName', 'Visibility', 'Style', 'Top', 'Left', 'Width', 'Height', 'ZIndex', 'CanGrow', 'CanShrink', 'PageBreak']) {
      const value = firstChild(node, name);
      if (!value) continue;
      if (name === 'Visibility') props[name] = `Hidden=${text(firstChild(value, 'Hidden'))}${text(firstChild(value, 'ToggleItem')) ? `; ToggleItem=${text(firstChild(value, 'ToggleItem'))}` : ''}`;
      else if (name === 'Style') props[name] = children(value).map(property => `${local(property)}=${text(property)}`).join('; ');
      else if (name === 'PageBreak') props[name] = `Disabled=${text(firstChild(value, 'Disabled'))}; BreakLocation=${text(firstChild(value, 'BreakLocation'))}`;
      else props[name] = text(value);
    }
    const result = {
      type, name: attributes.Name || '', path: pathOf(node), attributes, props,
      interpreted: KNOWN_ELEMENTS.has(type) || VISUAL_TYPES.has(type),
      support: PARTIAL_ELEMENTS.has(type) ? 'partial' : KNOWN_ELEMENTS.has(type) || VISUAL_TYPES.has(type) ? 'structural' : 'uninterpreted',
      value: children(node).length ? '' : String(node.textContent || ''),
      children: children(node).map(child => normalizeNode(child, datasets))
    };
    if (type === 'Tablix' || ['Table', 'Matrix', 'List'].includes(type)) {
      result.tablix = tablixDetails(node);
      result.datasetName = text(firstChild(node, 'DataSetName')) || (datasets.length === 1 ? datasets[0].name : '');
      if (result.datasetName && !result.props.DataSetName) result.props.DataSetName = result.datasetName;
    }
    return result;
  }

  function analyze(xml, deps) {
    const doc = parse(xml, deps), datasets = collectDatasets(doc), refs = [], references = [], expressions = [], warnings = [];
    const expressionNodes = elements(doc, '*').filter(node => {
      const value = String(node.textContent || '');
      return !children(node).length && value.trim().startsWith('=');
    });
    let documentTokenCount = 0;
    for (const node of expressionNodes) {
      const expression = String(node.textContent || ''), normalizedExpression = expression.trim();
      const scanned = scanExpression(normalizedExpression), owner = ownerInfo(node), visual = ancestor(node.parentNode, current => VISUAL_TYPES.has(local(current)));
      const expressionNodesContent = Array.from(node.childNodes || []);
      const textOnlyContent = expressionNodesContent.length <= 1 && expressionNodesContent.every(child => child.nodeType === 3 || child.nodeType === 4);
      documentTokenCount += scanned.tokens.length;
      if (documentTokenCount > MAX_DOCUMENT_TOKENS) throw new Error('Report troppo complesso: limite locale 200000 token di formula.');
      const fieldRefs = scanned.references.filter(reference => reference.type === 'Fields');
      const customCode = scanned.references.some(reference => reference.type === 'Code');
      const customCodeScopes = new Set(fieldRefs.map(reference => resolveContext(node, reference, datasets).dataset).filter(Boolean));
      const fieldIndexes = new Map(fieldRefs.map((reference, index) => [reference, index]));
      const functionDetails = scanned.functions.map(call => ({
        name: call.name,
        type: AGGREGATE_FUNCTIONS.has(call.lowerName) ? 'aggregate' : ['lookup', 'lookupset', 'multilookup'].includes(call.lowerName) ? 'lookup' : ['iif', 'format'].includes(call.lowerName) ? 'builtin' : 'function',
        scope: call.scope,
        support: ['lookup', 'lookupset', 'multilookup'].includes(call.lowerName) ? 'non-executed' : 'partial'
      }));
      const expressionRecord = {
        path: pathOf(node), ownerPath: owner.elementPath, expression, references: [], otherReferences: [],
        functions: scanned.functions.map(call => call.name), functionDetails, operators: scanned.operators,
        support: scanned.dynamicFields ? 'ambiguous' : customCode || functionDetails.some(call => call.type === 'lookup') ? 'non-executed' : 'partial',
        ambiguity: scanned.dynamicFields ? 'Riferimento Fields costruito dinamicamente.' : ''
      };
      for (const reference of scanned.references) {
        const context = resolveContext(node, reference, datasets), dataset = datasets.find(item => item.name === context.dataset);
        const field = dataset && dataset.fields.find(item => item.name === reference.field);
        const lookup = !!reference.lookupFunction;
        const simpleField = /^=\s*Fields![A-Za-z_\u0080-\uFFFF][A-Za-z0-9_\u0080-\uFFFF]*\.Value\s*$/i.test(normalizedExpression);
        let reason = '';
        if (reference.type === 'Fields') {
          if (scanned.dynamicFields) reason = 'Riferimento campo costruito dinamicamente.';
          else if (!textOnlyContent) reason = 'Formula XML strutturata; modifica non consentita per preservare i nodi.';
          else if (context.ambiguous) reason = 'Dataset applicabile non determinabile o non dichiarato.';
          else if (!field) reason = 'Campo corrente assente dal dataset.';
          else if (lookup) reason = 'Il riferimento è contenuto in un Lookup non eseguito.';
          else if (customCode && customCodeScopes.size > 1) reason = 'La formula richiama codice personalizzato con scope multipli non verificabili.';
          else if (reference.aggregateFunction && !context.scope) reason = 'Scope dell’aggregato ambiguo.';
        } else if (reference.type === 'Code') reason = 'Il codice personalizzato viene riconosciuto ma non eseguito.';
        const detail = {
          type: reference.type, name: reference.name, dataset: context.dataset, scope: context.scope,
          explicitScope: context.explicitScope, function: reference.function || '',
          aggregateFunction: reference.aggregateFunction || '', path: pathOf(node),
          support: reference.type === 'Code' || lookup ? 'non-executed' : 'partial', reason
        };
        references.push(detail);
        expressionRecord.otherReferences.push(detail);
        if (reference.type !== 'Fields') continue;
        if (field) field.uses++;
        const record = {
          id: refs.length, path: pathOf(node), expression, field: reference.field || reference.name,
          fieldIndex: fieldIndexes.has(reference) ? fieldIndexes.get(reference) : -1,
          fieldCount: fieldRefs.length, fields: fieldRefs.map(item => item.field),
          dataset: context.dataset, scope: context.scope, explicitScope: context.explicitScope,
          referenceType: reference.type, function: reference.function || '', aggregateFunction: reference.aggregateFunction || '',
          lookupFunction: reference.lookupFunction || '', containerFunctions: reference.containerFunctions || [],
          element: owner.element, elementType: owner.elementType, elementPath: owner.elementPath,
          visualPath: visual ? pathOf(visual) : owner.elementPath, start: reference.start, end: reference.end,
          expressionKind: normalizedExpression.match(/^\s*=\s*Fields![\w]+\.(Value)\s*$/i) ? 'simple' : fieldRefs.length > 1 ? 'composite' : 'wrapped',
          support: scanned.dynamicFields || (reference.type === 'Fields' && context.ambiguous) ? 'ambiguous' : reference.type === 'Code' || lookup ? 'non-executed' : simpleField && !reason ? 'complete' : 'partial',
          editable: reference.type === 'Fields' && !reason, reason
        };
        refs.push(record);
        references[references.length - 1] = record;
        expressionRecord.references.push(record.id);
      }
      if (scanned.dynamicFields || fieldRefs.some(reference => resolveContext(node, reference, datasets).ambiguous)) expressionRecord.support = 'ambiguous';
      else if (customCode || functionDetails.some(call => call.type === 'lookup')) expressionRecord.support = 'non-executed';
      else if (fieldRefs.length && fieldRefs.length === scanned.references.length && fieldRefs.every(reference => /^=\s*Fields![A-Za-z_\u0080-\uFFFF][A-Za-z0-9_\u0080-\uFFFF]*\.Value\s*$/i.test(normalizedExpression))) expressionRecord.support = 'complete';
      expressions.push(expressionRecord);
      if (scanned.dynamicFields) warnings.push(`${owner.element}: ${expressionRecord.ambiguity}`);
    }
    const normalized = normalizeNode(doc.documentElement, datasets);
    const tablixes = elements(doc, 'Tablix').map(node => ({
      path: pathOf(node), name: attr(node, 'Name'),
      dataSetName: explicitDataset(node) || (datasets.length === 1 ? datasets[0].name : ''),
      tablix: tablixDetails(node)
    }));
    for (const tablix of tablixes) {
      for (const row of tablix.tablix.rows) for (const cell of row.cells) {
        cell.references = refs.filter(ref => ref.path === cell.contentPath || ref.path.startsWith(cell.contentPath + '/')).map(ref => ref.id);
      }
    }
    if (datasets.some(dataset => !dataset.name)) warnings.push('Uno o più dataset non hanno un nome.');
    if (datasets.some(dataset => dataset.fields.some(field => !field.name))) warnings.push('Uno o più campi non hanno un nome.');
    if (datasets.some(dataset => dataset.fields.some(field => !field.dataField))) warnings.push('Uno o più campi non hanno DataField.');
    if (!references.length) warnings.push('Nessun riferimento a campi o altre espressioni trovato.');
    refs.filter(ref => ref.reason).forEach(ref => warnings.push(`${ref.element}: ${ref.reason}`));
    const namespace = doc.documentElement.namespaceURI || '';
    const sectionsNode = firstChild(doc.documentElement, 'ReportSections');
    return {
      doc, normalized, datasets, refs, references, expressions, tablixes, warnings: [...new Set(warnings)], namespace,
      snapshot: snapshot(doc, ''),
      reportSections: sectionsNode ? children(sectionsNode, 'ReportSection').map(section => pathOf(section)) : [],
      limits: { maxXmlChars: MAX_XML_CHARS, maxXmlNodes: MAX_XML_NODES, maxXmlDepth: MAX_XML_DEPTH, maxExpressionChars: MAX_EXPRESSION_CHARS, maxExpressionTokens: MAX_EXPRESSION_TOKENS, maxDocumentTokens: MAX_DOCUMENT_TOKENS }
    };
  }

  function snapshot(doc, allowedPath) {
    const rows = [];
    (function walk(node) {
      if (node.nodeType === 1) {
        const attributes = Array.from(node.attributes || []).map(attribute => [attribute.name, attribute.value]).sort((a, b) => a[0].localeCompare(b[0]));
        rows.push(['E', pathOf(node), node.nodeName, node.namespaceURI || '', attributes]);
      } else if (node.nodeType !== 9 && node.nodeType !== 1 && node.parentNode && pathOf(node.parentNode) !== allowedPath) {
        rows.push(['N', pathOf(node.parentNode), node.nodeType, node.nodeValue]);
      }
      for (const child of Array.from(node.childNodes || [])) walk(child);
    })(doc.documentElement);
    return JSON.stringify(rows);
  }

  function remap(model, refId, newField) {
    const ref = model.refs.find(item => item.id === Number(refId));
    if (!ref || !ref.editable) throw new Error(ref && ref.reason || 'Riferimento non modificabile.');
    if (model.snapshot !== snapshot(model.doc, '')) throw new Error('Il documento è cambiato rispetto allo snapshot analizzato.');
    const dataset = model.datasets.find(item => item.name === ref.dataset);
    if (!dataset || !dataset.fields.some(field => field.name === newField)) throw new Error('Campo nuovo assente dal dataset.');
    const target = nodeByPath(model.doc, ref.path);
    if (!target || String(target.textContent || '') !== ref.expression) throw new Error('Elemento selezionato non più coerente.');
    if (children(target).length || Array.from(target.childNodes || []).length > 1 || Array.from(target.childNodes || []).some(child => ![3, 4].includes(child.nodeType))) {
      throw new Error('Il contenuto XML della formula è strutturato; modifica non consentita.');
    }
    const beforeSnapshot = snapshot(model.doc, ref.path), original = String(target.textContent || '');
    const result = replaceFieldReference(original, ref.fieldIndex, ref.field, newField);
    const textNode = Array.from(target.childNodes || []).find(child => child.nodeType === 3 || child.nodeType === 4);
    if (textNode) textNode.nodeValue = result;
    else target.textContent = result;
    if (beforeSnapshot !== snapshot(model.doc, ref.path)) {
      if (textNode) textNode.nodeValue = original;
      else target.textContent = original;
      throw new Error('Conservazione strutturale non garantita.');
    }
    return { path: ref.path, fieldIndex: ref.fieldIndex, before: original, after: result, dataset: ref.dataset, oldField: ref.field, newField };
  }

  function validate(model) {
    const errors = [], warnings = [], partial = [], information = [];
    if (!model.doc || local(model.doc.documentElement) !== 'Report') errors.push('Elemento radice Report non riconosciuto.');
    if (!model.namespace) warnings.push('Namespace RDL assente.');
    else if (!/schemas\.microsoft\.com\/sqlserver\/reporting\/\d{4}\/\d{2}\/\d{2}\/reportdefinition|schemas\.microsoft\.com\/sqlserver\/reporting\/reportdefinition/i.test(model.namespace)) warnings.push(`Namespace RDL non riconosciuto: ${model.namespace}`);
    for (const dataset of model.datasets) {
      if (!dataset.name) errors.push('Dataset senza nome.');
      if (!dataset.fields.length) warnings.push(`${dataset.name || 'Dataset'}: nessun campo dichiarato.`);
      for (const field of dataset.fields) {
        if (!field.name) errors.push(`${dataset.name || 'Dataset'}: campo senza nome.`);
        if (!field.dataField) warnings.push(`${dataset.name || 'Dataset'}/${field.name || 'Campo'}: DataField assente.`);
      }
    }
    const names = new Set(model.datasets.map(dataset => dataset.name).filter(Boolean));
    const scopeNames = new Set(names);
    for (const node of elements(model.doc, '*')) if (attr(node, 'Name') && ['Tablix', 'Table', 'Matrix', 'List', 'Chart', 'GaugePanel', 'TablixMember', 'Group'].includes(local(node))) scopeNames.add(attr(node, 'Name'));
    for (const node of elements(model.doc, '*')) {
      if (['Top', 'Left', 'Width', 'Height', 'PageWidth', 'PageHeight', 'TopMargin', 'BottomMargin', 'LeftMargin', 'RightMargin'].includes(local(node)) && text(node) && length(text(node)) === null) {
        warnings.push(`Misura RDL non interpretabile in ${local(node)}: ${text(node)}.`);
      }
    }
    for (const node of elements(model.doc, 'DataSetName')) {
      const datasetName = text(node);
      if (!datasetName) warnings.push(`${local(node.parentNode)}: DataSetName vuoto; l’associazione al dataset può dipendere dallo scope.`);
      else if (!names.has(datasetName)) errors.push(`DataSetName inesistente: ${datasetName}.`);
    }
    for (const tablix of model.tablixes || []) {
      if (!tablix.dataSetName || !names.has(tablix.dataSetName)) warnings.push(`${tablix.name || 'Tablix'}: dataset non determinabile.`);
      const widths = tablix.tablix.columns.length;
      if (tablix.tablix.rows.length && !widths) warnings.push(`${tablix.name || 'Tablix'}: righe presenti senza colonne dichiarate.`);
      for (const [index, row] of tablix.tablix.rows.entries()) {
        const coveredColumns = row.cells.reduce((count, cell) => count + cell.colSpan, 0);
        if (widths && coveredColumns !== widths) warnings.push(`${tablix.name || 'Tablix'}: riga ${index + 1} copre ${coveredColumns} celle-colonna per ${widths} colonne.`);
        if (row.cells.some(cell => cell.invalidSpan)) warnings.push(`${tablix.name || 'Tablix'}: una o più celle hanno RowSpan/ColSpan non interpretabili.`);
        if (row.cells.some(cell => cell.rowSpan > tablix.tablix.rows.length - index)) warnings.push(`${tablix.name || 'Tablix'}: RowSpan oltre le righe dichiarate nella riga ${index + 1}.`);
      }
      if (tablix.tablix.rowHierarchy.length && tablix.tablix.rows.length && tablix.tablix.rowHierarchy.length > tablix.tablix.rows.length) warnings.push(`${tablix.name || 'Tablix'}: gerarchia righe non associabile con certezza alle righe.`);
      if (tablix.tablix.columnHierarchy.length && widths && tablix.tablix.columnHierarchy.length > widths) warnings.push(`${tablix.name || 'Tablix'}: gerarchia colonne non associabile con certezza alle colonne.`);
    }
    for (const ref of model.refs) {
      if (ref.referenceType === 'Fields' && ref.reason) {
        if (ref.reason.includes('assente dal dataset')) errors.push(`${ref.element}: riferimento a campo inesistente.`);
        else warnings.push(`${ref.element}: ${ref.reason}`);
      } else if (ref.referenceType === 'Fields' && !model.datasets.some(dataset => dataset.name === ref.dataset && dataset.fields.some(field => field.name === ref.field))) {
        errors.push(`${ref.element}: riferimento a campo inesistente.`);
      }
      if (ref.aggregateFunction && ref.explicitScope && !scopeNames.has(ref.explicitScope)) warnings.push(`${ref.element}: scope aggregato non dichiarato (${ref.explicitScope}).`);
      if (ref.fieldCount > 1) warnings.push(`${ref.element}: formula con riferimenti multipli; le modifiche sono puntuali.`);
    }
    for (const reference of model.references || []) {
      const type = reference.type || reference.referenceType;
      if (type === 'Fields') continue;
      partial.push(type === 'Code'
        ? `Code.${reference.name} riconosciuto ma non eseguito.`
        : `${type}!${reference.name} riconosciuto, non valutato.`);
    }
    if (model.normalized) {
      const walk = node => {
        if (!node.interpreted) partial.push(`${node.type} conservato ma non interpretato.`);
        else if (node.support === 'partial') partial.push(`${node.type} visualizzato solo strutturalmente.`);
        node.children.forEach(walk);
      };
      walk(model.normalized);
    }
    if (!model.datasets.length) warnings.push('Nessun dataset dichiarato.');
    information.push('La verifica riguarda solo la struttura locale e le regole supportate; non certifica la validità per Business Central.');
    const unique = values => [...new Set(values)];
    const result = { errors: unique(errors), warnings: unique(warnings), partial: unique(partial), information: unique(information) };
    result.ok = result.errors.length === 0;
    return result;
  }

  function serialize(doc, deps) {
    const Serializer = deps && deps.XMLSerializer || globalThis.XMLSerializer;
    if (!Serializer) throw new Error('Serializzatore XML non disponibile.');
    return new Serializer().serializeToString(doc);
  }

  function length(value) {
    const match = String(value || '').trim().match(/^(-?\d+(?:\.\d+)?)\s*(in|cm|mm|pt|pc|px)$/i);
    if (!match) return null;
    const factors = { in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72, pc: 16, px: 1 };
    const result = Number(match[1]) * factors[match[2].toLowerCase()];
    return Number.isFinite(result) ? result : null;
  }

  return {
    analyze, remap, validate, serialize, replaceFieldReference, fieldReferences, scanExpression,
    normalizeNode, tablixDetails, length, local, children, firstChild, text, pathOf,
    limits: { maxXmlChars: MAX_XML_CHARS, maxXmlNodes: MAX_XML_NODES, maxXmlDepth: MAX_XML_DEPTH, maxExpressionChars: MAX_EXPRESSION_CHARS, maxExpressionTokens: MAX_EXPRESSION_TOKENS, maxDocumentTokens: MAX_DOCUMENT_TOKENS }
  };
});
