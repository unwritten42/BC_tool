(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.bcCopyFieldVisibility = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalizeHiddenCopyFieldKeys(value) {
    return new Set(Array.isArray(value)
      ? value.filter(key => typeof key === 'string' && /^copy-[a-z0-9]+$/.test(key)).slice(0, 5000)
      : []);
  }

  function toggleHiddenCopyFieldKey(currentKeys, key, hidden) {
    const nextKeys = new Set(currentKeys || []);
    if (hidden) nextKeys.add(key);
    else nextKeys.delete(key);
    return nextKeys;
  }

  return { normalizeHiddenCopyFieldKeys, toggleHiddenCopyFieldKey };
}));
