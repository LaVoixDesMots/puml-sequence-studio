// scripts/tpuml-pipeline.mjs
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import fg from 'fast-glob';
import fse from 'fs-extra';
import archiver from 'archiver';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

/* ---------- CONFIG ---------- */
const ROOT = process.cwd();
const project_name = 'exemple';
const PROJECTS_DIR = path.join(ROOT, 'src', 'assets', 'projects')
const PROJECT_ROOT = path.join(PROJECTS_DIR, project_name)
const SRC_ROOT = path.join(PROJECT_ROOT, 'source-tpuml');
const GEN_ROOT = path.join(PROJECT_ROOT, 'gen-puml');
const EXP_ROOT = path.join(PROJECT_ROOT, 'export');
const SVG_ROOT = path.join(EXP_ROOT, 'svg');
const JAR_PATH = path.join(PROJECT_ROOT, 'tools', 'plantuml.jar');

/* ---------- Utils stdout/stderr ---------- */
const log = (...a) => console.log('[tpuml]', ...a);
const warn = (...a) => console.warn('[tpuml]', ...a);

/* ---------- 1) Détection & transpilation ---------- */
function looksLikeTpuml(src) {
  return (
    /@starttpuml\b/i.test(src) ||
    /^\s*type\s+\w+/m.test(src) ||
    /^\s*include\s+/m.test(src)
  );
}

function transpileTpuml(src) {
  const TYPE_TEMPLATES = {
    Actor   : (id, label) => `actor ${label ? `"${label}" ` : ''}as ${id}`,
    Service : (id, label, stereo) => `participant ${label ? `"${label}" ` : ''}as ${id}${stereo ? ` <<${stereo}>>` : ' <<service>>'}`,
    DB      : (id, label) => `database ${label ? `"${label}" ` : ''}as ${id}`,
    Queue   : (id, label) => `queue ${label ? `"${label}" ` : ''}as ${id}`,
    Boundary: (id, label) => `boundary ${label ? `"${label}" ` : ''}as ${id}`,
  };
  const stripQuotes = s => s?.replace(/^"(.*)"$/, '$1');

  const lines = src.split(/\r?\n/);
  const includes = [];
  const decls = [];
  const body = [];

  const typeRe = /^type\s+(\w+)\s+([A-Za-z_][\w]*)\s*(?:"([^"]*)")?\s*(?:<<\s*([A-Za-z0-9_+-]+)\s*>>)?\s*$/;
  const includeRe = /^(?:include|!include)\s+(.+)\s*$/;
  const startTypedRe = /^\s*@starttpuml\s*$/i;
  const endTypedRe   = /^\s*@endtpuml\s*$/i;

  for (const raw of lines) {
    const line = raw.trim();
    if (startTypedRe.test(line) || endTypedRe.test(line)) continue;

    const inc = line.match(includeRe);
    if (inc) { includes.push(`!include ${inc[1]}`); continue; }

    const m = line.match(typeRe);
    if (m) {
      const [, t, id, quoted, stereo] = m;
      const tpl = TYPE_TEMPLATES[t];
      if (!tpl) throw new Error(`Type inconnu: ${t}`);
      decls.push(tpl(id, stripQuotes(quoted), stereo));
      continue;
    }

    body.push(raw);
  }

  const hasStartUml = /^\s*@startuml\b/m.test(src);
  const hasEndUml   = /^\s*@enduml\b/m.test(src);

  const out = [];
  // if (!hasStartUml) out.push('@startuml');
  out.push(...includes);
  if (decls.length) out.push('', ...decls, '');
  out.push(...body);
  // if (!hasEndUml) out.push('@enduml');
  return out.join('\n');
}

/* ---------- 2) Résolution d’include et inline ---------- */
function normalizePath(p) {
  const parts = p.split('/').filter(Boolean);
  const stack = [];
  for (const seg of parts) {
    if (seg === '.') continue;
    if (seg === '..') { stack.pop(); continue; }
    stack.push(seg);
  }
  return stack.join('/');
}
function dirnameUnix(p) {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}
async function readText(absPath) {
  return fs.readFile(absPath, 'utf8');
}
function resolveFromBase(baseDirRel, relPath) {
  // absolu à partir de source-tpuml
  if (relPath.startsWith('/')) {
    return path.join(SRC_ROOT, normalizePath(relPath));
  }
  // relatif au fichier incluant
  const joined = baseDirRel ? path.join(SRC_ROOT, baseDirRel, relPath) : path.join(SRC_ROOT, relPath);
  return path.normalize(joined);
}

async function inlineOne(text, sourceRel, seen = new Set()) {
  console.log(sourceRel)
  const baseRel = dirnameUnix(sourceRel.replaceAll('\\', '/'));
  let src = looksLikeTpuml(text) ? transpileTpuml(text) : text;
  console.log(baseRel)
  console.log(src)

  const includeLine = /^\s*!include\s+(.+)\s*$/;
  const lines = src.split(/\r?\n/);
  const out = [];

  for (const raw of lines) {
    const m = raw.match(includeLine);
    if (!m) { out.push(raw); continue; }

    const includeRaw = m[1].trim().replace(/^"(.*)"$/, '$1');
    const includeAbs = resolveFromBase(baseRel, includeRaw);
    const includeRelFromSrc = path.relative(SRC_ROOT, includeAbs).replaceAll('\\','/');

    console.log(includeRaw)
    console.log(includeAbs)
    console.log(includeRelFromSrc)

    if (seen.has(includeRelFromSrc)) { continue; }
    seen.add(includeRelFromSrc);

    if (!existsSync(includeAbs)) {
      throw new Error(`Include introuvable: ${includeRelFromSrc} (depuis ${sourceRel})`);
    }
    let incText = await readText(includeAbs);
    if (/\.(tpuml|starttpuml)$/i.test(includeAbs) || looksLikeTpuml(incText)) {
      incText = transpileTpuml(incText);
    }
    const inlined = await inlineOne(incText, includeRelFromSrc, seen);
    out.push(inlined);
  }
  return out.join('\n');
}

