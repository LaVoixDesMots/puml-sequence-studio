import { Injectable } from '@angular/core';

const KEY = 'tpuml-workspace.v1';

export interface WorkspaceSnapshot {
  projectName: string;
  files: Record<string, string>; // path -> content
  selected?: string;            // fichier sélectionné
}

@Injectable({ providedIn: 'root' })
export class StorageService {
  load(): WorkspaceSnapshot | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) as WorkspaceSnapshot : null;
    } catch {
      return null;
    }
  }
  save(snap: WorkspaceSnapshot) {
    localStorage.setItem(KEY, JSON.stringify(snap));
  }
  clear() {
    localStorage.removeItem(KEY);
  }
}
