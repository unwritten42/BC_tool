const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

function assertFile(file, source) {
  const resolved = path.resolve(file);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${source} references a path outside the extension: ${file}`);
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`${source} references a missing file: ${path.relative(root, resolved)}`);
  }
}

function addManifestFiles(files) {
  files.push(manifest.background?.service_worker, manifest.action?.default_popup, manifest.options_ui?.page);
  files.push(...Object.values(manifest.icons || {}), ...Object.values(manifest.action?.default_icon || {}));
  for (const script of manifest.content_scripts || []) {
    files.push(...(script.js || []), ...(script.css || []));
  }
  for (const resource of manifest.web_accessible_resources || []) {
    files.push(...resource.resources);
  }
  return files.filter(Boolean);
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : [file];
  });
}

function localReference(value) {
  return !/^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(value);
}

const files = addManifestFiles([]);
for (const file of sourceFiles(path.join(root, 'src'))) {
  const content = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.html')) {
    for (const [, reference] of content.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
      if (localReference(reference)) files.push(path.resolve(path.dirname(file), reference));
    }
  }
  if (file.endsWith('.css')) {
    for (const [, reference] of content.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
      if (localReference(reference)) files.push(path.resolve(path.dirname(file), reference));
    }
  }
}

for (const file of files) {
  assertFile(path.resolve(root, file), 'Extension build');
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(path.join(root, 'manifest.json'), path.join(output, 'manifest.json'));
for (const directory of ['src', 'assets']) {
  fs.cpSync(path.join(root, directory), path.join(output, directory), { recursive: true });
}

console.log(`Built unpacked extension in ${path.relative(root, output)} (${files.length} validated references).`);
