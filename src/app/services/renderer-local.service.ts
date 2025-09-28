import { Injectable } from '@angular/core';
import { cleanSvg } from './svg-core';

declare global {
  interface Window {
    cheerpjInit?: (opts?: any) => Promise<void>;
    cheerpjRunJar?: (jarPath: string, ...args: any[]) => Promise<any>;
    cheerpOSAddStringFile?: (path: string, content: string | Uint8Array) => Promise<void> | void;
    cjFileBlob?: (path: string) => Promise<Blob>;
  }
}

@Injectable()
export class LocalPlantUmlRenderer {
  private static _ready = false;
  private static _initPromise: Promise<void> | null = null;

  /** VFS path attendu par CheerpJ (mappe la racine du site) */
  private static jarVfsPath(): string {
    return '/app/assets/plantuml-jar/plantuml.jar';
  }

  private static normalizePuml(src: string): string {
    const s = src.trim();
    const hasStart = /@startuml/i.test(s);
    const hasEnd = /@enduml/i.test(s);
    if (hasStart && hasEnd) return s;
    return `@startuml\n${s}\n@enduml\n`;
  }

  static async ensureReady(): Promise<void> {
    if (this._ready) return;
    if (this._initPromise) { await this._initPromise; return; }

    this._initPromise = new Promise<void>((resolve, reject) => {
      try {
        const already = document.getElementById('cheerpj-loader');
        if (already && window.cheerpjInit) {
          window.cheerpjInit({ canvas: false }).then(() => { this._ready = true; resolve(); }, reject);
          return;
        }

        const s = document.createElement('script');
        s.id = 'cheerpj-loader';
        s.src = 'https://cjrtnc.leaningtech.com/4.2/loader.js';
        s.defer = true;

        s.addEventListener('load', async () => {
          try {
            if (!window.cheerpjInit) throw new Error('CheerpJ loader non disponible');
            await window.cheerpjInit({ canvas: false });
            this._ready = true;
            resolve();
          } catch (e) { reject(e as any); }
        }, { once: true });

        s.addEventListener('error', () => reject(new Error('Impossible de charger le loader CheerpJ CDN')), { once: true });
        document.head.appendChild(s);
      } catch (e) { reject(e as any); }
    });

    await this._initPromise;
  }

  static async render(pumlRaw: string): Promise<string> {
    await this.ensureReady();

    const runJar = window.cheerpjRunJar;
    const addStr = window.cheerpOSAddStringFile;
    const blobOf = window.cjFileBlob;

    if (!runJar) throw new Error('cheerpjRunJar indisponible');
    if (!addStr) throw new Error('cheerpOSAddStringFile indisponible (CheerpJ v3 requis)');
    if (!blobOf) throw new Error('cjFileBlob indisponible (CheerpJ v3 requis)');

    // 1) Prépare l’entrée PUML (avec garde @startuml/@enduml)
    const puml = this.normalizePuml(pumlRaw);
    const inStr = '/str/input.puml';
    await addStr(inStr, puml);

    // 2) Essaye d’abord de sortir dans /tmp (souvent RW), sinon /files
    const jar = this.jarVfsPath();
    const outCandidates = ['/files'];
    let lastError: any = null;

    for (const outDir of outCandidates) {
      try {
        // Verbose (-v) pour avoir des logs si jamais ça échoue
        await runJar(jar, '-tsvg', inStr, '-o', outDir);

        // --- remplace le bloc qui lit le SVG ---
        const outPath = `${outDir}/input.svg`;
        const blob = await blobOf(outPath);
        if (!blob) throw new Error(`Blob introuvable à ${outPath}`);

        let svgText = await blob.text();

        // 1) Si ce n’est pas manifestement du SVG, on vérifie si c’est du GZIP et on décompresse.
        if (!/\<svg[\s\S]*\>/.test(svgText)) {
          const ab = await blob.arrayBuffer();
          const u8 = new Uint8Array(ab);
          const isGzip = u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b;
          if (isGzip && 'DecompressionStream' in window) {
            const ds = new DecompressionStream('gzip');
            const decompressed = await new Response(new Blob([u8]).stream().pipeThrough(ds)).text();
            svgText = decompressed;
          }
        }
        console.log(svgText);

        // 2) Nettoyage entête XML/BOM/espaces avant le premier tag
        svgText = cleanSvg(svgText);
        console.log(svgText);

        // 3) Validation souple : on cherche une balise <svg ...> quelque part
        if (!/\<svg[\s\S]*\>/.test(svgText)) {
          throw new Error(`Fichier invalide à ${outPath} (taille ${svgText?.length ?? 0})`);
        }

        return svgText;

      } catch (e) {
        lastError = e;
        // log utile, mais pas intrusif
        // eslint-disable-next-line no-console
        console.warn('[PUML][CheerpJ] tentative échouée sur', outDir, e);
        // tente le dossier suivant
      }
    }

    // 3) Si on est ici, aucune des sorties n’a fonctionné
    console.error('[PUML][CheerpJ] JAR:', jar);
    console.error('[PUML][CheerpJ] Input (début):', puml.slice(0, 160));
    throw new Error('PlantUML a produit un résultat inattendu (aucun fichier de sortie en /tmp ni /files). Détail: ' + (lastError?.message || lastError));
  }

  
}
