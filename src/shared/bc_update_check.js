(function(root){
  const MANIFEST_URL = 'https://raw.githubusercontent.com/unwritten42/BC_tool/main/manifest.json';
  const CHANGES_URL = 'https://github.com/unwritten42/BC_tool/commits/main/';

  function parseVersion(version){
    if(typeof version !== 'string' || !/^\d+(?:\.\d+){0,3}$/.test(version)){
      throw new TypeError('invalid-extension-version');
    }
    const parts = version.split('.').map(Number);
    if(parts.some(part => !Number.isInteger(part) || part > 65535)){
      throw new TypeError('invalid-extension-version');
    }
    return parts;
  }

  function compareVersions(left, right){
    const a = parseVersion(left);
    const b = parseVersion(right);
    for(let i = 0; i < 4; i++){
      const difference = (a[i] || 0) - (b[i] || 0);
      if(difference) return Math.sign(difference);
    }
    return 0;
  }

  async function check(currentVersion){
    const response = await root.fetch(MANIFEST_URL, { cache:'no-store' });
    if(!response.ok) throw new Error('update-check-http-error');
    const manifest = await response.json();
    if(!manifest || typeof manifest.version !== 'string'){
      throw new TypeError('invalid-remote-manifest');
    }
    return compareVersions(manifest.version, currentVersion) > 0
      ? { version:manifest.version, changesUrl:CHANGES_URL }
      : null;
  }

  root.BcToolsUpdateCheck = { check, compareVersions };
})(globalThis);
