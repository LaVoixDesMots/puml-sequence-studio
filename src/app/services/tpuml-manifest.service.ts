import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, combineLatest, map, of, switchMap, tap } from 'rxjs';

export interface ProjectMeta {
  id: string;
  name: string;
  baseDir: string;      // ex: assets/projects/exemple
  description?: string;
}

export interface ProjectsIndex { projects: ProjectMeta[]; }

export interface GeneratedItem {
  id: string;           // identifiant local du diagramme
  title: string;        // titre à afficher
  svg: string;          // chemin relatif à /export (ex: svg/foo.svg OU projects/exemple/export/svg/foo.svg selon usage)
  starttpuml: string;   // chemin du starter (info)
}

@Injectable({ providedIn: 'root' })
export class TpumlManifestService {
  private http = inject(HttpClient);

  // Projet courant (persisté)
  private _projectId = new BehaviorSubject<string | null>(localStorage.getItem('tpuml.projectId'));

  // Index des projets
  projects$ = this.http.get<ProjectsIndex>('assets/projects/index.json').pipe(
    map(x => x.projects)
  );

  // Projet sélectionné (métadonnées)
  currentProject$ = combineLatest([this.projects$, this._projectId]).pipe(
    map(([list, id]) => list.find(p => p.id === id) ?? list[0] ?? null),
    tap(p => { if (p) localStorage.setItem('tpuml.projectId', p.id); })
  );

  /** Manifeste généré du projet courant */
  items$ = this.currentProject$.pipe(
    switchMap(p => {
      if (!p) return of<GeneratedItem[]>([]);
      // Le pipeline génère ce fichier:
      //   { baseDir }/export/manifest.json
      // avec [{ id,title, svg, starttpuml }]
      return this.http.get<GeneratedItem[]>(`${p.baseDir}/export/manifest.json`).pipe(
        // Remap en chemins publics (préfixés par baseDir), pour éviter les ambiguïtés
        map(items => items.map(it => ({
          ...it,
          svg: `${p.baseDir}/export/${it.svg}`
        })))
      );
    })
  );

  setProject(id: string) { this._projectId.next(id); }
}
