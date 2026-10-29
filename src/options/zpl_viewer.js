// zpl_viewer.js — anteprima ZPL tramite Labelary.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const source = $('zplSource');
  const file = $('zplFile');
  const dpmm = $('zplDpmm');
  const width = $('zplWidth');
  const height = $('zplHeight');
  const index = $('zplIndex');
  const renderButton = $('zplRender');
  const downloadButton = $('zplDownload');
  const exportExcelButton = $('zplExportExcel');
  const clearButton = $('zplClear');
  const duplicatesButton = $('zplDuplicates');
  const highlightFieldButton = $('zplHighlightField');
  const duplicatePanel = $('zplDuplicatePanel');
  const duplicateList = $('zplDuplicateList');
  const duplicateRemoveButton = $('zplDuplicateRemove');
  const duplicateCloseButton = $('zplDuplicateClose');
  const exampleButton = $('zplExample');
  const ensureEnvelopeButton = $('zplEnsureEnvelope');
  const insertCenteredButton = $('zplInsertCentered');
  const barcodeData = $('zplBarcodeData');
  const barcodeHeight = $('zplBarcodeHeight');
  const barcodePreviewButton = $('zplBarcodePreviewButton');
  const barcodeInsertButton = $('zplBarcodeInsertButton');
  const barcodeStatus = $('zplBarcodeStatus');
  const modelName = $('zplModelName');
  const modelList = $('zplModelList');
  const modelSaveButton = $('zplModelSave');
  const modelLoadButton = $('zplModelLoad');
  const modelDeleteButton = $('zplModelDelete');
  const printerList = $('zplPrinterList');
  const printerRefreshButton = $('zplPrinterRefresh');
  const printPrepareButton = $('zplPrintPrepare');
  const preview = $('zplPreview');
  const previewPanel = preview && preview.closest('.zpl-preview-panel');
  const empty = $('zplPreviewEmpty');
  const status = $('zplStatus');
  const previewHeading = $('zplPreviewHeading');
  if (![source,file,dpmm,width,height,index,renderButton,downloadButton,exportExcelButton,clearButton,duplicatesButton,highlightFieldButton,duplicatePanel,duplicateList,duplicateRemoveButton,duplicateCloseButton,exampleButton,ensureEnvelopeButton,insertCenteredButton,barcodeData,barcodeHeight,barcodePreviewButton,barcodeInsertButton,barcodeStatus,modelName,modelList,modelSaveButton,modelLoadButton,modelDeleteButton,printerList,printerRefreshButton,printPrepareButton,preview,empty,status,previewHeading].every(Boolean)) return;

  const API_ROOT = 'https://api.labelary.com/v1/printers';
  const VALID_DPMM = new Set(['6','8','12','24']);
  const MODELS_KEY = 'bcToolsZplModels';
  const MAX_MODELS = 5;
  const PRINTERS_KEY = 'bcToolsPrinterNames';
  const PRINT_JOB_KEY = 'bcToolsZplPrintJob';
  const PRINTER_PAGE_ID = '5108105';
  let imageUrl = '';
  let diagnosticImageUrl = '';
  let duplicatePreviewToken = 0;
  let manualDiagnosticItems = [];
  let tableSnapshot = null;
  let lastSelectionStart = 0;
  let lastSelectionEnd = 0;
  let pendingInsertionSelection = null;
  let sourceContextUrl = '';


  function rememberSelection() {
    lastSelectionStart = Number.isInteger(source.selectionStart) ? source.selectionStart : source.value.length;
    lastSelectionEnd = Number.isInteger(source.selectionEnd) ? source.selectionEnd : lastSelectionStart;
  }
  function captureInsertionSelection() {
    pendingInsertionSelection = {
      start:Number.isInteger(source.selectionStart) ? source.selectionStart : lastSelectionStart,
      end:Number.isInteger(source.selectionEnd) ? source.selectionEnd : lastSelectionEnd,
      value:source.value
    };
  }
  function visibleCaretAt(position) {
    const before = source.value.slice(0, Math.max(0, position));
    const line = before.split('\n').length - 1;
    const lineHeight = parseFloat(getComputedStyle(source).lineHeight) || 18;
    source.scrollTop = Math.max(0, line * lineHeight - source.clientHeight / 2);
  }
  function ensureZplEnvelope(showMessage=false) {
    let text = String(source.value || '').trim();
    if (!text) text = '^XA\n^XZ';
    const hasStart = /\^XA/i.test(text);
    const hasEnd = /\^XZ/i.test(text);
    if (!hasStart) text = `^XA\n${text}`;
    if (!hasEnd) text = `${text}\n^XZ`;
    const changed = text !== source.value;
    source.value = text;
    if (changed) {
      lastSelectionStart = lastSelectionEnd = Math.max(0, text.toUpperCase().lastIndexOf('^XZ'));
      if (showMessage) setStatus('Aggiunti solo i delimitatori ^XA/^XZ mancanti.', 'ok');
    } else if (showMessage) setStatus('^XA e ^XZ sono già presenti.', 'ok');
    return changed;
  }
  function insertAtRememberedCursor(value) {
    const captured = pendingInsertionSelection || {start:lastSelectionStart,end:lastSelectionEnd,value:source.value};
    pendingInsertionSelection = null;
    const original = String(captured.value || '');
    const leadingTrim = original.length - original.trimStart().length;
    const originalCore = original.trim();
    const addedStart = /\^XA/i.test(originalCore) ? 0 : 4;
    ensureZplEnvelope(false);
    const endMarker = source.value.toUpperCase().lastIndexOf('^XZ');
    let start = Math.max(0, Number(captured.start || 0) - leadingTrim + addedStart);
    let end = Math.max(start, Number(captured.end || captured.start || 0) - leadingTrim + addedStart);
    start = Math.min(start, source.value.length);
    end = Math.min(end, source.value.length);
    if (start > endMarker || end > endMarker) start = end = endMarker;
    const before = source.value.slice(0, start);
    const after = source.value.slice(end);
    const prefix = before && !before.endsWith('\n') ? '\n' : '';
    const suffix = after && !after.startsWith('\n') ? '\n' : '';
    const inserted = `${prefix}${value}${suffix}`;
    source.value = before + inserted + after;
    const insertionStart = before.length + prefix.length;
    const caret = insertionStart + value.length;
    source.focus();
    source.setSelectionRange(caret, caret);
    visibleCaretAt(insertionStart);
    rememberSelection();
    applyInferredLabelSize(source.value);
  }
  function labelDimensionsDots() {
    const text = String(source.value || '');
    const explicitWidth = text.match(/\^PW(\d+)/i);
    const explicitHeight = text.match(/\^LL(\d+)/i);
    return {
      width: explicitWidth ? Math.max(1, Number(explicitWidth[1])) : Math.max(1, Math.round(Number(width.value || 4) * dpmmValue() * 25.4)),
      height: explicitHeight ? Math.max(1, Number(explicitHeight[1])) : Math.max(1, Math.round(Number(height.value || 6) * dpmmValue() * 25.4))
    };
  }
  function centeredTextSnippet() {
    const label = labelDimensionsDots();
    return `^FO0,0^A0N,40,40^FB${label.width},10,4,C,0^FD Inserisci testo ^FS`;
  }
  function barcodeValues() {
    const data = String(barcodeData.value || '').trim();
    const h = Number(barcodeHeight.value);
    if (!data) return {error:'Inserisci il valore del codice a barre.'};
    if (/[\^~\r\n]/.test(data)) return {error:'Il valore non può contenere ^, ~ o ritorni a capo.'};
    if (!Number.isInteger(h) || h < 20 || h > 1200) return {error:'L’altezza deve essere un intero tra 20 e 1200 dot.'};
    return {data, h};
  }
  function barcodeSnippet(values) {
    const label = labelDimensionsDots();
    const moduleCount = (values.data.length + 3) * 11 + 13;
    const moduleWidth = moduleCount * 2 <= label.width ? 2 : 1;
    const barcodeWidth = moduleCount * moduleWidth;
    const interpretationHeight = 36;
    const x = Math.max(0, Math.round((label.width - barcodeWidth) / 2));
    const y = Math.max(0, Math.round((label.height - values.h - interpretationHeight) / 2));
    return `^BY${moduleWidth},3,${values.h}\n^FO${x},${y}^BCN,${values.h},Y,N,N^FD${values.data}^FS`;
  }
  async function previewBarcode() {
    const values = barcodeValues();
    if (values.error) { barcodeStatus.textContent = values.error; return; }
    barcodeStatus.textContent = 'Generazione anteprima barcode…';
    const label = labelDimensionsDots();
    const zpl = `^XA\n^PW${label.width}\n^LL${label.height}\n${barcodeSnippet(values)}\n^XZ`;
    const w = dotsToInches(label.width);
    const h = dotsToInches(label.height);
    releasePreview();
    barcodePreviewButton.disabled = true;
    try {
      const response = await fetch(`${API_ROOT}/${dpmm.value}dpmm/labels/${w}x${h}/0/`, {method:'POST', headers:{'Accept':'image/png','Content-Type':'application/x-www-form-urlencoded'}, body:zpl});
      if (!response.ok) throw new Error((await response.text()).trim() || `Errore HTTP ${response.status}`);
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) throw new Error('La risposta non contiene un’immagine valida.');
      imageUrl = URL.createObjectURL(blob);
      preview.src = imageUrl;
      preview.alt = 'Anteprima codice a barre Code 128';
      preview.hidden = false;
      empty.hidden = true;
      previewHeading.textContent = 'Anteprima barcode';
      fitPreview();
      downloadButton.disabled = false;
      barcodeStatus.textContent = 'Anteprima barcode generata e centrata sul formato etichetta.';
    } catch (error) {
      releasePreview();
      barcodeStatus.textContent = `Impossibile generare l’anteprima: ${error && error.message ? error.message : 'errore sconosciuto'}`;
    } finally {
      barcodePreviewButton.disabled = false;
    }
  }
  function xmlEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
  }
  function normalizeHeader(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('it');
  }
  function boundedLines(zpl) {
    const text = String(zpl || '').replace(/\r\n?/g, '\n');
    const start = text.indexOf('^XA');
    const end = start >= 0 ? text.indexOf('^XZ', start) : -1;
    if (start < 0 || end < 0) return [];
    return text.slice(start, end + 3).split('\n').map(line => line.trim()).filter(Boolean);
  }
  const DEFAULT_EXPORT_HEADERS = [
    'Tipo campo','Stringa fissa','Nr. tabella origine','Nome tabella origine',
    'Nr. campo tabella origine','Nome campo tabella origine','Riga divisione attiva',
    'Dalla posizione','Alla posizione','Formato data','Replace Path With Fixed String','Add Attributes'
  ];
  function exportIndexes(headers, snapshot={}) {
    const exact = label => headers.findIndex(header => normalizeHeader(header) === normalizeHeader(label));
    return {
      type:exact('Tipo campo'),
      fixed:Number.isInteger(snapshot.fixedIndex) ? snapshot.fixedIndex : exact('Stringa fissa'),
      tableNo:exact('Nr. tabella origine'), tableName:exact('Nome tabella origine'),
      fieldNo:exact('Nr. campo tabella origine'),
      field:Number.isInteger(snapshot.fieldIndex) ? snapshot.fieldIndex : exact('Nome campo tabella origine'),
      split:exact('Riga divisione attiva'), from:exact('Dalla posizione'), to:exact('Alla posizione'),
      date:exact('Formato data'), replacePath:exact('Replace Path With Fixed String'), attributes:exact('Add Attributes')
    };
  }
  function setCell(row, index, value) { if(index >= 0) row[index]=value; }
  function newBaseRow(headers, indexes) {
    const row=Array(headers.length).fill('');
    for(const index of [indexes.tableNo,indexes.fieldNo,indexes.split,indexes.from,indexes.to,indexes.replacePath]) setCell(row,index,'0');
    return row;
  }
  function parseEditorLine(line) {
    const text=String(line || '');
    const matches=[...text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)];
    if(matches.length > 1) throw new Error('Ogni riga ZPL può contenere un solo campo dinamico {{Nome campo}}.');
    if(matches.length === 1) {
      const field=matches[0][1].replace(/\s+/g,' ').trim();
      if(!field) throw new Error('Il nome del campo dinamico non può essere vuoto.');
      return {editor:text, excel:text.replace(matches[0][0],'%1'), printable:text.replace(matches[0][0],field), field, dynamic:true};
    }
    if(text.includes('%1')) return {editor:text,excel:text,printable:text,field:'%1',dynamic:true};
    return {editor:text,excel:text,printable:text,field:'',dynamic:false};
  }
  function printableZpl(zpl) { return boundedLines(zpl).map(line => parseEditorLine(line).printable).join('\n'); }
  function editorLineFromRow(row, indexes) {
    const fixed=String(row[indexes.fixed] || '');
    const field=indexes.field >= 0 ? String(row[indexes.field] || '').trim() : '';
    return field && fixed.includes('%1') ? fixed.replace(/%1/g,` {{${field}}} `) : fixed;
  }
  function applyNewRules(row, parsed, indexes) {
    setCell(row,indexes.type,parsed.dynamic ? 'Relazione campo' : 'Stringa fissa');
    setCell(row,indexes.fixed,parsed.excel);
    setCell(row,indexes.field,parsed.dynamic ? parsed.field : '');
    if(!parsed.dynamic) {
      setCell(row,indexes.tableNo,'0'); setCell(row,indexes.tableName,'');
      setCell(row,indexes.fieldNo,'0');
    }
    return row;
  }
  function newRowFromLine(headers, indexes, line) {
    return applyNewRules(newBaseRow(headers,indexes),parseEditorLine(line),indexes);
  }
  function lcsPairs(left, right) {
    const n=left.length, m=right.length;
    const dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
    for(let i=n-1;i>=0;i--) for(let j=m-1;j>=0;j--)
      dp[i][j]=left[i]===right[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j],dp[i][j+1]);
    const pairs=[]; let i=0,j=0;
    while(i<n && j<m){
      if(left[i]===right[j]){ pairs.push([i,j]); i++; j++; }
      else if(dp[i+1][j]>=dp[i][j+1]) i++; else j++;
    }
    return pairs;
  }
  function uniqueDynamicPairs(rows, edited, indexes, usedOld, usedNew) {
    const oldByField=new Map(), newByField=new Map();
    rows.forEach((row,i)=>{
      if(usedOld.has(i)) return;
      const parsed=parseEditorLine(editorLineFromRow(row,indexes));
      if(!parsed.dynamic || !parsed.field || parsed.field==='%1') return;
      const list=oldByField.get(parsed.field) || []; list.push(i); oldByField.set(parsed.field,list);
    });
    edited.forEach((line,j)=>{
      if(usedNew.has(j)) return;
      const parsed=parseEditorLine(line);
      if(!parsed.dynamic || !parsed.field || parsed.field==='%1') return;
      const list=newByField.get(parsed.field) || []; list.push(j); newByField.set(parsed.field,list);
    });
    const pairs=[];
    for(const [field,oldItems] of oldByField){
      const newItems=newByField.get(field) || [];
      if(oldItems.length===1 && newItems.length===1) pairs.push([oldItems[0],newItems[0]]);
    }
    return pairs;
  }
  function buildExportRows(snapshot, editedZpl) {
    const headers=(snapshot.headers || []).map(String);
    const rows=(snapshot.rows || []).map(row => Array.from(row || [], value => String(value ?? '')));
    const indexes=exportIndexes(headers,snapshot);
    if(indexes.fixed<0) throw new Error('Colonna “Stringa fissa” non disponibile nello snapshot.');
    const original=rows.map(row=>editorLineFromRow(row,indexes));
    const edited=boundedLines(editedZpl);
    if(!edited.length) throw new Error('Il codice modificato deve contenere ^XA e ^XZ.');
    const exact=lcsPairs(original,edited), usedOld=new Set(exact.map(pair=>pair[0])), usedNew=new Set(exact.map(pair=>pair[1]));
    const dynamic=uniqueDynamicPairs(rows,edited,indexes,usedOld,usedNew);
    const byNew=new Map([...exact,...dynamic].map(pair=>[pair[1],pair[0]]));
    return {headers,rows:edited.map((line,newIndex)=>{
      const oldIndex=byNew.get(newIndex), parsed=parseEditorLine(line);
      if(oldIndex === undefined) return newRowFromLine(headers,indexes,line);
      const row=rows[oldIndex].slice();
      const oldParsed=parseEditorLine(original[oldIndex]);
      if(parsed.dynamic && oldParsed.dynamic && parsed.field===oldParsed.field) {
        setCell(row,indexes.type,'Relazione campo');
        setCell(row,indexes.fixed,parsed.excel);
        setCell(row,indexes.field,parsed.field);
        return row;
      }
      if(!parsed.dynamic && !oldParsed.dynamic && parsed.editor===oldParsed.editor) return applyNewRules(row,parsed,indexes);
      return newRowFromLine(headers,indexes,line);
    })};
  }
  function buildNewExportRows(editedZpl) {
    const headers=DEFAULT_EXPORT_HEADERS.slice(), indexes=exportIndexes(headers);
    const lines=boundedLines(editedZpl);
    if(!lines.length) throw new Error('Il codice deve contenere un blocco completo ^XA…^XZ.');
    return {headers,rows:lines.map(line=>newRowFromLine(headers,indexes,line))};
  }
  function zplVisibleBlocks(zpl) {
    const text=String(zpl || '').replace(/\r\n?/g,'\n'), blocks=[];
    const matcher=/\^(?:FO|FT)(?:(?!\^(?:FO|FT|XZ))[\s\S])*?\^FS/gi;
    for(const match of text.matchAll(matcher)) {
      const start=match.index, end=start+match[0].length;
      const firstLine=text.slice(0,start).split('\n').length-1;
      const lineCount=match[0].split('\n').length;
      const lineIndexes=Array.from({length:lineCount},(_,offset)=>firstLine+offset);
      const value=match[0].trim();
      if(/\^(?:FD|FV|GB|GC|GD|GE|GF|BQ|BX|BC)/i.test(value)) blocks.push({text:value,lineIndexes,start,end:end-1});
    }
    return blocks;
  }
  function selectedVisibleBlocks(zpl, selectionStart, selectionEnd) {
    const blocks=zplVisibleBlocks(zpl);
    const start=Math.max(0,Number(selectionStart)||0), end=Math.max(start,Number(selectionEnd)||start);
    if(end>start) {
      const touched=blocks.filter(block=>block.start<end && block.end+1>start);
      if(touched.length) return touched;
    }
    const containing=blocks.find(block=>block.start<=start && start<=block.end+1);
    return containing ? [containing] : [];
  }
  function duplicateGroups(zpl) {
    const blocks=zplVisibleBlocks(zpl), byBlock=new Map();
    blocks.forEach(block=>{ const key=block.text.replace(/\s+/g,' ').trim(); const list=byBlock.get(key)||[]; list.push(block); byBlock.set(key,list); });
    return [...byBlock.entries()].filter(([,items])=>items.length>1).map(([key,items])=>({key,line:items[0].text,items,indexes:items.map(item=>item.lineIndexes[0])}));
  }
  function setupZplForDiagnostic(zpl) {
    return boundedLines(zpl).filter(line=>/^\^(?:CI|CF|BY|FW|LH|LS|LT|PW|LL|PO|PR|MD)(?:\W|\d|$)/i.test(line)).join('\n');
  }
  function diagnosticZpl(zpl, groups) {
    const setup=setupZplForDiagnostic(zpl);
    const blocks=groups.flatMap(group=>group.items.map(item=>item.text.split('\n').map(line=>parseEditorLine(line).printable).join('\n')));
    return ['^XA',setup,...blocks,'^XZ'].filter(Boolean).join('\n');
  }
  function selectedTextRange(item) {
    const raw=String(source.value || '');
    const start=Math.max(0,item.start || raw.indexOf(item.text));
    const end=Math.min(raw.length,Math.max(start+1,(item.end || start+item.text.length)+1));
    source.focus(); source.setSelectionRange(start,end); visibleCaretAt(start); rememberSelection();
  }
  function loadImage(url) {
    return new Promise((resolve,reject)=>{ const img=new Image(); img.onload=()=>resolve(img); img.onerror=()=>reject(new Error('Immagine di anteprima non disponibile.')); img.src=url; });
  }
  async function renderDiagnosticGroups(groups) {
    const token=++duplicatePreviewToken;
    if(!groups.length || !imageUrl){
      if(diagnosticImageUrl) URL.revokeObjectURL(diagnosticImageUrl);
      diagnosticImageUrl=''; if(imageUrl) preview.src=imageUrl; return;
    }
    const input=validate(); if(input.error) return;
    try {
      const endpoint=`${API_ROOT}/${input.density}dpmm/labels/${input.w}x${input.h}/${input.i}/`;
      const response=await fetch(endpoint,{method:'POST',headers:{'Accept':'image/png','Content-Type':'application/x-www-form-urlencoded'},body:diagnosticZpl(input.printableZpl,groups)});
      if(!response.ok) throw new Error((await response.text()).trim() || `Errore HTTP ${response.status}`);
      const maskBlob=await response.blob();
      const maskUrl=URL.createObjectURL(maskBlob);
      try {
        const [base,mask]=await Promise.all([loadImage(imageUrl),loadImage(maskUrl)]);
        if(token!==duplicatePreviewToken) return;
        const canvas=document.createElement('canvas'); canvas.width=base.naturalWidth; canvas.height=base.naturalHeight;
        const ctx=canvas.getContext('2d',{willReadFrequently:true}); ctx.drawImage(base,0,0);
        const basePixels=ctx.getImageData(0,0,canvas.width,canvas.height);
        const maskCanvas=document.createElement('canvas'); maskCanvas.width=canvas.width; maskCanvas.height=canvas.height;
        const maskCtx=maskCanvas.getContext('2d',{willReadFrequently:true}); maskCtx.drawImage(mask,0,0,canvas.width,canvas.height);
        const maskPixels=maskCtx.getImageData(0,0,canvas.width,canvas.height).data, data=basePixels.data;
        for(let i=0;i<data.length;i+=4){
          const darkness=1-(maskPixels[i]+maskPixels[i+1]+maskPixels[i+2])/(3*255);
          if(darkness<.08) continue;
          const a=Math.min(1,darkness*1.35); data[i]=255; data[i+1]=Math.round(data[i+1]*(1-a)); data[i+2]=Math.round(data[i+2]*(1-a));
        }
        ctx.putImageData(basePixels,0,0);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
        if(token!==duplicatePreviewToken || !blob) return;
        if(diagnosticImageUrl) URL.revokeObjectURL(diagnosticImageUrl);
        diagnosticImageUrl=URL.createObjectURL(blob); preview.src=diagnosticImageUrl; previewHeading.textContent='Anteprima ZPL · evidenziazione diagnostica rossa';
      } finally { URL.revokeObjectURL(maskUrl); }
    } catch(error){ setStatus(`Impossibile evidenziare nell’anteprima: ${error && error.message ? error.message : 'errore sconosciuto'}`,'error'); }
  }
  function columnName(index) {
    let name='';
    for(let n=index+1;n;n=Math.floor((n-1)/26)) name=String.fromCharCode(65+(n-1)%26)+name;
    return name;
  }
  function crc32(bytes) {
    let crc=0xFFFFFFFF;
    for(const byte of bytes){ crc^=byte; for(let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xEDB88320:0); }
    return (crc^0xFFFFFFFF)>>>0;
  }
  function u16(value){ return new Uint8Array([value&255,(value>>>8)&255]); }
  function u32(value){ return new Uint8Array([value&255,(value>>>8)&255,(value>>>16)&255,(value>>>24)&255]); }
  function concatBytes(parts){
    const total=parts.reduce((sum,p)=>sum+p.length,0), out=new Uint8Array(total); let offset=0;
    for(const part of parts){ out.set(part,offset); offset+=part.length; }
    return out;
  }
  function zipStore(entries) {
    const encoder=new TextEncoder(), locals=[], centrals=[]; let offset=0;
    for(const [name,text] of entries){
      const nameBytes=encoder.encode(name), data=encoder.encode(text), crc=crc32(data);
      const local=concatBytes([u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(nameBytes.length),u16(0),nameBytes,data]);
      locals.push(local);
      const central=concatBytes([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(nameBytes.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),nameBytes]);
      centrals.push(central); offset+=local.length;
    }
    const centralSize=centrals.reduce((sum,p)=>sum+p.length,0);
    return concatBytes([...locals,...centrals,u32(0x06054b50),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(centralSize),u32(offset),u16(0)]);
  }
  function workbookBytes(headers, rows, sheetName) {
    const all=[headers,...rows], maxCol=Math.max(1,headers.length), maxRow=Math.max(1,all.length);
    const widths=headers.map((_,c)=>Math.min(70,Math.max(10,...all.map(row=>String(row[c] ?? '').length+2))));
    const sheetRows=all.map((row,r)=>{
      const cells=headers.map((_,c)=>`<c r="${columnName(c)}${r+1}" t="inlineStr" s="${r===0?1:0}"><is><t xml:space="preserve">${xmlEscape(row[c] ?? '')}</t></is></c>`).join('');
      return `<row r="${r+1}">${cells}</row>`;
    }).join('');
    const cols=widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('');
    const safeSheet=String(sheetName || 'Riga etichetta stampa Layout').slice(0,31).replace(/[\\/*?:\[\]]/g,'_');
    const entries=[
      ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
      ['_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(safeSheet)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['xl/styles.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0078D4"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>'],
      ['xl/worksheets/sheet1.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${columnName(maxCol-1)}${maxRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${columnName(maxCol-1)}${maxRow}"/></worksheet>`]
    ];
    return zipStore(entries);
  }
  function downloadBlob(blob,name){
    const url=URL.createObjectURL(blob), link=document.createElement('a');
    link.href=url; link.download=name; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function setStatus(message, kind) {
    status.textContent = message || '';
    status.className = kind || '';
  }
  async function readModels() {
    const data = await chrome.storage.local.get({ [MODELS_KEY]:[] });
    return Array.isArray(data[MODELS_KEY]) ? data[MODELS_KEY].slice(0, MAX_MODELS) : [];
  }
  async function writeModels(models) {
    await chrome.storage.local.set({ [MODELS_KEY]:models.slice(0, MAX_MODELS) });
  }
  async function readPrinterNames() {
    const data = await chrome.storage.local.get({ [PRINTERS_KEY]:[] });
    return Array.isArray(data[PRINTERS_KEY])
      ? [...new Set(data[PRINTERS_KEY].map(value => String(value || '').trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'it'))
      : [];
  }
  function renderPrinterList(names, selected='') {
    printerList.replaceChildren();
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = names.length ? 'Seleziona una stampante' : 'Acquisisci l’elenco delle stampanti';
    printerList.appendChild(emptyOption);
    names.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      printerList.appendChild(option);
    });
    if (selected && names.includes(selected)) printerList.value = selected;
    printPrepareButton.disabled = !printerList.value;
  }
  async function refreshPrinterList(selected='') {
    const names = await readPrinterNames();
    renderPrinterList(names, selected);
    return names;
  }
  async function resolveBusinessCentralUrl() {
    try {
      if (!sourceContextUrl) throw new Error('context-unavailable');
      const context = await BcToolsUrlContext.resolve(sourceContextUrl);
      return BcToolsUrlContext.build(context, {
        set:{page:PRINTER_PAGE_ID},
        remove:['table','filter','mode','dc','bookmark'],
        hash:''
      });
    } catch (error) {
      BcToolsUrlContext.reportError('zpl-print', error);
      throw new Error('Apri il viewer ZPL da una scheda Business Central valida.');
    }
  }
  async function waitForPrintJob(jobId, acceptedStates, timeoutMs=30000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const data = await chrome.storage.local.get({ [PRINT_JOB_KEY]:null });
      const job = data && data[PRINT_JOB_KEY];
      if (job && job.id === jobId) {
        if (job.state === 'error') throw new Error(job.error || 'Operazione non riuscita.');
        if (acceptedStates.includes(job.state)) return job;
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    throw new Error('Tempo scaduto durante l’attesa di Business Central.');
  }
  async function acquirePrinters() {
    printerRefreshButton.disabled = true;
    setStatus('Apertura dell’elenco stampanti in Business Central…', '');
    let tabId = null;
    try {
      const url = await resolveBusinessCentralUrl();
      const job = { id:`printers-${Date.now()}-${Math.random().toString(36).slice(2)}`, action:'acquirePrinters', state:'pending', createdAt:Date.now() };
      await chrome.storage.local.set({ [PRINT_JOB_KEY]:job });
      const tab = await chrome.tabs.create({ url, active:true });
      tabId = tab && tab.id;
      const result = await waitForPrintJob(job.id, ['printersReady']);
      const names = await refreshPrinterList();
      if (!names.length) throw new Error('Nessuna stampante trovata nella colonna Nome.');
      setStatus(`Acquisite ${names.length} stampanti.`, 'ok');
      await chrome.storage.local.remove(PRINT_JOB_KEY);
      if (tabId) await chrome.tabs.remove(tabId).catch(() => {});
    } catch (error) {
      setStatus(`Impossibile acquisire le stampanti: ${error && error.message ? error.message : 'errore sconosciuto'}`, 'error');
    } finally {
      printerRefreshButton.disabled = false;
    }
  }
  async function preparePrint() {
    const printerName = String(printerList.value || '').trim();
    if (!printerName) { setStatus('Seleziona una stampante.', 'error'); return; }
    const input = validate();
    if (input.error) { setStatus(input.error, 'error'); return; }
    printPrepareButton.disabled = true;
    setStatus(`Preparazione stampa su “${printerName}”…`, '');
    try {
      const url = await resolveBusinessCentralUrl();
      const job = {
        id:`print-${Date.now()}-${Math.random().toString(36).slice(2)}`, action:'preparePrint', state:'pending',
        printerName, zpl:input.printableZpl, createdAt:Date.now()
      };
      await chrome.storage.local.set({ [PRINT_JOB_KEY]:job });
      await chrome.tabs.create({ url, active:true });
      await waitForPrintJob(job.id, ['textInserted'], 45000);
      setStatus(`Testo inserito per “${printerName}”. Conferma manualmente con OK in Business Central.`, 'ok');
    } catch (error) {
      setStatus(`Impossibile preparare la stampa: ${error && error.message ? error.message : 'errore sconosciuto'}`, 'error');
    } finally {
      printPrepareButton.disabled = !printerList.value;
    }
  }
  function selectedModelIndex() {
    if (modelList.value === '') return -1;
    const value = Number(modelList.value);
    return Number.isInteger(value) && value >= 0 ? value : -1;
  }
  function updateModelButtons() {
    const selected = selectedModelIndex() >= 0;
    modelLoadButton.disabled = !selected;
    modelDeleteButton.disabled = !selected;
  }
  function renderModelList(models, selectedIndex=-1) {
    modelList.replaceChildren();
    if (!models.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Nessun modello salvato';
      modelList.appendChild(option);
    } else {
      models.forEach((model, i) => {
        const option = document.createElement('option');
        option.value = String(i);
        option.textContent = model.name;
        modelList.appendChild(option);
      });
      modelList.value = String(selectedIndex >= 0 && selectedIndex < models.length ? selectedIndex : 0);
    }
    updateModelButtons();
  }
  async function refreshModels(selectedIndex=-1) {
    const models = await readModels();
    renderModelList(models, selectedIndex);
    return models;
  }
  async function saveModel() {
    const name = modelName.value.replace(/\s+/g, ' ').trim();
    if (!name) { setStatus('Inserisci un nome per il modello.', 'error'); modelName.focus(); return; }
    const input = validate();
    if (input.error) { setStatus(input.error, 'error'); return; }
    try {
      const models = await readModels();
      const existing = models.findIndex(model => model && model.name.toLocaleLowerCase('it') === name.toLocaleLowerCase('it'));
      if (existing < 0 && models.length >= MAX_MODELS) {
        setStatus(`Puoi salvare al massimo ${MAX_MODELS} modelli. Eliminane uno prima di continuare.`, 'error');
        return;
      }
      if (existing >= 0 && !confirm(`Il modello “${models[existing].name}” esiste già. Vuoi sovrascriverlo?`)) return;
      const model = {
        name, zpl:input.zpl, density:input.density, width:input.w, height:input.h, index:input.i,
        tableSnapshot:tableSnapshot || null
      };
      const target = existing >= 0 ? existing : models.length;
      if (existing >= 0) models[existing] = model; else models.push(model);
      await writeModels(models);
      await refreshModels(target);
      setStatus(`Modello “${name}” salvato.`, 'ok');
    } catch (error) {
      setStatus(`Impossibile salvare il modello: ${error && error.message ? error.message : 'errore sconosciuto'}`, 'error');
    }
  }
  async function loadSelectedModel() {
    try {
      const idx = selectedModelIndex();
      const models = await readModels();
      const model = idx >= 0 ? models[idx] : null;
      if (!model || typeof model.zpl !== 'string') throw new Error('Modello non disponibile.');
      source.value = model.zpl;
      dpmm.value = VALID_DPMM.has(String(model.density)) ? String(model.density) : '8';
      width.value = String(model.width ?? 4);
      height.value = String(model.height ?? 6);
      index.value = String(model.index ?? 0);
      tableSnapshot = model.tableSnapshot || null;
      exportExcelButton.disabled = false;
      modelName.value = model.name || '';
      releasePreview();
      setStatus(`Modello “${model.name}” caricato.`, 'ok');
      await render();
    } catch (error) {
      setStatus(`Impossibile caricare il modello: ${error && error.message ? error.message : 'errore sconosciuto'}`, 'error');
    }
  }
  async function deleteSelectedModel() {
    try {
      const idx = selectedModelIndex();
      const models = await readModels();
      const model = idx >= 0 ? models[idx] : null;
      if (!model) throw new Error('Modello non disponibile.');
      if (!confirm(`Eliminare il modello “${model.name}”?`)) return;
      models.splice(idx, 1);
      await writeModels(models);
      await refreshModels(Math.min(idx, models.length - 1));
      setStatus(`Modello “${model.name}” eliminato.`, 'ok');
    } catch (error) {
      setStatus(`Impossibile eliminare il modello: ${error && error.message ? error.message : 'errore sconosciuto'}`, 'error');
    }
  }
  function releasePreview() {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    if (diagnosticImageUrl) URL.revokeObjectURL(diagnosticImageUrl);
    imageUrl = ''; diagnosticImageUrl = ''; duplicatePreviewToken++;
    preview.removeAttribute('src');
    preview.alt = 'Anteprima ZPL';
    previewHeading.textContent = 'Anteprima';
    preview.hidden = true;
    empty.hidden = false;
    downloadButton.disabled = true;
  }
  function dpmmValue() {
    const value = Number(dpmm.value);
    return Number.isFinite(value) && value > 0 ? value : 8;
  }
  function dotsToInches(dots) {
    return Math.max(.1, Number((Number(dots) / (dpmmValue() * 25.4)).toFixed(4)));
  }
  function inferLabelSize(zpl) {
    const text = String(zpl || '');
    const explicitWidth = text.match(/\^PW(\d+)/i);
    const explicitHeight = text.match(/\^LL(\d+)/i);
    if (!explicitWidth && !explicitHeight) return { width:null, height:null, source:'' };
    return {
      width: explicitWidth ? dotsToInches(Number(explicitWidth[1])) : null,
      height: explicitHeight ? dotsToInches(Number(explicitHeight[1])) : null,
      source: 'ZPL'
    };
  }
  function applyInferredLabelSize(zpl) {
    const inferred = inferLabelSize(zpl);
    if (inferred.width) width.value = String(inferred.width);
    if (inferred.height) height.value = String(inferred.height);
    if (!inferred.width && !inferred.height) return false;
    return inferred;
  }

  function fitPreview() {
    if (!previewPanel || preview.hidden) return;
    const w = Number(width.value);
    const h = Number(height.value);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
    const ratio = preview.naturalWidth && preview.naturalHeight
      ? preview.naturalWidth / preview.naturalHeight
      : w / h;
    const maxWidth = Math.max(180, previewPanel.clientWidth - 32);
    const maxHeight = Math.max(280, Math.min(760, window.innerHeight * .68));
    let displayWidth = maxWidth;
    let displayHeight = displayWidth / ratio;
    if (displayHeight > maxHeight) {
      displayHeight = maxHeight;
      displayWidth = displayHeight * ratio;
    }
    preview.style.width = `${Math.round(displayWidth)}px`;
    preview.style.height = `${Math.round(displayHeight)}px`;
    preview.style.aspectRatio = `${w} / ${h}`;
    previewPanel.style.setProperty('--zpl-label-ratio', `${w} / ${h}`);
  }

  function finiteNumber(element, min, max, integer) {
    const value = Number(element.value);
    if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) return null;
    return value;
  }
  function validate() {
    ensureZplEnvelope(false);
    const zpl = source.value.trim();
    if (!zpl) return { error:'Inserisci o importa il codice ZPL.' };
    if (!/^XA/i.test(zpl) && !zpl.toUpperCase().includes('^XA')) return { error:'Il codice deve contenere ^XA.' };
    if (!zpl.toUpperCase().includes('^XZ')) return { error:'Il codice deve contenere ^XZ.' };
    const density = String(dpmm.value);
    const w = finiteNumber(width, .1, 50, false);
    const h = finiteNumber(height, .1, 50, false);
    const i = finiteNumber(index, 0, 999, true);
    if (!VALID_DPMM.has(density)) return { error:'Densità non valida.' };
    if (w === null || h === null) return { error:'Larghezza e altezza devono essere comprese tra 0,1 e 50 pollici.' };
    if (i === null) return { error:'L’indice etichetta deve essere un intero non negativo.' };
    return { zpl, printableZpl:printableZpl(zpl), density, w, h, i };
  }
  async function render() {
    const inferred = applyInferredLabelSize(source.value);
    const input = validate();
    if (input.error) { setStatus(input.error, 'error'); return; }
    releasePreview();
    previewHeading.textContent = 'Anteprima ZPL';
    renderButton.disabled = true;
    setStatus('Generazione anteprima…', '');
    const endpoint = `${API_ROOT}/${input.density}dpmm/labels/${input.w}x${input.h}/${input.i}/`;
    try {
      const response = await fetch(endpoint, {
        method:'POST',
        headers:{ 'Accept':'image/png', 'Content-Type':'application/x-www-form-urlencoded' },
        body:input.printableZpl
      });
      if (!response.ok) {
        const detail = (await response.text()).trim();
        throw new Error(detail || `Errore HTTP ${response.status}`);
      }
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) throw new Error('La risposta non contiene un’immagine valida.');
      imageUrl = URL.createObjectURL(blob);
      preview.src = imageUrl;
      preview.hidden = false;
      empty.hidden = true;
      fitPreview();
      downloadButton.disabled = false;
      setStatus(inferred ? `Anteprima generata · formato ${input.w} × ${input.h} pollici rilevato dal ${inferred.source}.` : 'Anteprima generata.', 'ok');
      if (manualDiagnosticItems.length) await renderDiagnosticGroups([{items:manualDiagnosticItems}]);
      else if (!duplicatePanel.hidden) await renderDiagnosticGroups(checkedDuplicateGroups());
    } catch (error) {
      releasePreview();
      setStatus(`Impossibile generare l’anteprima: ${error && error.message ? error.message : 'errore sconosciuto'}`, 'error');
    } finally {
      renderButton.disabled = false;
    }
  }
  function checkedDuplicateGroups() {
    const groups=duplicateGroups(source.value);
    return Array.from(duplicateList.querySelectorAll('input:checked')).map(input=>groups[Number(input.value)]).filter(Boolean);
  }
  function refreshDuplicatePanel() {
    const groups=duplicateGroups(source.value);
    duplicateList.replaceChildren(); duplicateRemoveButton.disabled=true;
    if(!groups.length) {
      const message=document.createElement('div'); message.className='help'; message.textContent='Nessun campo ZPL completo duplicato trovato.';
      duplicateList.appendChild(message); duplicatePanel.hidden=false; renderDiagnosticGroups([]); return;
    }
    groups.forEach((group,index)=>{
      const label=document.createElement('label'); label.className='zpl-duplicate-item'; label.dataset.group=String(index);
      const checkbox=document.createElement('input'); checkbox.type='checkbox'; checkbox.value=String(index);
      const body=document.createElement('span'), code=document.createElement('code'), count=document.createElement('span'), lines=document.createElement('span');
      code.textContent=group.line; count.className='zpl-duplicate-count'; count.textContent=`${group.items.length} occorrenze · saranno rimosse ${group.items.length-1}`;
      lines.className='zpl-duplicate-line-numbers'; lines.textContent=`Righe: ${group.items.map(item=>item.lineIndexes[0]+1).join(', ')}`;
      body.append(code,count,lines); label.append(checkbox,body); duplicateList.appendChild(label);
      label.addEventListener('mouseenter',()=>{ manualDiagnosticItems=[]; label.classList.add('is-previewed'); selectedTextRange(group.items[0]); renderDiagnosticGroups([group]); });
      label.addEventListener('mouseleave',()=>{ label.classList.remove('is-previewed'); renderDiagnosticGroups(checkedDuplicateGroups()); });
      label.addEventListener('click',()=>{ selectedTextRange(group.items[0]); });
    });
    duplicateList.onchange=()=>{ manualDiagnosticItems=[]; const selected=checkedDuplicateGroups(); duplicateRemoveButton.disabled=!selected.length; renderDiagnosticGroups(selected); };
    duplicatePanel.hidden=false;
  }
  function removeSelectedDuplicates() {
    const groups=duplicateGroups(source.value), selected=new Set(Array.from(duplicateList.querySelectorAll('input:checked'),input=>Number(input.value)));
    const removals=[]; groups.forEach((group,index)=>{ if(selected.has(index)) removals.push(...group.items.slice(1)); });
    if(!removals.length) return;
    let text=source.value;
    for(const item of removals.sort((a,b)=>b.start-a.start)) text=text.slice(0,item.start)+text.slice((item.end || item.start+item.text.length)+1);
    source.value=text.replace(/\n{3,}/g,'\n\n').trim(); rememberSelection(); releasePreview(); refreshDuplicatePanel();
    setStatus(`Rimossi ${removals.length} campi ZPL duplicati. L’export userà il codice ora visibile.`, 'ok');
  }
  highlightFieldButton.addEventListener('mousedown', rememberSelection);
  highlightFieldButton.addEventListener('click',async()=>{
    const items=selectedVisibleBlocks(source.value,lastSelectionStart,lastSelectionEnd);
    if(!items.length) {
      manualDiagnosticItems=[];
      await renderDiagnosticGroups([]);
      setStatus('Posiziona il cursore o seleziona testo dentro un campo compreso tra ^FO/^FT e ^FS.', 'error');
      source.focus();
      return;
    }
    manualDiagnosticItems=items;
    selectedTextRange(items[0]);
    if(!imageUrl) await render();
    else await renderDiagnosticGroups([{items}]);
    setStatus(items.length===1 ? 'Campo ZPL completo evidenziato in rosso solo nell’anteprima.' : `${items.length} campi ZPL completi evidenziati in rosso solo nell’anteprima.`, 'ok');
  });
  duplicatesButton.addEventListener('click',async()=>{ refreshDuplicatePanel(); if(!imageUrl) await render(); });
  duplicateCloseButton.addEventListener('click',()=>{ duplicatePanel.hidden=true; renderDiagnosticGroups(manualDiagnosticItems.length ? [{items:manualDiagnosticItems}] : []); });
  duplicateRemoveButton.addEventListener('click',removeSelectedDuplicates);
  file.addEventListener('change', async () => {
    const selected = file.files && file.files[0];
    if (!selected) return;
    try {
      source.value = await selected.text();
      applyInferredLabelSize(source.value);
      tableSnapshot = null;
      exportExcelButton.disabled = false;
      modelName.value = selected.name.replace(/\.(?:zpl|txt)$/i, '');
      setStatus(`Caricato ${selected.name}.`, 'ok');
    } catch (_) { setStatus('Impossibile leggere il file selezionato.', 'error'); }
    finally { file.value = ''; }
  });
  renderButton.addEventListener('click', render);
  ensureEnvelopeButton.addEventListener('click', () => { ensureZplEnvelope(true); source.focus(); });
  insertCenteredButton.addEventListener('mousedown', captureInsertionSelection);
  insertCenteredButton.addEventListener('click', () => { insertAtRememberedCursor(centeredTextSnippet()); setStatus('Sintassi per testo centrato inserita. La larghezza ^FB usa la larghezza dell’etichetta.', 'ok'); });
  barcodeInsertButton.addEventListener('mousedown', captureInsertionSelection);
  barcodeInsertButton.addEventListener('click', () => { const values=barcodeValues(); if(values.error){ barcodeStatus.textContent=values.error; return; } insertAtRememberedCursor(barcodeSnippet(values)); barcodeStatus.textContent='Codice a barre inserito nello ZPL.'; });
  barcodePreviewButton.addEventListener('click', previewBarcode);
  modelList.addEventListener('change', updateModelButtons);
  modelSaveButton.addEventListener('click', saveModel);
  modelLoadButton.addEventListener('click', loadSelectedModel);
  modelDeleteButton.addEventListener('click', deleteSelectedModel);
  printerList.addEventListener('change', () => { printPrepareButton.disabled = !printerList.value; });
  printerRefreshButton.addEventListener('click', acquirePrinters);
  printPrepareButton.addEventListener('click', preparePrint);
  width.addEventListener('input', fitPreview);
  height.addEventListener('input', fitPreview);
  preview.addEventListener('load', fitPreview);
  window.addEventListener('resize', fitPreview);
  ['keyup','mouseup','select','focus','blur'].forEach(name => source.addEventListener(name, rememberSelection));
  source.addEventListener('blur', () => ensureZplEnvelope(false));
  source.addEventListener('input', () => {
    manualDiagnosticItems=[];
    if (applyInferredLabelSize(source.value)) fitPreview();
    if (!duplicatePanel.hidden) refreshDuplicatePanel();
  });
  dpmm.addEventListener('change', () => {
    if (applyInferredLabelSize(source.value)) fitPreview();
  });
  source.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); render(); }
  });
  exampleButton.addEventListener('click', () => {
    source.value = '^XA\n^PW812\n^LL1218\n^CF0,50\n^FO40,40^FDBC_tools ZPL Viewer^FS\n^BY3\n^FO40,120^BCN,100,Y,N,N^FD1234567890^FS\n^XZ';
    tableSnapshot = null;
    exportExcelButton.disabled = false;
    setStatus('Esempio caricato. Premi Genera anteprima.', '');
  });
  clearButton.addEventListener('click', () => { manualDiagnosticItems=[]; source.value=''; modelName.value=''; tableSnapshot=null; exportExcelButton.disabled=false; releasePreview(); barcodeStatus.textContent=''; setStatus('', ''); source.focus(); });
  exportExcelButton.addEventListener('click', () => {
    try {
      const exported=tableSnapshot ? buildExportRows(tableSnapshot,source.value) : buildNewExportRows(source.value);
      const bytes=workbookBytes(exported.headers,exported.rows,tableSnapshot && tableSnapshot.sheetName);
      downloadBlob(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'Riga etichetta stampa Layout_modificato.xlsx');
      setStatus(`Excel esportato con ${exported.rows.length} righe e ${exported.headers.length} colonne.`, 'ok');
    } catch(error) {
      setStatus(`Impossibile esportare Excel: ${error && error.message ? error.message : 'errore sconosciuto'}`, 'error');
    }
  });
  downloadButton.addEventListener('click', () => {
    if (!imageUrl) return;
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `zpl-label-${Date.now()}.png`;
    link.click();
  });
  async function loadPendingZpl() {
    try {
      const data = await new Promise(resolve => chrome.storage.local.get({bcToolsPendingZpl:null}, resolve));
      const pending = data && data.bcToolsPendingZpl;
      const token = new URL(location.href).searchParams.get('bcToolsContext');
      const handoffKey = token ? `bcToolsZplSourceContext:${token}` : '';
      const session = handoffKey ? await chrome.storage.session.get({[handoffKey]:''}) : {};
      sourceContextUrl = pending && handoffKey && typeof session[handoffKey] === 'string' ? session[handoffKey] : '';
      if(handoffKey) await chrome.storage.session.remove(handoffKey);
      if (!pending || typeof pending.zpl !== 'string') return;
      await new Promise(resolve => chrome.storage.local.remove('bcToolsPendingZpl', resolve));
      source.value = pending.zpl;
      tableSnapshot = pending.tableSnapshot || null;
      exportExcelButton.disabled = false;
      setStatus(`Letto automaticamente dalla pagina ${pending.pageId || 'Business Central'} (${pending.rowsRead || 0} righe).`, 'ok');
      await render();
    } catch (_) {
      setStatus('Impossibile caricare lo ZPL letto dalla pagina.', 'error');
    }
  }
  refreshModels().catch(() => setStatus('Impossibile leggere i modelli salvati.', 'error'));
  refreshPrinterList().catch(() => setStatus('Impossibile leggere le stampanti salvate.', 'error'));
  loadPendingZpl();
  window.addEventListener('pagehide', () => {
    releasePreview();
  }, { once:true });
})();
