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
const publicFiles = ['art.js', 'equipment-ui.js', 'equipment.css', 'equipment-data.json', 'details-ui.js', 'details.css', 'planner-ui.js', 'planner.css', 'walls.js', 'walls.css', 'coach-engine.js', 'coach-ui.js', 'coach.css', 'coach-data.json', 'index.html', 'theme.css', 'dashboard.js', 'engine.js', 'DATA-LICENSE.txt', '.nojekyll'];
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
    // Each deployment names its own JS/CSS versions so a cached older script
    // cannot be combined with the new navigation or feature markup.
    let html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
    for (const file of publicFiles.filter(file => /\.(js|css)$/.test(file))) {
      const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(output, file))).digest('hex').slice(0, 12);
      for (const attribute of ['src', 'href']) {
        html = html.split(`${attribute}="${file}"`).join(`${attribute}="${file}?v=${digest}"`);
      }
    }
    fs.writeFileSync(path.join(output, 'index.html'), html);
    let count = 0;
    let imageLevelCount = 0;
    let imageEntityCount = 0;
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
      // An entity-wide icon can be shared by all levels. An image selected from
      // the latest level is only retained for older consumers, never a current-
      // level fallback for the new renderer.
      entity.imageIsGeneric = !!(definition.images?.icon || definition.images?.normal);
      if (entity.image) copyImage(chooseImage(definition), entity.image);
      const imagesByLevel = {};
      const copiedLevelImages = new Map();
      for (const level of [...definition.levels].sort((a, b) => a.level - b.level)) {
        // Supercharges restart their numbering at 1, and are not building
        // levels. Including them would replace low-level art with max art.
        if (level.supercharge || !Number.isInteger(level.level) || level.level < 1) continue;
        const source = level.images?.normal;
        if (!source) continue;
        // The source explicitly reuses some artwork (e.g. troop levels 1/2).
        // Preserve that mapping without guessing across missing levels.
        let destination = copiedLevelImages.get(source);
        if (!destination) {
          destination = `assets/${entity.base}-${entity.id}-level-${level.level}.png`;
          copyImage(source, destination);
          copiedLevelImages.set(source, destination);
        }
        if (imagesByLevel[level.level] && imagesByLevel[level.level] !== destination) {
          throw new Error(`Conflicting level images: ${entity.base}:${entity.id}:${level.level}`);
        }
        imagesByLevel[level.level] = destination;
        imageLevelCount++;
      }
      delete entity.imagesByLevel;
      if (Object.keys(imagesByLevel).length) {
        entity.imagesByLevel = imagesByLevel;
        imageEntityCount++;
      }
      if (definition.id === 'town-hall') {
        for (const level of definition.levels) {
          const image = level.images?.normal || Object.values(level.images || {})[0];
          if (image) copyImage(image, `assets/town-hall-${level.level}.png`);
        }
      }
    }
    for (const ore of ['shiny-ore', 'glowy-ore', 'starry-ore']) copyImage(`images/other/ore/${ore}.png`, `assets/${ore}.png`);
    // Add only presentation metadata to the output; the source gameplay
    // database, prices, level requirements and timers remain untouched.
    fs.writeFileSync(path.join(output, 'upgrades.json'), JSON.stringify(database));
    const license = fs.readFileSync(path.join(packageRoot, 'LICENSE'));
    if (!license.equals(fs.readFileSync(path.join(root, 'DATA-LICENSE.txt')))) throw new Error('Pinned package license differs from the checked-in license.');
    console.log(`Prepared ${database.entities.length} entities and ${count} images; ${imageLevelCount} level mappings across ${imageEntityCount} entities in ${output}`);
  } finally {
    const resolved = fs.realpathSync(temporary);
    if (resolved.startsWith(temporaryRoot + path.sep) && path.basename(resolved).startsWith('clash-pages-')) {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
