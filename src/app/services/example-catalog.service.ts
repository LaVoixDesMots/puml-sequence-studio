import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, mergeMap, forkJoin, Observable, of } from 'rxjs';
import { WorkspaceService } from './workspace.service';
import { createEmptyProject, TpuProject, upsertFile } from '../models/tpuml-project';

export interface ExampleEntry {
  id: string;
  title: string;
  description?: string;
  thumbnail?: string;
  sourceBase: string;   // ex: assets/projects/exemple/source-tpuml
  exportBase: string;   // ex: assets/projects/exemple/export
  starterFiles: string[]; // ex: ["starter/demo.starttpuml"]
  sourceFiles: string[];  // chemins relatifs à sourceBase
  exportSvgs: string[];   // chemins relatifs à exportBase, ex: ["svg/exemple.svg"]
}

export interface ExampleManifest { examples: ExampleEntry[]; }

@Injectable({ providedIn: 'root' })
export class ExampleCatalogService {
  constructor(private http: HttpClient, private ws: WorkspaceService) {}

  list(): Observable<ExampleEntry[]> {
    return this.http.get<ExampleManifest>('assets/examples/examples.manifest.json')
      .pipe(map(m => m.examples));
  }

  importExample(example: ExampleEntry, newProjectName: string): Observable<void> {
    const srcGets = example.sourceFiles.map(rel =>
      this.http.get(`${example.sourceBase}/${rel}`, { responseType: 'text' })
        .pipe(map(text => ({ path: `source-tpuml/${rel}`, text })))
    );
    const svgGets = example.exportSvgs.map(rel =>
      this.http.get(`${example.exportBase}/${rel}`, { responseType: 'text' })
        .pipe(map(text => ({ path: `export/${rel}`, text })))
    );

    return forkJoin([srcGets.length ? forkJoin(srcGets) : of([]),
                     svgGets.length ? forkJoin(svgGets) : of([])]).pipe(
      mergeMap(([sources, svgs]) => {
        const proj: TpuProject = createEmptyProject(newProjectName);
        proj.starters = example.starterFiles.map(s => `source-tpuml/${s}`);

        for (const f of sources) upsertFile(proj.root, f.path, f.text);
        for (const s of svgs)   upsertFile(proj.root, s.path, s.text);

        this.ws.upsertProject(proj);
        this.ws.setCurrentProject(newProjectName);
        return of(void 0);
      })
    );
  }
}