/* ---------- 3) Rendu PlantUML (SVG via -pipe) ---------- */
async function plantumlToSvg(pumlText) {
  return new Promise((resolve, reject) => {
    if (!existsSync(JAR_PATH)) return reject(new Error(`plantuml.jar introuvable: ${JAR_PATH}`));
    const args = [
      '-Djava.awt.headless=true',
      '-jar', JAR_PATH,
      '-tsvg',
      '-pipe',
      // Désactive tout I/O réseau implicite côté PlantUML
      '-DPLANTUML_SECURITY_PROFILE=LEGACY' // ou stricter si besoin
    ];
    const child = spawn('java', args, { stdio: ['pipe','pipe','pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());
    child.on('close', code => {
      if (code === 0 && stdout.trim().length) return resolve(stdout);
      reject(new Error(`PlantUML a échoué (code ${code}) ${stderr ? '\n' + stderr : ''}`));
    });
    child.stdin.write(pumlText);
    child.stdin.end();
  });
}

/* ---------- 4) Pipeline tasks ---------- */
async function clean() {
  await fse.remove(GEN_ROOT);
  await fse.remove(EXP_ROOT);
  await fse.ensureDir(GEN_ROOT);
  await fse.ensureDir(SVG_ROOT);
}

async function transpileAll() {
  // copie transpilation 1:1 (miroir)
  const files = await fg(['**/*.tpuml','**/*.starttpuml'], { cwd: SRC_ROOT, dot: false });
  for (const rel of files) {
    const abs = path.join(SRC_ROOT, rel);
    const text = await readText(abs);
    const outRel = rel.replace(/\.starttpuml$/i, '.puml').replace(/\.tpuml$/i, '.puml');
    const outAbs = path.join(GEN_ROOT, outRel);
    await fse.ensureDir(path.dirname(outAbs));
    const puml = transpileTpuml(text);
    await fs.writeFile(outAbs, puml, 'utf8');
  }
}

async function buildFromStarters() {
  const starters = await fg(['starter/**/*.starttpuml'], { cwd: SRC_ROOT });
  const manifest = [];
  for (const rel of starters) {
    const abs = path.join(SRC_ROOT, rel);
    const baseName = path.basename(rel).replace(/\.starttpuml$/i, '');
    const outPumlRel = rel.replace(/\.starttpuml$/i, '.puml');
    const outPumlAbs = path.join(GEN_ROOT, outPumlRel);

    const srcText = await readText(abs);
    const startuml = '@startuml\n';
    const enduml = '\n@enduml\n';

    const puml = startuml + await inlineOne(srcText, rel) + enduml;

    await fse.ensureDir(path.dirname(outPumlAbs));
    await fs.writeFile(outPumlAbs, puml, 'utf8');

    const svg = await plantumlToSvg(puml);
    const outSvgAbs = path.join(SVG_ROOT, `${baseName}.svg`);
    await fs.writeFile(outSvgAbs, svg, 'utf8');

    manifest.push({ starter: rel.replaceAll('\\','/'), puml: path.relative(GEN_ROOT, outPumlAbs).replaceAll('\\','/'), svg: `svg/${baseName}.svg`, title: baseName });
    log('OK', rel, '→', `export/svg/${baseName}.svg`);
  }
  await fs.writeFile(path.join(EXP_ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return manifest;
}

async function zipAll(zipPath = path.join(EXP_ROOT, 'tpuml_bundle.zip')) {
  await fse.ensureDir(EXP_ROOT);
  const output = createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 }});
  const done = new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
  });
  archive.pipe(output);
  // Ajoute tout
  archive.directory(SRC_ROOT, 'source-tpuml');
  archive.directory(GEN_ROOT, 'gen-puml');
  archive.directory(SVG_ROOT, 'export/svg');
  archive.file(path.join(EXP_ROOT, 'manifest.json'), { name: 'export/manifest.json' });
  archive.finalize();
  await done;
  log('ZIP créé:', zipPath);
}

/* ---------- CLI ---------- */
const argv = yargs(hideBin(process.argv))
  .option('clean', { type: 'boolean', default: false })
  .option('gen',   { type: 'boolean', default: false })
  .option('watch', { type: 'boolean', default: false })
  .option('zip',   { type: 'boolean', default: false })
  .parse();

async function runOnce() {
  if (argv.clean) await clean();
  await fse.ensureDir(GEN_ROOT);
  await fse.ensureDir(SVG_ROOT);
  await transpileAll();
  const manifest = await buildFromStarters();
  if (argv.zip) await zipAll();
  return manifest;
}

if (argv.watch) {
  log('Watch mode — surveille source-tpuml/**/*.{tpuml,starttpuml}');
  const chokidar = (await import('chokidar')).default;
  await clean();
  await runOnce();
  const watcher = chokidar.watch(['**/*.tpuml','**/*.starttpuml'], { cwd: SRC_ROOT, ignoreInitial: true });
  const rebuild = async (file) => {
    warn('Changement détecté:', file);
    try { await runOnce(); } catch(e){ console.error(e); }
  };
  watcher.on('add', rebuild).on('change', rebuild).on('unlink', rebuild);
} else {
  runOnce().catch(err => { console.error(err); process.exit(1); });
}
