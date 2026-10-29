const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const output = process.env.BC_TOOLS_UI_OUTPUT || path.join(os.tmpdir(), 'bc-tools-ui-restyle');
const categories = ['ui', 'filtri', 'tabelle', 'zpl', 'iofile', 'rdlc'];
const reportFixture = '<?xml version="1.0"?><Report xmlns="http://schemas.microsoft.com/sqlserver/reporting/2008/01/reportdefinition"><DataSources><DataSource Name="Source"><ConnectionProperties><DataProvider>SQL</DataProvider><ConnectString /></ConnectionProperties></DataSource></DataSources><DataSets><DataSet Name="Items"><Query><DataSourceName>Source</DataSourceName><CommandText /></Query><Fields><Field Name="Number"><DataField>Number</DataField></Field><Field Name="Description"><DataField>Description</DataField></Field></Fields></DataSet></DataSets><Body><ReportItems><Textbox Name="ItemNumber"><Top>0.5cm</Top><Left>0.5cm</Left><Height>1cm</Height><Width>7cm</Width><Paragraphs><Paragraph><TextRuns><TextRun><Value>=First(Fields!Number.Value, "Items")</Value></TextRun></TextRuns></Paragraph></Paragraphs></Textbox></ReportItems><Height>4cm</Height></Body><Width>10cm</Width><Page><PageHeight>29.7cm</PageHeight><PageWidth>21cm</PageWidth><LeftMargin>1cm</LeftMargin><RightMargin>1cm</RightMargin><TopMargin>1cm</TopMargin><BottomMargin>1cm</BottomMargin></Page></Report>';
const filters = [
  { label: 'Clienti', page: '22', field: 'No.', astLeft: false, astRight: true },
  { label: 'Articoli', page: '31', field: 'No.', astLeft: true, astRight: true },
  { label: 'Ordini di produzione rilasciati', page: '99000831', field: 'No.' },
  { label: 'Solo menu contestuale', page: '42', field: 'No.', hideInPopup: true }
];

async function ready(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
  });
}

async function assertLayout(page, label) {
  await ready(page);
  const problems = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const controls = [...document.querySelectorAll('button,input,select,textarea,img,h1,.title,.settings-card-title')];
    return controls.filter(element => {
      if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
      if (element.closest('#rdlcPreviewCanvas')) return false;
      const bounds = element.getBoundingClientRect();
      return bounds.width > 0 && (bounds.left < -1 || bounds.right > width + 1);
    }).map(element => element.id || element.className || element.tagName);
  });
  assert.deepEqual(problems, [], `${label}: controls must fit the viewport`);
  const pageWidth = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
  }));
  assert.ok(pageWidth.content <= pageWidth.viewport + 1, `${label}: page must not overflow horizontally (${JSON.stringify(pageWidth)})`);
  const brokenImages = await page.locator('img').evaluateAll(images => images
    .filter(image => image.checkVisibility() && (!image.complete || image.naturalWidth === 0))
    .map(image => image.getAttribute('src')));
  assert.deepEqual(brokenImages, [], `${label}: images must load`);
}

async function capture(page, name) {
  await assertLayout(page, name);
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
}

async function verifyStorageRestart(extensionRoot) {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'bc-tools-restart-profile-'));
  let context = null;
  const launch = () => chromium.launchPersistentContext(profile, {
    executablePath: chromium.executablePath(),
    headless: true,
    args: [`--disable-extensions-except=${extensionRoot}`, `--load-extension=${extensionRoot}`]
  });
  const extensionWorker = async () => {
    let workers = context.serviceWorkers();
    if (!workers.length) {
      await context.waitForEvent('serviceworker');
      workers = context.serviceWorkers();
    }
    for (const worker of workers) {
      if ((await worker.evaluate(() => chrome.runtime.getManifest())).name === 'BC_tools') return worker;
    }
    throw new Error('BC_tools service worker must be loaded after extension restart');
  };
  try {
    context = await launch();
    let worker = await extensionWorker();
    await worker.evaluate(async () => {
      await chrome.storage.sync.set({ pageFieldCopyGlobalPreferences:false });
      await chrome.storage.local.set({
        bcToolsHiddenCopyFields:['copy-f6'],
        bcToolsShownCopyFieldsGlobal:['copy-g7']
      });
    });
    await context.close();
    context = null;
    context = await launch();
    worker = await extensionWorker();
    const stored = await worker.evaluate(async () => ({
      settings:await chrome.storage.sync.get('pageFieldCopyGlobalPreferences'),
      visibility:await chrome.storage.local.get(['bcToolsHiddenCopyFields','bcToolsShownCopyFieldsGlobal'])
    }));
    assert.equal(stored.settings.pageFieldCopyGlobalPreferences, false, 'scope flag survives extension restart');
    assert.deepEqual(stored.visibility.bcToolsHiddenCopyFields, ['copy-f6']);
    assert.deepEqual(stored.visibility.bcToolsShownCopyFieldsGlobal, ['copy-g7']);
  } finally {
    if (context) await context.close();
    await fs.rm(profile, { recursive:true, force:true, maxRetries:3 });
  }
}

