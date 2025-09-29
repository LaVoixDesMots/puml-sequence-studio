// src/app/models/tpuml-project.builders.ts
import { DirNode, FileNode } from './files.model';
import { TpuFile, TpuKind, TpuProject, TpuRoots, TpuManifest } from './tpuml-project.model';

/** Classe l’extension en TpuKind */
export function classifyKind(name: string): TpuKind {
  const lower = name.toLowerCase();
  if (lower.endsWith('.starttpuml')) return 'starttpuml';
  if (lower.endsWith('.tpuml'))      return 'tpuml';
  if (lower.endsWith('.puml'))       return 'puml';
  if (lower.endsWith('.svg'))        return 'svg';
  return 'other';
}

/** Parcours récursif : retourne tous les FileNode sous un DirNode avec leurs paths relatifs */
export function flattenFiles(dir: DirNode, basePath = ''): Array<{ path: string; file: FileNode }> {
  const out: Array<{ path: string; file: FileNode }> = [];
  for (const [, child] of dir.children) {
    if (child.type === 'file') {
      const p = basePath ? `${basePath}/${child.name}` : child.name;
      out.push({ path: p, file: child });
    } else {
      const p = basePath ? `${basePath}/${child.name}` : child.name;
      out.push(...flattenFiles(child, p));
    }
  }
  return out;
}

/** Cherche un sous-dossier direct de `root` par nom (ex: "source-tpuml") */
export function findChildDir(root: DirNode, name: string): DirNode | null {
  const c = root.children.get(name);
  return c && c.type === 'dir' ? c : null;
}

/** Essaie d’inférer le manifest depuis /manifest.json s’il existe (optionnel) */
export function tryReadManifest(root: DirNode): TpuManifest | undefined {
  const f = root.children.get('manifest.json');
  if (f && f.type === 'file' && typeof f.content === 'string') {
    try { return JSON.parse(f.content) as TpuManifest; } catch { /* ignore */ }
  }
  return undefined;
}

/** Construit un TpuProject depuis un arbre DirNode racine importé */
export function buildTpuProject(root: DirNode, name: string, id?: string): TpuProject {
  // 1) Localise les racines attendues
  const source = findChildDir(root, 'source-tpuml');
  const gen    = findChildDir(root, 'gen-puml');
  const exp    = findChildDir(root, 'export');

  // 2) Aplatis tous les fichiers de la racine projet
  const flat = flattenFiles(root); // paths relatifs à root
  const all = new Map<string, TpuFile>();
  const sourceMap = new Map<string, TpuFile>();
  const pumlMap   = new Map<string, TpuFile>();
  const svgMap    = new Map<string, TpuFile>();

  for (const { path, file } of flat) {
    const t: TpuFile = {
      kind: classifyKind(file.name),
      name: file.name,
      path,
      content: file.content
    };
    all.set(path, t);

    // Range dans les index spécialisés selon la racine ET l’extension
    const isUnder = (dirName: string | null) =>
      !!dirName && (path === dirName || path.startsWith(dirName + '/'));

    if (isUnder('source-tpuml')) {
      if (t.kind === 'starttpuml' || t.kind === 'tpuml') sourceMap.set(path, t);
    } else if (isUnder('gen-puml')) {
      if (t.kind === 'puml') pumlMap.set(path, t);
    } else if (isUnder('export')) {
      if (t.kind === 'svg') svgMap.set(path, t);
    }
  }

  // 3) Manifest optionnel
  const manifest = tryReadManifest(root);

  // 4) Indicateurs de validation
  const validation = {
    hasSourceRoot: !!source,
    hasGenRoot: !!gen,
    hasExportRoot: !!exp
  };

  // 5) ID stable (slug) si manquant
  const slug = (id ?? name).toLowerCase().replace(/[^\w.-]+/g, '-');

  const project: TpuProject = {
    id: slug,
    name,
    manifest,
    roots: { root, source, gen, export: exp },
    files: { all, source: sourceMap, puml: pumlMap, svg: svgMap },
    validation
  };

  return project;
}
