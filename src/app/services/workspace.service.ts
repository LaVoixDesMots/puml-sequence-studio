import { Injectable, effect, signal } from '@angular/core';
import JSZip from 'jszip';
import {
  TpuProject, upsertFile, readFile as readNodeFile,
  removePath as removeNodePath, listFiles, serializeProject, deserializeProject,
  createEmptyProject
} from '../models/tpuml-project';
import { dirname, normalizePath, looksLikeTpuml, transpileTpuml, transpileStarterTpuml } from './tpuml-core';
import { concat, Subject } from 'rxjs';
import { buildTpuProject } from '../models/tpuml-project.builders';

const LS_PROJECT_INDEX = 'tpuml:v2:projects';
const LS_CURRENT = 'tpuml:v2:current';
const LS_PROJECT_PREFIX = 'tpuml:v2:project:'; // + name

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  /** Projet courant (arbre complet) */
  readonly project = signal<TpuProject | null>(null);
  /** chemin sélectionné (dans le projet) */
  readonly selected = signal<string | null>(null);

  /** Notif pour composants qui veulent réagir (liste projets, etc.) */
  readonly changes$ = new Subject<void>();

  constructor() {
    // auto-load current project (si présent)
    const cur = localStorage.getItem(LS_CURRENT);
    if (cur) {
      const loaded = this.loadProject(cur);
      if (loaded) this.project.set(loaded);
    }

    // autosave minimal: si le projet change, on le persiste
    effect(() => {
      const p = this.project();
      if (p) this.saveProject(p);
    }, { allowSignalWrites: true });
  }

  /** ---------- Gestion multi-projets ---------- */

  listProjects(): { name: string; createdAt: number }[] {
    try { return JSON.parse(localStorage.getItem(LS_PROJECT_INDEX) || '[]'); }
    catch { return []; }
  }

  private writeIndex(list: { name: string; createdAt: number }[]) {
    localStorage.setItem(LS_PROJECT_INDEX, JSON.stringify(list));
  }

  loadProject(name: string): TpuProject | null {
    const raw = localStorage.getItem(LS_PROJECT_PREFIX + name);
    if (!raw) return null;
    try { return deserializeProject(JSON.parse(raw)); }
    catch { return null; }
  }

  saveProject(p: TpuProject) {
    localStorage.setItem(LS_PROJECT_PREFIX + p.name, JSON.stringify(serializeProject(p)));
    const idx = this.listProjects();
    const i = idx.findIndex(x => x.name === p.name);
    if (i >= 0) idx[i].createdAt = p.createdAt; else idx.push({ name: p.name, createdAt: p.createdAt });
    this.writeIndex(idx);
    this.changes$.next();
  }

  setCurrentProject(name: string) {
    localStorage.setItem(LS_CURRENT, name);
    const p = this.loadProject(name);
    this.project.set(p);
    this.selected.set(null);
    this.changes$.next();
  }

  getCurrentProject(): string | null {
    return localStorage.getItem(LS_CURRENT);
  }

  upsertProject(newProject: TpuProject) {
    this.saveProject(newProject);
  }

  removeProject(name: string) {
    localStorage.removeItem(LS_PROJECT_PREFIX + name);
    this.writeIndex(this.listProjects().filter(x => x.name !== name));
    if (this.getCurrentProject() === name) localStorage.removeItem(LS_CURRENT);
    if (this.project()?.name === name) this.project.set(null);
    this.changes$.next();
  }

  /** ---------- Files API (opère sur projet courant) ---------- */

  listPaths(): string[] {
    const p = this.project(); if (!p) return [];
    return listFiles(p.root).map(f => f.path);
  }

  read(path: string): string | undefined {
    const p = this.project(); if (!p) return undefined;
    return readNodeFile(p.root, normalizePath(path));
  }

  upsert(path: string, content: string) {
    const p = this.project(); if (!p) return;
    upsertFile(p.root, normalizePath(path), content);
    this.saveProject(p);
  }

  remove(path: string) {
    const p = this.project(); if (!p) return;
    removeNodePath(p.root, normalizePath(path));
    if (this.selected() === path) this.selected.set(null);
    this.saveProject(p);
  }

  select(path: string | null) { this.selected.set(path); }

  /** ---------- Import simple/zip ---------- */

  async importAny(file: File) {
    const p = this.project();
    if (file.name.toLowerCase().endsWith('.zip')) {
      await this.importZip(file);
    } else {
      if (!p) return;
      const text = await file.text();
      const path = `source-tpuml/${file.name}`;
      upsertFile(p.root, path, text);
      this.saveProject(p);
    }
  }

  async importZip(zipFile: File, newProject: boolean = true) {
    let p = this.project();
    if (newProject || !p) {
      p = createEmptyProject(zipFile.name);
      newProject = true;
    }
    const zip = await JSZip.loadAsync(zipFile);
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;
      if (!/(\.tpuml|\.starttpuml|\.puml|\.svg|\.txt|\.md)$/i.test(entry.name)) continue;
      const content = await entry.async('string');
      upsertFile(p.root, normalizePath(entry.name.replace(/^(\.\/)+/, '')), content);
      if (/(\.starttpuml)$/i.test(entry.name)) p.starters.push(content);
    }
    if (newProject) {

      this.upsertProject(p);
      this.setCurrentProject(zipFile.name);

    }
    console.log(p);
    this.saveProject(p);
  }

  /** ---------- Génération PUML/SVG depuis starters ---------- */

  async exportZip(renderSvg: (puml: string) => Promise<string>): Promise<Blob> {
    const p = this.project(); if (!p) throw new Error('Aucun projet courant');
    const zip = new JSZip();

    // sources
    for (const f of listFiles(p.root)) {
      zip.file(f.path, f.content);
    }

    // starters
    const starters = p.starters.slice();
    const genPumlPaths: string[] = [];

    for (const starter of starters) {
      const puml = await this.buildPumlFromStarter(starter);
      const outPath = `gen-puml/${starter.replace(/\.starttpuml$/i, '.puml').split('/').pop()}`;
      zip.file(outPath, puml);
      genPumlPaths.push(outPath);

      const svg = await renderSvg(puml);
      const svgOut = `export/svg/${outPath.replace(/^gen-puml\//, '').replace(/\.puml$/i, '.svg')}`;
      zip.file(svgOut, svg);
    }

    zip.file('export/manifest.json', JSON.stringify({
      project: p.name, starters, generated: genPumlPaths
    }, null, 2));

    return zip.generateAsync({ type: 'blob' });
  }

  async buildPumlFromStarter(starterPath: string): Promise<string> {
    const starter = this.read(starterPath);
    if (!starter) throw new Error(`Starter introuvable: ${starterPath}`);

    const root = looksLikeTpuml(starter) ? transpileStarterTpuml(starter) : starter;
    const visited = new Set<string>();

    const inlineRec = (text: string, baseDir: string, src: string | undefined): string => {
      return text.split(/\r?\n/).map(line => {
        const m = line.match(/^\s*!include\s+(.+)\s*$/);
        if (!m) return line;

        // ⚠️ NE SURTOUT PAS re-joindre avec baseDir : resolveIncludePath l’a déjà fait
        const path = this.resolveIncludePath(m[1], baseDir, src);

        console.log(path);

        if (visited.has(path)) return ''; // anti-boucle
        visited.add(path);

        const inc = this.read(path);
        if (!inc) throw new Error(`Include introuvable: ${path}`);

        const transpiled = looksLikeTpuml(inc) ? transpileTpuml(inc) : inc;
        return inlineRec(transpiled, this.dirname(path), src);
      }).join('\n');
    };
        let src = this.project()?.src?.path;
    if (this.project()?.root?.path && this.project()?.src?.path) {
      src = this.project()?.root?.path + '/' + this.project()?.src?.path;
    }
    return inlineRec(root, this.dirname(starterPath), src);
  }

  // WorkspaceService
  private normalizePath(path: string): string {
    const parts = path.split('/').filter(Boolean);
    const stack: string[] = [];
    for (const p of parts) {
      if (p === '.') continue;
      if (p === '..') { stack.pop(); continue; }
      stack.push(p);
    }
    return stack.join('/');
  }

  private dirname(path: string): string {
    const i = path.lastIndexOf('/');
    return i === -1 ? '' : path.slice(0, i);
  }

  /** Mappe un include vers un chemin *projet* sans jamais le re-préfixer ensuite. */
  private resolveIncludePath(relRaw: string, baseDir: string, src: string | undefined): string {
    // retire guillemets éventuels
    let rel = relRaw.trim().replace(/^"(.*)"$/, '$1');
    const lower = rel.toLowerCase();

    console.log(baseDir)
    console.log(src)
    // 1) /... = racine du projet (source-tpuml)
    if (rel.startsWith('/')) {
      return this.normalizePath(`source-tpuml/${rel.slice(1)}`);
    }

    // 2) Chemin explicitement ancré racine => on n'y touche pas
    if (lower.startsWith('source-tpuml/')) {
      return this.normalizePath(rel);
    }

    // 3) Alias "assets/" => racine/source-tpuml/assets/...
    if (lower.startsWith('assets/')) {
      return this.normalizePath(`source-tpuml/${rel}`);
    }

    // 4) Si relatif au fichier incluant
    if (lower.startsWith('./')) {
      return this.normalizePath(baseDir ? `${baseDir}/${rel}` : rel);
    }
    // 5) Sinon : on ne change rien
    return this.normalizePath(src ? `${src}/${rel}` : rel);
  }

  async diagnoseStarter(starterPath: string): Promise<{ puml: string; missingIncludes: string[] }> {
    const starter = this.read(starterPath);
    if (!starter) throw new Error(`Starter introuvable: ${starterPath}`);

    const root = looksLikeTpuml(starter) ? transpileStarterTpuml(starter) : starter;
    const visited = new Set<string>();
    const missing: string[] = [];

    const inlineRec = (text: string, baseDir: string, src: string | undefined): string => {
      return text.split(/\r?\n/).map(line => {
        const m = line.match(/^\s*!include\s+(.+)\s*$/);
        if (!m) return line;

        const path = this.resolveIncludePath(m[1], baseDir, src);

        if (visited.has(path)) return '';
        visited.add(path);

        const inc = this.read(path);
        if (!inc) {
          missing.push(path);
          return `'' !! include manquant: ${path}`;
        }

        const content = looksLikeTpuml(inc) ? transpileTpuml(inc) : inc;
        return inlineRec(content, this.dirname(path), src);
      }).join('\n');
    };

    let src = this.project()?.src?.path;
    if (this.project()?.root?.path && this.project()?.src?.path) {
      src = this.project()?.root?.path + '/' + this.project()?.src?.path;
    }


    const puml = inlineRec(root, this.dirname(starterPath), src);
    return { puml, missingIncludes: missing };
  }

}
