/** Un fichier logique dans le projet */
export interface TpuFile {
  type: 'file';
  name: string;              // ex: "demo.starttpuml"
  path: string;              // ex: "source-tpuml/starter/demo.starttpuml"
  content: string;           // UTF-8
}

/** Un dossier logique dans le projet */
export interface TpuDir {
  type: 'dir';
  name: string;              // ex: "starter"
  path: string;              // ex: "source-tpuml/starter"
  children: Map<string, TpuDir | TpuFile>;
}

/** Projet T-PUML complet */
export interface TpuProject {
  name: string;
  createdAt: number;
  root: TpuDir;              // racine logique, contient p.ex. source-tpuml/, gen-puml/, export/
  src: TpuDir;               // racine du code
  starters: string[];        // chemins relatifs depuis la racine (conseillé: ceux sous source-tpuml/starter/)
}

/** ---------- Helpers de construction ---------- **/

export function createEmptyProject(name: string): TpuProject {
  const root: TpuDir = { type: 'dir', name: '', path: '', children: new Map() };
  // arbo de base
  const src: TpuDir = ensureDir(root, 'source-tpuml');
  ensureDir(root, 'source-tpuml/starter');
  ensureDir(root, 'gen-puml');
  ensureDir(root, 'export');
  ensureDir(root, 'export/svg');
  return { name, createdAt: Date.now(), root, src, starters: [] };
}

export function ensureDir(root: TpuDir, dirPath: string): TpuDir {
  const parts = dirPath.split('/').filter(Boolean);
  let cur = root;
  for (const p of parts) {
    const nextPath = cur.path ? `${cur.path}/${p}` : p;
    const child = cur.children.get(p);
    if (child && child.type === 'dir') { cur = child; continue; }
    const nd: TpuDir = { type: 'dir', name: p, path: nextPath, children: new Map() };
    cur.children.set(p, nd);
    cur = nd;
  }
  return cur;
}

export function upsertFile(root: TpuDir, filePath: string, content: string): TpuFile {
  const parts = filePath.split('/').filter(Boolean);
  const fileName = parts.pop()!;
  const dir = ensureDir(root, parts.join('/'));
  const full = dir.path ? `${dir.path}/${fileName}` : fileName;
  const f: TpuFile = { type: 'file', name: fileName, path: full, content };
  dir.children.set(fileName, f);
  return f;
}

export function readFile(root: TpuDir, filePath: string): string | undefined {
  const { dir, base } = split(filePath);
  const d = getDir(root, dir);
  const n = d?.children.get(base);
  return n && n.type === 'file' ? n.content : undefined;
}

export function listFiles(root: TpuDir, predicate?: (f: TpuFile)=>boolean): TpuFile[] {
  const out: TpuFile[] = [];
  walk(root, n => { if (n.type === 'file' && (!predicate || predicate(n))) out.push(n); });
  out.sort((a,b) => a.path.localeCompare(b.path));
  return out;
}

export function removePath(root: TpuDir, path: string): void {
  const { dir, base } = split(path);
  const d = getDir(root, dir);
  d?.children.delete(base);
}

export function walk(node: TpuDir | TpuFile, cb: (n: TpuDir|TpuFile)=>void) {
  cb(node);
  if (node.type === 'dir') {
    for (const ch of node.children.values()) walk(ch, cb);
  }
}

/** ---------- util ---------- **/
function split(p: string) {
  const i = p.lastIndexOf('/');
  return { dir: i<0 ? '' : p.slice(0,i), base: i<0 ? p : p.slice(i+1) };
}
function getDir(root: TpuDir, dirPath: string): TpuDir | undefined {
  if (!dirPath) return root;
  const parts = dirPath.split('/').filter(Boolean);
  let cur: TpuDir | undefined = root;
  for (const p of parts) {
    const n: TpuDir | TpuFile | undefined = cur?.children.get(p);
    if (!n || n.type !== 'dir') return undefined;
    cur = n;
  }
  return cur;
}

/** (dé)sérialisation Map<…> <-> objet JSON plat pour localStorage */
export function serializeProject(p: TpuProject): any {
  return { ...p, root: serializeDir(p.root) };
}
function serializeDir(d: TpuDir): any {
  const children: Record<string, any> = {};
  for (const [k, v] of d.children) {
    children[k] = v.type === 'dir' ? serializeDir(v) : v;
  }
  return { type: 'dir', name: d.name, path: d.path, children };
}
export function deserializeProject(raw: any): TpuProject {
  return {
    name: raw.name,
    createdAt: raw.createdAt,
    starters: raw.starters ?? [],
    root: deserializeDir(raw.root),
    src:  deserializeDir(raw.src),
  };
}
function deserializeDir(r: any): TpuDir {
  const children = new Map<string, TpuDir|TpuFile>();
  for (const k of Object.keys(r.children ?? {})) {
    const v = r.children[k];
    if (v.type === 'dir') children.set(k, deserializeDir(v));
    else children.set(k, v as TpuFile);
  }
  return { type: 'dir', name: r.name, path: r.path, children };
}
