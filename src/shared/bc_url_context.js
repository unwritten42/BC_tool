// bc_url_context.js - validated Business Central source context and URL builder.
(function (root) {
  'use strict';

  const BUSINESS_CENTRAL_ORIGIN = 'https://businesscentral.dynamics.com';

  function contextError(cause) {
    const error = new Error(cause);
    error.code = cause;
    return error;
  }

  function parse(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (_) {
      throw contextError('invalid-url');
    }
    const path = parsed.pathname.split('/').filter(Boolean);
    if (parsed.origin !== BUSINESS_CENTRAL_ORIGIN || parsed.username || parsed.password || path.length < 2) {
      throw contextError('invalid-business-central-context');
    }
    return parsed;
  }

  async function resolveTab(source) {
    if (typeof source === 'string') return { tab:null, url:parse(source) };
    if (source && typeof source.url === 'string') return { tab:source, url:parse(source.url) };
    if (source) throw contextError('context-unavailable');

    let tabs;
    try {
      tabs = await new Promise((resolveTabs, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, result => {
          const error = chrome.runtime.lastError;
          if (error) reject(error);
          else resolveTabs(result);
        });
      });
    } catch (_) {
      throw contextError('context-unavailable');
    }
    if (!tabs || !tabs[0] || typeof tabs[0].url !== 'string') {
      throw contextError('context-unavailable');
    }
    return { tab:tabs[0], url:parse(tabs[0].url) };
  }

  async function resolve(source) {
    return (await resolveTab(source)).url;
  }

  function sourceFromSender(sender) {
    if (sender && sender.tab && typeof sender.tab.url === 'string') return sender.tab;
    return sender && (sender.url || sender.tab);
  }

  function build(context, { set = {}, remove = [], hash } = {}) {
    const url = parse(context instanceof URL ? context.href : String(context || ''));
    for (const key of remove) url.searchParams.delete(key);
    for (const [key, value] of Object.entries(set)) {
      if (value === null || value === undefined) url.searchParams.delete(key);
      else url.searchParams.set(key, String(value));
    }
    if (hash !== undefined) url.hash = hash;
    const href = url.href;
    const hashIndex = href.indexOf('#');
    const beforeHash = hashIndex < 0 ? href : href.slice(0, hashIndex);
    const queryIndex = beforeHash.indexOf('?');
    if (queryIndex < 0) return href;
    const hashPart = hashIndex < 0 ? '' : href.slice(hashIndex);
    return `${beforeHash.slice(0, queryIndex)}${beforeHash.slice(queryIndex).replace(/\+/g, '%20')}${hashPart}`;
  }

  function reportError(component, error) {
    try {
      const message = {
        type: 'BC_TOOLS_DIAGNOSTIC_APPEND',
        component: 'url-context',
        entry: {
          event: 'context-resolution-failed',
          details: {
            component: String(component || 'unknown').slice(0, 50),
            cause: String(error && error.code || 'context-unavailable').slice(0, 60)
          }
        }
      };
      if (root.bcToolsBackgroundDiagnostics && root.bcToolsBackgroundDiagnostics.appendDiagnostic) {
        root.bcToolsBackgroundDiagnostics.appendDiagnostic(message, null).catch(() => {});
      } else {
        chrome.runtime.sendMessage(message, () => { void chrome.runtime.lastError; });
      }
    } catch (_) {}
  }

  root.BcToolsUrlContext = { resolve, resolveTab, sourceFromSender, build, reportError };
})(globalThis);
