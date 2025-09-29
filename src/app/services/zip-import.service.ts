// src/app/services/zip-import.service.ts
import { Injectable } from '@angular/core';
import JSZip from 'jszip';
import { DirNode, FileNode } from '../models/files.model';

export type ImportedProject = {
  name: string;
  root: DirNode;       // racine logique de ton projet (source-tpuml/, gen-puml/, export/)
  files: Map<string, FileNode>;
};

@Injectable({ providedIn: 'root' })
export class ZipImportService {

  /** Détecte le plus long préfixe commun du ZIP pour “désancrer” l’arborescence */
  private longestCommonPrefix(paths: string[]): string {
    if (!paths.length) return '';
    const segs = paths[0].split('/');
    let idx = segs.length;
    for (let i = 1; i < paths.length; i++) {
      const cur = paths[i].split('/');
      let j = 0;
      while (j < idx && j < cur.length && cur[j] === segs[j]) j++;
      idx = j;
      if (idx === 0) break;
    }
    return segs.slice(0, idx).join('/');
  }

  /** Crée / récupère un dossier dans la Map, en créant tous les intermédiaires */
  private ensureDir(root: DirNode, dirPath: string): DirNode {
    const parts = dirPath.split('/').filter(Boolean);
    let cur = root;
    let acc = '';
    for (const p of parts) {
      acc = acc ? `${acc}/${p}` : p;
      let child = cur.children.get(p);
      if (!child) {
        child = { type: 'dir', name: p, path: acc, children: new Map() } as DirNode;
        cur.children.set(p, child);
      }
      if (child.type !== 'dir') {
        // collision improbable : un fichier porte le nom du dossier → on l’écrase en dossier
        child = { type: 'dir', name: p, path: acc, children: new Map() } as DirNode;
        cur.children.set(p, child);
      }
      cur = child;
    }
    return cur;
  }

  async importZip(file: File): Promise<ImportedProject> {
    const zip = await JSZip.loadAsync(file);
    const entries = Object.values(zip.files);

    // 1) Récupère toutes les entrées fichiers (ignore les dossiers “.dir” du ZIP)
    const fileEntries = entries.filter(e => !e.dir);

    // 2) On normalise les chemins et on retire un éventuel préfixe racine commun
    const fullPaths = fileEntries.map(e => e.name.replace(/^\.?\/+/, '').replace(/\\/g, '/'));
    const prefix = this.longestCommonPrefix(fullPaths);
    const strip = (p: string) =>
      prefix ? p.replace(new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/'), '') : p;

    const root: DirNode = { type: 'dir', name: '', path: '', children: new Map() };
    const files = new Map<string, FileNode>();

    // 3) Insère dossiers + fichiers dans l’arbre
    for (const e of fileEntries) {
      const clean = strip(e.name.replace(/^\.?\/+/, '').replace(/\\/g, '/'));
      if (!clean) continue; // sécurité

      const dir = clean.includes('/') ? clean.slice(0, clean.lastIndexOf('/')) : '';
      const base = clean.split('/').pop()!;
      // Crée les dossiers intermédiaires
      const parent = dir ? this.ensureDir(root, dir) : root;

      // Charge le contenu (texte pour nos types)
      const isText = /\.(tpuml|starttpuml|puml|svg|txt|md|json)$/i.test(base);
      const content = isText ? await zip.file(e.name)!.async('text') : await zip.file(e.name)!.async('uint8array');

      const node: FileNode = {
        type: 'file',
        name: base,
        path: clean,
        content
      };
      parent.children.set(base, node);
      files.set(clean, node);
    }

    // 4) Déduis un nom de projet simple (sans espaces/extension)
    const guessed = file.name.replace(/\.zip$/i, '').replace(/[^\w.-]+/g, '-');
    return { name: guessed || 'import', root, files };
  }
}
