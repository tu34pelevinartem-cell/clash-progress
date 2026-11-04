const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');

// No npm install or package scripts: only verified JSON and PNG assets are used.
const VERSION = '0.19.1';
const ARCHIVE_URL = `https://registry.npmjs.org/clash-of-clans-data/-/clash-of-clans-data-${VERSION}.tgz`;
const INTEGRITY = 'sha512-STHiiofY0UIQwI31RZwx/6jzXTrnMF09CRoVkex+QDdrlE4agcmlSG6Zhaf+/Eul9kv9VYwquTWs7ZzCnfRExw==';
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
function option(flag) {
  const index = args.indexOf(flag);
  if (index < 0) return null;
  if (!args[index + 1]) throw new Error(`Missing value for ${flag}`);
  return args[index + 1];
}
const archiveOption = option('--archive');
const output = path.resolve(option('--output') || path.join(root, '_site'));
const publicFiles = ['index.html', 'theme.css', 'dashboard.js', 'engine.js', 'DATA-LICENSE.txt', '.nojekyll'];
function filesBelow(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(file) : file.endsWith('.json') ? [file] : [];
  });
}
function chooseImage(entity) {
  const latest = entity.levels.at(-1);
  return entity.images?.icon || entity.images?.normal || latest?.images?.normal || Object.values(latest?.images || {})[0];
}
async function main() {
  const plainDatabase = path.join(root, 'upgrades.json');
  const compressedDatabase = path.join(root, 'data', 'upgrades.json.gz');
  const databaseBytes = fs.existsSync(plainDatabase)
    ? fs.readFileSync(plainDatabase)
    : zlib.gunzipSync(fs.readFileSync(compressedDatabase));
  const database = JSON.parse(databaseBytes.toString('utf8'));
  if (database.version !== VERSION) throw new Error('The database and pinned asset package versions must match.');
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const temporary = fs.mkdtempSync(path.join(temporaryRoot, 'clash-pages-'));
  try {
    const archive = path.join(temporary, 'data.tgz');
    let bytes;
    if (archiveOption) bytes = fs.readFileSync(path.resolve(archiveOption));
    else {
      const response = await fetch(ARCHIVE_URL, { signal: AbortSignal.timeout(180000) });
      if (!response.ok) throw new Error(`Asset package download failed: HTTP ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
    }
    const actual = 'sha512-' + crypto.createHash('sha512').update(bytes).digest('base64');
    if (actual !== INTEGRITY) throw new Error('Asset package integrity verification failed.');
    fs.writeFileSync(archive, bytes);
    execFileSync('tar', ['-xzf', archive, '-C', temporary, 'package/data', 'package/images', 'package/LICENSE']);
    const packageRoot = path.join(temporary, 'package');
    const definitions = new Map();
    for (const base of ['home', 'builder']) {
      for (const file of filesBelow(path.join(packageRoot, 'data', base))) {
        const definition = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (Number.isInteger(definition.dataId) && Array.isArray(definition.levels)) {
          definitions.set(`${definition.base}:${definition.dataId}`, definition);
        }
      }
    }
    fs.mkdirSync(path.join(output, 'assets'), { recursive: true });
    for (const file of publicFiles) fs.copyFileSync(path.join(root, file), path.join(output, file));
    fs.writeFileSync(path.join(output, 'upgrades.json'), databaseBytes);
    let count = 0;
    function copyImage(source, destination) {
      if (!source || !/^images\/[a-zA-Z0-9_./-]+\.png$/.test(source)) throw new Error(`Invalid package image path: ${source}`);
      if (!/^assets\/[a-zA-Z0-9_-]+\.png$/.test(destination)) throw new Error(`Invalid site image path: ${destination}`);
      const resolved = fs.realpathSync(path.join(packageRoot, source));
      if (!resolved.startsWith(fs.realpathSync(packageRoot) + path.sep)) throw new Error('Image is outside the package.');
      fs.copyFileSync(resolved, path.join(output, destination));
      count++;
    }
    for (const entity of database.entities) {
      const definition = definitions.get(`${entity.base}:${entity.id}`);
      if (!definition) throw new Error(`Missing source definition: ${entity.base}:${entity.id}`);
      if (entity.image) copyImage(chooseImage(definition), entity.image);
      if (definition.id === 'town-hall') {
        for (const level of definition.levels) {
          const image = level.images?.normal || Object.values(level.images || {})[0];
          if (image) copyImage(image, `assets/town-hall-${level.level}.png`);
        }
      }
    }
    const license = fs.readFileSync(path.join(packageRoot, 'LICENSE'));
    if (!license.equals(fs.readFileSync(path.join(root, 'DATA-LICENSE.txt')))) throw new Error('Pinned package license differs from the checked-in license.');
    console.log(`Prepared ${database.entities.length} entities and ${count} images in ${output}`);
  } finally {
    const resolved = fs.realpathSync(temporary);
    if (resolved.startsWith(temporaryRoot + path.sep) && path.basename(resolved).startsWith('clash-pages-')) {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