async function inspect(extensionRoot, baseline = false) {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'bc-tools-ui-profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: chromium.executablePath(),
    headless: true,
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
    args: [`--disable-extensions-except=${extensionRoot}`, `--load-extension=${extensionRoot}`]
  });
  const errors = [];
  const signatures = {};
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  try {
    let workers = context.serviceWorkers();
    if (!workers.length) {
      await context.waitForEvent('serviceworker');
      workers = context.serviceWorkers();
    }
    let worker = null;
    for (const candidate of workers) {
      const manifest = await candidate.evaluate(() => chrome.runtime.getManifest());
      const popupMarkup = await candidate.evaluate(async () => {
        const response = await fetch(chrome.runtime.getURL('src/popup/popup.html'));
        return response.ok ? response.text() : '';
      });
      const hasDualStyleLinks = popupMarkup.includes('id="modernStyle"') && popupMarkup.includes('id="classicStyle"');
      if (manifest && manifest.name === 'BC_tools' && (baseline || hasDualStyleLinks)) {
        worker = candidate;
        break;
      }
    }
    assert.ok(worker, 'BC_tools service worker must be loaded');
    const extensionId = new URL(worker.url()).hostname;
    const extensionUrl = `chrome-extension://${extensionId}`;
    await worker.evaluate(async data => {
      await chrome.storage.sync.set({
        quickFilters: data.filters, quickTables: [{ label: 'Articoli', table: '27' }],
        uiTheme: 'light', visualStyle: 'modern', popupLayout: 'a', includedPages: '22, 31',
        includedPageNames: { '22': 'Clienti', '31': 'Articoli' },
        autoSortFirstColumn: true, enableTableExport: true,
        saldoArticoloMovimentiWarehouse: true,
        autoShowMore: false, autoWide: false, layoutMode: 'wide',
        forceFactbox: false, factboxMode: 'closed'
      });
      await chrome.storage.local.set({ bcToolsQuickGuideSeen: true, bcToolsRecommendedPresetDecision: 'ignored' });
    }, { filters });
    const page = await context.newPage();
    const optionsUrl = `${extensionUrl}/src/options/index.html`;
    await page.goto(optionsUrl);
    await page.locator('.settings-card').last().waitFor();
    assert.equal(await page.locator('.settings-card').count(), 6);
    if (!baseline) {
      await capture(page, 'settings-light');
      assert.equal(await page.locator('#settingsVisualStyle').count(), 1);
      assert.equal(await page.locator('#settingsVisualStyle').isVisible(), false, 'style selector is hidden outside customization');
      await page.locator('#quickGuideButton').click();
      await page.locator('#quickGuideCustomize').click();
      await page.locator('#settingsVisualStyle').waitFor({ state: 'visible' });
      for (const style of ['classic', 'modern']) {
        await page.locator('#settingsVisualStyle').selectOption(style);
        await page.waitForFunction(async style => (await chrome.storage.sync.get('visualStyle')).visualStyle === style, style);
        const enabledStyles = await page.evaluate(() => ({
          modern: !document.getElementById('modernStyle').disabled,
          classic: !document.getElementById('classicStyle').disabled
        }));
        assert.deepEqual(enabledStyles, { modern: style === 'modern', classic: style === 'classic' });
        if (style === 'classic') await capture(page, 'settings-classic');
      }
      await page.keyboard.press('Escape');
      await page.locator('#settingsVisualStyle').waitFor({ state: 'hidden' });
      await page.locator('#quickGuideButton').click();
      await page.locator('#quickGuideCustomize').click();
      await page.locator('#settingsVisualStyle').waitFor({ state: 'visible' });
      await page.locator('#settingsVisualStyle').selectOption('classic');
      await page.waitForFunction(async () => (await chrome.storage.sync.get('visualStyle')).visualStyle === 'classic');
      await page.reload();
      await page.waitForFunction(() => document.getElementById('classicStyle') && !document.getElementById('classicStyle').disabled);
      assert.equal(await page.locator('#settingsVisualStyle').isVisible(), false);
      await page.locator('#quickGuideButton').click();
      await page.locator('#quickGuideCustomize').click();
      await page.locator('#settingsVisualStyle').waitFor({ state: 'visible' });
      await page.locator('#settingsVisualStyle').selectOption('modern');
      await page.waitForFunction(async () => (await chrome.storage.sync.get('visualStyle')).visualStyle === 'modern');
      await page.keyboard.press('Escape');
      await page.locator('#settingsSearch').fill('RDLC');
      assert.equal(await page.locator('.settings-card:visible').count(), 1);
      await page.locator('#settingsSearch').fill('');
      await page.locator('[data-target="ui"]').click();
      await page.locator('section[data-box="ui"]').waitFor();
      await page.locator('#hdrToggle').waitFor({ state: 'attached' });
      assert.equal(await page.locator('#autoWide').isChecked(), false);
      assert.equal(await page.locator('#layoutMode').inputValue(), 'wide');
      assert.equal(await page.locator('#forceFactbox').isChecked(), false);
      assert.equal(await page.locator('#factboxMode').inputValue(), 'closed');
      const layoutModeRow = page.locator('.bc-ui-feature-layout .bc-ui-mode-row');
      assert.equal((await layoutModeRow.locator('label').innerText()).trim(), 'Layout pagina');
      assert.equal(await layoutModeRow.locator('.info-tooltip').count(), 1);
      assert.equal(await layoutModeRow.locator(':scope > :last-child').getAttribute('class'), 'info-tooltip');
      const factboxModeRow = page.locator('.bc-ui-feature-factbox .bc-ui-mode-row');
      assert.equal(await factboxModeRow.locator('.info-tooltip').count(), 1);
      assert.equal(await factboxModeRow.locator(':scope > :last-child').getAttribute('class'), 'info-tooltip');
      assert.equal(await page.locator('#autoShowMore').isChecked(), false);
      assert.equal(await page.locator('#pageFieldCopyGlobalPreferences').isChecked(), true, 'global page preferences default to enabled');
      assert.equal(await page.locator('#pageFieldCopyGlobalPreferences').evaluate(input => input.labels.length), 1, 'scope checkbox remains natively label-accessible');
      await page.locator('#pageFieldCopyGlobalPreferences').uncheck();
      await page.waitForFunction(async () => {
        const settings = await chrome.storage.sync.get('pageFieldCopyGlobalPreferences');
        const { bcToolsUiSettings = {} } = await chrome.storage.local.get('bcToolsUiSettings');
        return settings.pageFieldCopyGlobalPreferences === false && bcToolsUiSettings.pageFieldCopyGlobalPreferences === false;
      });
      await page.locator('#savedBadge.show').waitFor();
      await page.reload();
      await page.locator('section[data-box="ui"]').waitFor();
      assert.equal(await page.locator('#pageFieldCopyGlobalPreferences').isChecked(), false, 'scope setting survives options reload');
      await page.locator('#pageFieldCopyGlobalPreferences').check();
      await page.waitForFunction(async () => (await chrome.storage.sync.get('pageFieldCopyGlobalPreferences')).pageFieldCopyGlobalPreferences === true);
      await page.locator('#savedBadge.show').waitFor();
      const copyVisibilityKeys = ['bcToolsHiddenCopyFields','bcToolsShownCopyFields','bcToolsHiddenCopyFieldsGlobal','bcToolsShownCopyFieldsGlobal'];
      await worker.evaluate(keys => chrome.storage.local.set({
        [keys[0]]:['copy-reset-context-hidden'], [keys[1]]:['copy-reset-context-shown'],
        [keys[2]]:['copy-reset-global-hidden'], [keys[3]]:['copy-reset-global-shown']
      }), copyVisibilityKeys);
      await page.locator('#restoreHiddenCopyButtons').click();
      await page.waitForFunction(async keys => {
        const values = await chrome.storage.local.get(keys);
        return keys.every(key => !Object.prototype.hasOwnProperty.call(values, key));
      }, copyVisibilityKeys);
      await page.waitForFunction(() => document.getElementById('restoreHiddenCopyButtonsStatus').textContent.includes('contestuali e globali'));
      await page.locator('#autoWide').check();
      await page.locator('#layoutMode').selectOption('normal');
      await page.locator('#forceFactbox').check();
      await page.locator('#factboxMode').selectOption('open');
      await page.locator('#autoShowMore').check();
      await page.waitForFunction(async () => {
        const settings = await chrome.storage.sync.get(['autoWide','layoutMode','forceFactbox','factboxMode','autoShowMore']);
        const { bcToolsUiSettings = {} } = await chrome.storage.local.get('bcToolsUiSettings');
        return settings.autoWide === true && settings.layoutMode === 'normal'
          && settings.forceFactbox === true && settings.factboxMode === 'open'
          && settings.autoShowMore === true
          && bcToolsUiSettings.autoWide === true && bcToolsUiSettings.layoutMode === 'normal'
          && bcToolsUiSettings.forceFactbox === true && bcToolsUiSettings.factboxMode === 'open'
          && bcToolsUiSettings.autoShowMore === true;
      });
      await page.locator('#savedBadge.show').waitFor();
      await page.reload();
      await page.locator('#autoWide').waitFor();
      await page.locator('section[data-box="ui"]').waitFor();
      assert.equal(await page.locator('#autoWide').isChecked(), true);
      assert.equal(await page.locator('#layoutMode').inputValue(), 'normal');
      assert.equal(await page.locator('#forceFactbox').isChecked(), true);
      assert.equal(await page.locator('#factboxMode').inputValue(), 'open');
      assert.equal(await page.locator('#autoShowMore').isChecked(), true);
      await page.locator('#hideNotificationsButton').check();
      await page.waitForFunction(async () => (await chrome.storage.sync.get('hideNotificationsButton')).hideNotificationsButton === true);
      await page.locator('#savedBadge.show').waitFor();
      await page.reload();
      await page.locator('#hideNotificationsButton:checked').waitFor();
      await page.locator('.back-button').click();
      await page.locator('#settingsDashboard').waitFor();
      await page.keyboard.press('2');
      await page.locator('section[data-box="filtri"]').waitFor();
      await page.keyboard.press('Escape');
      await page.locator('#settingsDashboard').waitFor();
    }
    for (const theme of ['light', 'dark']) {
      await worker.evaluate(theme => chrome.storage.sync.set({ uiTheme: theme }), theme);
      for (const category of categories) {
        await page.goto(`${optionsUrl}#${category}`);
        await page.reload();
        await page.locator(`section[data-box="${category}"]`).waitFor();
        await page.locator('#hdrToggle').waitFor({ state: 'attached' });
        await ready(page);
        if (theme === 'light') {
          signatures[category] = await page.locator(`section[data-box="${category}"]`).evaluate(section =>
            [...section.querySelectorAll('[id]')].filter(element => element.id !== 'pageFieldCopyGlobalPreferences')
              .map(element => `${element.tagName}:${element.id}:${element.type || ''}`).sort());
        }
        if (!baseline) {
          if (category === 'rdlc') {
            await page.locator('#rdlcFile').setInputFiles({ name: 'fixture.rdlc', mimeType: 'application/xml', buffer: Buffer.from(reportFixture) });
            await page.locator('#rdlcWorkspace').waitFor();
            await page.locator('.rdlc-outline-item').first().waitFor();
            await page.locator('#rdlcValidate').click();
            assert.equal(await page.locator('#rdlcSave').isEnabled(), true);
          }
          if (category === 'zpl') {
            await page.locator('#zplSource').fill('^XA^FO30,30^A0N,40,40^FDBC_tools fixture^FS^XZ');
            await page.locator('#zplModelName').fill(`Fixture ${theme}`);
            await page.locator('#zplModelSave').click();
            await page.waitForFunction(async () => (await chrome.storage.local.get('bcToolsZplModels')).bcToolsZplModels?.length > 0);
          }
          for (const width of [1440, 1024, 390]) {
            await page.setViewportSize({ width, height: 900 });
            await assertLayout(page, `${category}-${theme}-${width}`);
            if (category === 'filtri' && width === 390) {
              await page.locator('.filters-flag-help .info-tooltip').nth(1).click();
              await assertLayout(page, `tooltip-${theme}-${width}`);
              await page.keyboard.press('Escape');
            }
          }
          await page.setViewportSize({ width: 1440, height: 900 });
          await capture(page, `settings-${category}-${theme}`);
        }
      }
    }
    if (!baseline) {
      await worker.evaluate(() => chrome.storage.sync.set({ uiTheme: 'light' }));
      await page.goto(`${optionsUrl}#filtri`);
      await page.reload();
      const row = page.locator('.filters-row[data-placeholder="1"]').last();
      await row.locator('.f-label').fill('Filtro prova');
      await row.locator('.f-page').fill('42');
      await row.locator('.f-field').fill('No.');
      await page.waitForFunction(async () => (await chrome.storage.sync.get('quickFilters')).quickFilters.some(item => item.label === 'Filtro prova'));
      await page.goto(optionsUrl);
      await page.locator('#quickGuideButton').click();
      await page.locator('#quickGuideManual').click();
      await page.locator('#quickGuideManualDialog[open]').waitFor();
      await page.locator('#quickGuideManualContent h1').waitFor();
      await capture(page, 'manual-light');
      await page.locator('#quickGuideManualClose').click();
      await page.locator('#quickGuideManualDialog').waitFor({ state: 'hidden' });
      await page.goto(`${optionsUrl}#iofile`);
      await page.reload();
      await page.locator('#hdrToggle').waitFor({ state: 'attached' });
      await page.locator('#recommendedPresetOpen').click();
      await page.locator('#recommendedPresetDialog[open]').waitFor();
      await capture(page, 'preset-light');
      await page.locator('#recommendedPresetClose').click();
      await page.locator('#recommendedPresetDialog').waitFor({ state: 'hidden' });
      const copyVisibility = {
        bcToolsHiddenCopyFields:['copy-a1'],
        bcToolsShownCopyFields:['copy-b2'],
        bcToolsHiddenCopyFieldsGlobal:['copy-c3'],
        bcToolsShownCopyFieldsGlobal:['copy-d4']
      };
      await worker.evaluate(value => chrome.storage.local.set(value), copyVisibility);
      const downloadPromise = page.waitForEvent('download');
      await page.locator('#exportBtn').click();
      const download = await downloadPromise;
      const exported = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
      for (const [key, value] of Object.entries(copyVisibility)) assert.deepEqual(exported[key], value, `${key} must be exported`);
      assert.equal(exported.pageFieldCopyGlobalPreferences, true);

      const importData = {
        _app:'BC_tools', _type:'settings', _version:4,
        pageFieldCopyGlobalPreferences:false,
        bcToolsHiddenCopyFields:['copy-e5']
      };
      const importDialogPromise = page.waitForEvent('dialog');
      await page.locator('#importFile').setInputFiles({
        name:'copy-preferences.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(importData))
      });
      const importDialog = await importDialogPromise;
      assert.match(importDialog.message(), /Preferenze contestuali Mostra\/Nascondi/);
      assert.match(importDialog.message(), /Preferenze globali Mostra\/Nascondi: —/);
      const importedReload = page.waitForNavigation({ waitUntil:'domcontentloaded' });
      await importDialog.accept();
      await importedReload;
      await page.waitForFunction(async expected => {
        const settings = await chrome.storage.sync.get('pageFieldCopyGlobalPreferences');
        const local = await chrome.storage.local.get([
          'bcToolsHiddenCopyFields','bcToolsShownCopyFields','bcToolsHiddenCopyFieldsGlobal','bcToolsShownCopyFieldsGlobal'
        ]);
        return settings.pageFieldCopyGlobalPreferences === false
          && JSON.stringify(local.bcToolsHiddenCopyFields) === JSON.stringify(expected.imported)
          && JSON.stringify(local.bcToolsShownCopyFields) === JSON.stringify(expected.contextShown)
          && JSON.stringify(local.bcToolsHiddenCopyFieldsGlobal) === JSON.stringify(expected.globalHidden)
          && JSON.stringify(local.bcToolsShownCopyFieldsGlobal) === JSON.stringify(expected.globalShown);
      }, {
        imported:importData.bcToolsHiddenCopyFields,
        contextShown:copyVisibility.bcToolsShownCopyFields,
        globalHidden:copyVisibility.bcToolsHiddenCopyFieldsGlobal,
        globalShown:copyVisibility.bcToolsShownCopyFieldsGlobal
      });
      await page.goto(`${optionsUrl}#ui`);
      await page.waitForFunction(() => document.getElementById('pageFieldCopyGlobalPreferences')?.checked === false);
      assert.equal(await page.locator('#pageFieldCopyGlobalPreferences').isChecked(), false, 'imported scope setting is restored in options');
      await worker.evaluate(filters => chrome.storage.sync.set({ quickFilters: filters }), filters);
    }

    await context.route('https://businesscentral.dynamics.com/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><title>Fixture BC</title></head><body></body></html>' }));
    const bcPage = await context.newPage();
    await bcPage.goto('https://businesscentral.dynamics.com/test-tenant/test-environment/?company=Fixture&page=22');
    const bcTabId = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://businesscentral.dynamics.com/*' }))[0].id);
    const popup = await context.newPage();
    const popupUrl = `${extensionUrl}/src/popup/popup.html`;
    for (const style of ['modern', 'classic']) {
      for (const layout of ['a', 'vertical']) {
        for (const theme of ['light', 'dark']) {
        await worker.evaluate(async ({ layout, theme, visualStyle, bcTabId }) => {
          await chrome.storage.sync.set({ popupLayout: layout, uiTheme: theme, visualStyle });
          await chrome.tabs.update(bcTabId, { active: true });
        }, { layout, theme, visualStyle: style, bcTabId });
        await popup.setViewportSize({ width: 560, height: 600 });
        await popup.goto(popupUrl);
        await popup.locator('#tableId').waitFor();
        if (!baseline) {
          const popupStyles = await popup.evaluate(() => ({
            modern: !!document.getElementById('modernStyle'),
            classic: !!document.getElementById('classicStyle')
          }));
          assert.deepEqual([popupStyles.modern, popupStyles.classic], [true, true], `popup style links missing: ${JSON.stringify(popupStyles)}`);
        }
        assert.equal(await popup.locator('.tile.qf').count(), 3);
        if (!baseline) {
          assert.deepEqual(await popup.evaluate(() => ({
            modern: !document.getElementById('modernStyle').disabled,
            classic: !document.getElementById('classicStyle').disabled
          })), { modern: style === 'modern', classic: style === 'classic' });
        }
        if (!baseline) {
          await capture(popup, `popup-${style}-${layout}-${theme}`);
          await popup.locator('#openSavedTables').click();
          await popup.locator('#tablesModal.show').waitFor();
          await assertLayout(popup, 'tables-dialog');
          await popup.locator('#tablesClose').click();
          const before = await context.pages().length;
          await popup.locator('#tableId').fill('27');
          const opened = context.waitForEvent('page');
          await popup.locator('#tableId').press('Enter');
          const table = await opened;
          await table.waitForURL(/table=27/);
          assert.ok(context.pages().length > before);
          await table.close();
        }
        }
      }
    }
    if (!baseline) {
      for (const count of [0, 1, 15]) {
        await worker.evaluate(async ({ count, bcTabId }) => {
          await chrome.storage.sync.set({ popupLayout: 'a', quickFilters: Array.from({ length: count }, (_, index) => ({
            label: `Ricerca con etichetta particolarmente lunga ${index + 1}`, page: '22', field: 'No.'
          })) });
          await chrome.tabs.update(bcTabId, { active: true });
        }, { count, bcTabId });
        await popup.goto(popupUrl);
        await popup.locator('#tableId').waitFor();
        assert.equal(await popup.locator('.tile.qf').count(), count);
        await capture(popup, `popup-filters-${count}`);
      }
    }
    assert.deepEqual(errors, [], 'extension pages must not raise uncaught JavaScript errors');
    return signatures;
  } finally {
    await context.close();
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 3 });
  }
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const current = await inspect(root);
  await verifyStorageRestart(root);
  if (process.env.BC_TOOLS_BASELINE) {
    const baseline = await inspect(path.resolve(process.env.BC_TOOLS_BASELINE), true);
    assert.deepEqual(current, baseline, 'all existing section IDs and control types must be preserved');
    console.log('Baseline DOM contracts preserved across all six settings sections.');
  }
  console.log(`UI checks passed: themes, layouts, six sections, 3 viewports, copy preference scopes, reset/import/export/restart, storage, navigation, dialogs and table opening. Screenshots: ${output}`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});