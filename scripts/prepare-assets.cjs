const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');

// No npm install or package scripts: only verified JSON, PNG and WebP assets are used.
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
const releaseArtDirectory = option('--release-art-dir');
const output = path.resolve(option('--output') || path.join(root, '_site'));
const publicFiles = ['art.js', 'equipment-ui.js', 'equipment.css', 'equipment-data.json', 'details-ui.js', 'details.css', 'planner-ui.js', 'planner.css', 'walls.js', 'walls.css', 'coach-engine.js', 'coach-ui.js', 'coach.css', 'coach-data.json', 'index.html', 'theme.css', 'th19-theme.css', 'readability.css', 'new-content-ui.js', 'new-content.css', 'progress-history.js', 'progress-history.css', 'progress-share.js', 'progress-share.css', 'dashboard.js', 'engine.js', 'DATA-LICENSE.txt', 'RELEASE-ASSETS.md', '.nojekyll'];
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
    const releaseAssets = path.join(root, 'release-assets');
    const releaseImages = new Map();
    if (fs.existsSync(releaseAssets)) for (const file of fs.readdirSync(releaseAssets)) {
      if (!/^[a-z0-9-]+\.png$/.test(file)) throw new Error('Invalid release artwork filename');
      const bytes = fs.readFileSync(path.join(releaseAssets, file));
      if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Release artwork must be PNG');
      const destination = 'assets/release-' + file;
      fs.writeFileSync(path.join(output, destination), bytes);
      releaseImages.set(file, destination); count++;
    }
    for (const entity of database.entities) {
      const definition = definitions.get(`${entity.base}:${entity.assetSourceId ?? entity.id}`);
      if (!definition) {
        if (!entity.releaseAsset) throw new Error(`Missing source definition: ${entity.base}:${entity.id}`);
        entity.imageIsGeneric = false;
        delete entity.image;
        delete entity.imagesByLevel;
        continue;
      }
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
      for (const [level, file] of Object.entries(entity.levelArtOverrides || {})) {
        if (!/^\d+$/.test(level) || !releaseImages.has(file)) throw new Error('Invalid release level artwork');
        imagesByLevel[level] = releaseImages.get(file); imageLevelCount++;
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
    const artworkManifest = JSON.parse(fs.readFileSync(path.join(root, 'data/release-artwork.json'), 'utf8'));
    if (!/^[a-f0-9]{40}$/.test(artworkManifest.commit)) throw new Error('Invalid release artwork commit');
    for (let offset = 0; offset < artworkManifest.files.length; offset += 6) {
      await Promise.all(artworkManifest.files.slice(offset, offset + 6).map(async item => {
        if (!/^assets\/[a-zA-Z0-9_/'-]+\.webp$/.test(item.path) || item.path.includes('..') || !/^assets\/release-[a-z0-9-]+\.webp$/.test(item.destination)) throw new Error('Invalid release artwork path');
        let bytes;
        if (releaseArtDirectory) bytes = fs.readFileSync(path.join(path.resolve(releaseArtDirectory), path.basename(item.destination)));
        else {
          const url = `https://raw.githubusercontent.com/ClashKingInc/ClashKingAssets/${artworkManifest.commit}/${item.path}`;
          const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
          if (!response.ok) throw new Error('Release artwork download failed: ' + response.status);
          bytes = Buffer.from(await response.arrayBuffer());
        }
        if (bytes.length !== item.size || bytes.subarray(0,4).toString() !== 'RIFF' || bytes.subarray(8,12).toString() !== 'WEBP') throw new Error('Invalid release image');
        const digest = crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
        if (digest !== item.sha) throw new Error('Release image integrity mismatch');
        fs.writeFileSync(path.join(output, item.destination), bytes);
        const entity = database.entities.find(row => row.id === item.id && row.base === 'home');
        if (!entity) throw new Error('Missing artwork entity');
        if (item.level === null) { entity.image = item.destination; entity.imageIsGeneric = true; }
        else { entity.imagesByLevel = { ...(entity.imagesByLevel || {}), [item.level]: item.destination }; entity.imageIsGeneric = false; imageLevelCount++; }
        count++;
      }));
    }
    for (const item of database.pendingEntities || []) {
      const entity = database.entities.find(row => row.id === item.id);
      if (entity?.imagesByLevel?.[1] || entity?.image) item.image = entity.imagesByLevel?.[1] || entity.image;
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
