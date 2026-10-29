const assert = require('node:assert/strict');
const { toggleHiddenCopyFieldKey, normalizeHiddenCopyFieldKeys } = require('../src/shared/bc_copy_field_visibility');

assert.deepEqual(Array.from(normalizeHiddenCopyFieldKeys(['copy-abc', 'copy-def', 'bogus', 3])), ['copy-abc', 'copy-def']);

const hidden = new Set(['copy-abc']);
const shown = toggleHiddenCopyFieldKey(hidden, 'copy-abc', false);
assert.deepEqual(Array.from(shown), []);

const hiddenAfterAdd = toggleHiddenCopyFieldKey(hidden, 'copy-def', true);
assert.deepEqual(Array.from(hiddenAfterAdd).sort(), ['copy-abc', 'copy-def']);

console.log('Copy field visibility tests passed.');
