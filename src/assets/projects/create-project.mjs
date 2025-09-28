#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectsRoot = __dirname; // assets/projects
const indexFile = path.join(projectsRoot, 'index.json');

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function write(p, content) { fs.writeFileSync(p, content, 'utf8'); }

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
}

function readJson(p) { return JSON.parse(fs.readFileSync(p,'utf8')); }
function saveJson(p, obj) { fs.writeFileSync(p, JSON.stringify(obj, null, 2)+'\n','utf8'); }

const nameArg = process.argv[2];
if (!nameArg) {
  console.error('Usage: node assets/projects/create-project.mjs "Nom du projet" [id]');
  process.exit(1);
}
const id = process.argv[3] || slugify(nameArg);

const baseDir = path.join(projectsRoot, id);
if (fs.existsSync(baseDir)) {
  console.error(`Le dossier ${baseDir} existe déjà.`);
  process.exit(2);
}

console.log(`→ Création du projet '${nameArg}' (${id})`);
ensureDir(baseDir);

// Arborescence
ensureDir(path.join(baseDir, 'source-tpuml', 'starter'));
ensureDir(path.join(baseDir, 'source-tpuml', 'styles'));
ensureDir(path.join(baseDir, 'source-tpuml', 'fragments'));
ensureDir(path.join(baseDir, 'gen-puml'));
ensureDir(path.join(baseDir, 'export', 'svg'));
ensureDir(path.join(baseDir, 'tools'));
ensureDir(path.join(baseDir, 'scripts'));

// Fichiers seeds
write(path.join(baseDir, 'source-tpuml', 'styles', 'tokens.tpuml'), `!define COLOR.BG #FFFFFF
!define COLOR.TEXT #111111
`);
write(path.join(baseDir, 'source-tpuml', 'styles', 'sequence.base.tpuml'), `skinparam monochrome false
`);
write(path.join(baseDir, 'source-tpuml', 'fragments', 'hello.tpuml'), `type Actor A_UI "User"
type Service S_API "API"

' Exemple d'interaction
A_UI -> S_API : ping
S_API --> A_UI : pong
`);
write(path.join(baseDir, 'source-tpuml', 'starter', 'hello.starttpuml'), `@starttpuml
include ../styles/tokens.tpuml
include ../styles/sequence.base.tpuml
include ../fragments/hello.tpuml
title Hello — T-PUML
@endtpuml
`);

// Pipeline outil (si non présent, copié depuis exemple si dispo)
const exampleTools = path.join(projectsRoot, 'exemple', 'tools');
const dstTools = path.join(baseDir, 'tools');
if (fs.existsSync(exampleTools)) {
  for (const f of fs.readdirSync(exampleTools)) {
    fs.copyFileSync(path.join(exampleTools, f), path.join(dstTools, f));
  }
} else {
  // au minimum, pose plantuml.jar si disponible à la racine repo /assets/plantuml.jar
  const repoJar = path.join(process.cwd(), 'assets', 'plantuml.jar');
  if (fs.existsSync(repoJar)) {
    fs.copyFileSync(repoJar, path.join(dstTools, 'plantuml.jar'));
  }
}

// Scripts
const pipelineSrc = path.join(projectsRoot, 'exemple', 'scripts', 'tpuml-pipeline.mjs');
const pipelineDst = path.join(baseDir, 'scripts', 'tpuml-pipeline.mjs');
if (fs.existsSync(pipelineSrc)) {
  fs.copyFileSync(pipelineSrc, pipelineDst);
} else {
  write(pipelineDst, `#!/usr/bin/env node
console.log('Copiez le pipeline depuis le projet exemple.');
`);
}

// MAJ de l’index.json
let idx = { projects: [] };
if (fs.existsSync(indexFile)) idx = readJson(indexFile);
const exists = idx.projects.some(p => p.id === id);
if (!exists) {
  idx.projects.push({ id, name: nameArg, baseDir: `assets/projects/\${id}`, description: '' });
  saveJson(indexFile, idx);
  console.log('→ index.json mis à jour');
}

console.log('Projet créé ✅');
