// settings.js — persistenza impostazioni background
(function(){
  'use strict';
  const UI_BACKUP_KEY = 'bcToolsUiSettings';
  const SETTINGS_KEYS = new Set([
    'saldoArticoloMovimentiWarehouse',
    'visualStyle',
    'hideNotificationsButton','showValuesInMonospace',
    'showHyphensInColumnCaptions','highlightStatusRows','autoOpenHomeSearch','showPageFieldCopyButton','pageFieldCopyEnabled','pageFieldCopyClickable','pageFieldCopyFlowField','pageFieldCopyMode','pageFieldCopyGlobalPreferences','showCreatedDocumentButton','enableTableExport','autoShowMore','autoSortFirstColumn','sortDirection','autoWide','layoutMode','forceFactbox','factboxMode','uiTheme','popupLayout','includedPages',
    'optionsLayout','quickFilters','quickTables','includedPageNames'
  ]);
  const UI_SETTINGS_KEYS = new Set([
    'visualStyle',
    'hideNotificationsButton','showValuesInMonospace','showHyphensInColumnCaptions','highlightStatusRows','autoOpenHomeSearch','showPageFieldCopyButton','pageFieldCopyEnabled','pageFieldCopyClickable','pageFieldCopyFlowField','pageFieldCopyMode','pageFieldCopyGlobalPreferences','showCreatedDocumentButton','enableTableExport',
    'autoShowMore','autoSortFirstColumn','sortDirection','autoWide','layoutMode','forceFactbox','factboxMode','uiTheme','popupLayout'
  ]);
  function partitionSettings(payload) {
    const settings = {};
    const uiSettings = {};
    if (!payload || typeof payload !== 'object') return { settings, uiSettings };
    for (const [key, value] of Object.entries(payload)) {
      if (SETTINGS_KEYS.has(key)) settings[key] = value;
      if (UI_SETTINGS_KEYS.has(key)) uiSettings[key] = value;
    }
    return { settings, uiSettings };
  }
  function initBackgroundSettingsSaver() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || message.type !== 'BC_TOOLS_SAVE_SETTINGS') return;
      (async () => {
        const payload = message && message.payload ? message.payload : null;
        const { settings, uiSettings } = partitionSettings(payload);
        await chrome.storage.sync.set(settings);
        await chrome.storage.local.set({ [UI_BACKUP_KEY]: uiSettings });
        sendResponse({ ok: true });
      })().catch(err => {
        sendResponse({ ok: false, error: err && err.message ? err.message : 'Errore salvataggio' });
      });
      return true;
    });
  }
  self.bcToolsBackgroundSettings = { initBackgroundSettingsSaver };
})();
