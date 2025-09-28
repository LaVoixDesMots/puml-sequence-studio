import { Injectable, signal, effect } from '@angular/core';
import JSZip from 'jszip';
import { StorageService } from './storage.service';
import { dirname, looksLikeTpuml, normalizePath, transpileStarterTpuml, transpileTpuml } from './tpuml-core';

export interface FileEntry { path: string; content: string; } // UTF-8

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  projectName = signal<string>('exemple');
  files = signal<Map<string,string>>(new Map());    // path -> content
  selected = signal<string | null>(null);

  constructor(private store: StorageService) {
    const snap = store.load();
    if (snap) {
      this.projectName.set(snap.projectName);
      this.files.set(new Map(Object.entries(snap.files)));
      this.selected.set(snap.selected ?? null);
    }
    // autosave
    effect(() => {
      const snap = {
        projectName: this.projectName(),
        files: Object.fromEntries(this.files()),
        selected: this.selected() ?? undefined
      };
      this.store.save(snap);
    });
  }

  listPaths(): string[] {
    return Array.from(this.files().keys()).sort();
  }
  read(path: string): string | undefined {
    return this.files().get(path);
  }
  upsert(path: string, content: string) {
    const m = new Map(this.files());
    m.set(normalizePath(path), content);
    this.files.set(m);
  }
  remove(path: string) {
    const m = new Map(this.files());
    m.delete(path);
    this.files.set(m);
    if (this.selected() === path) this.selected.set(null);
  }
  select(path: string | null) { this.selected.set(path); }

  /** Import de fichiers individuels ou d’un zip */
  async importAny(file: File) {
    if (file.name.toLowerCase().endsWith('.zip')) {
      await this.importZip(file);
    } else {
      const text = await file.text();
      const path = `source-tpuml/${file.name}`; // défaut
      this.upsert(path, text);
    }
  }

  async importZip(zipFile: File) {
    const zip = await JSZip.loadAsync(zipFile);
    const entries = Object.values(zip.files);
    for (const e of entries) {
      if (e.dir) continue;
      // NE PAS sortir des dossiers projet
      if (!/(\.tpuml|\.starttpuml|\.puml|\.svg|\.txt|\.md)$/i.test(e.name)) continue;
      const content = await e.async('string');
      const path = normalizePath(e.name.replace(/^(\.\/)+/, ''));
      this.upsert(path, content);
    }
  }

  /** Export: re-génère PUML + SVG à partir des .starttpuml + .tpuml */
  async exportZip(renderPlantUmlToSvg: (puml: string)=>Promise<string>): Promise<Blob> {
    const zip = new JSZip();
    const files = this.files();

    // 1) recopier toutes les sources tpuml
    for (const [path, content] of files) {
      zip.file(path, content);
    }

    // 2) générer .puml pour chaque .starttpuml (ou pour tout .tpuml si voulu)
    const starters = Array.from(files.keys()).filter(p => p.endsWith('.starttpuml'));
    const genPumlPaths: string[] = [];

    for (const starter of starters) {
      const puml = await this.buildPumlFromStarter(starter);
      const outPath = `gen-puml/${starter.replace(/\.starttpuml$/i, '.puml').split('/').pop()}`;
      zip.file(outPath, puml);
      genPumlPaths.push(outPath);

      // 3) SVG
      const svg = await renderPlantUmlToSvg(puml);
      const svgOut = `export/svg/${outPath.replace(/^gen-puml\//, '').replace(/\.puml$/i, '.svg')}`;
      zip.file(svgOut, svg);
    }

    // 4) un petit manifest d’export
    zip.file('export/manifest.json', JSON.stringify({
      project: this.projectName(),
      starters,
      generated: genPumlPaths
    }, null, 2));

    return zip.generateAsync({ type: 'blob' });
  }

  /** Compose un PUML complet (includes inlinés) depuis un starter */
  async buildPumlFromStarter(starterPath: string): Promise<string> {
    const starter = this.read(starterPath);
    if (!starter) throw new Error(`Starter introuvable: ${starterPath}`);

    // 1) transpile le starter si c’est du TP-UML (ou impose ta règle)
    const root = looksLikeTpuml(starter) ? transpileStarterTpuml(starter) : starter;

    // 2) inline includes en lisant dans la Map (pas HTTP)
    const includeRe = /^\s*!include\s+(.+)\s*$/m;
    const visited = new Set<string>();

    const inlineRec = (text: string, baseDir: string): string => {
      return text.split(/\r?\n/).map(line => {
        const m = line.match(/^\s*!include\s+(.+)\s*$/);
        if (!m) return line;
        let rel = m[1].trim().replace(/^"(.*)"$/, '$1');
        if (rel.startsWith('/')) rel = rel.slice(1);
        const path = normalizePath(baseDir ? `${baseDir}/${rel}` : rel);
        if (visited.has(path)) return ''; // anti-boucle
        visited.add(path);
        const inc = this.read(path);
        if (!inc) throw new Error(`Include introuvable: ${path}`);
        const transpiled = looksLikeTpuml(inc) ? transpileTpuml(inc) : inc;
        const newBase = dirname(path);
        return inlineRec(transpiled, newBase);
      }).join('\n');
    };

    const base = dirname(starterPath);
    const composed = inlineRec(root, base);
    return composed;
  }

  /** Diagnostique un starter : retourne PUML généré + liste des includes manquants */
  async diagnoseStarter(starterPath: string): Promise<{ puml: string; missingIncludes: string[] }> {
    const starter = this.read(starterPath);
    if (!starter) throw new Error(`Starter introuvable: ${starterPath}`);

    // transpile si nécessaire
    const { looksLikeTpuml, transpileTpuml } = await import('./tpuml-core'); // si déjà importé en haut, utilise-le directement
    const root = looksLikeTpuml(starter) ? transpileTpuml(starter) : starter;

    // inlining “dry-run” pour lister les manquants et produire le PUML complet
    const visited = new Set<string>();
    const missing: string[] = [];
    const includeRe = /^\s*!include\s+(.+)\s*$/;

    const inlineRec = (text: string, baseDir: string): string => {
      return text.split(/\r?\n/).map(line => {
        const m = line.match(includeRe);
        if (!m) return line;

        let rel = m[1].trim().replace(/^"(.*)"$/, '$1');
        if (rel.startsWith('/')) rel = rel.slice(1); // racine du workspace
        const path = normalizePath(baseDir ? `${baseDir}/${rel}` : rel);

        if (visited.has(path)) return '';
        visited.add(path);

        const inc = this.read(path);
        if (!inc) {
          missing.push(path);
          return `'' !! include manquant: ${path}`;
        }
        const content = looksLikeTpuml(inc) ? transpileTpuml(inc) : inc;
        return inlineRec(content, dirname(path));
      }).join('\n');
    };

    const base = dirname(starterPath);
    const puml = inlineRec(root, base);
    return { puml, missingIncludes: missing };
  }
}
