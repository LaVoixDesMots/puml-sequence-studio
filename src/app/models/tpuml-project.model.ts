// src/app/models/tpuml-project.model.ts

import { DirNode } from "./files.model";

/** Extensions gérées côté T-PUML */
export type TpuKind = 'starttpuml' | 'tpuml' | 'puml' | 'svg' | 'other';

export interface TpuManifest {
  title?: string;
  description?: string;
  version?: string;
  // tu peux ajouter: authors, createdAt, etc.
}

/** Fichier typé T-PUML « enrichi » */
export interface TpuFile {
  kind: TpuKind;       // déduit de l’extension
  name: string;        // basename, ex: demo.starttpuml
  path: string;        // chemin relatif depuis la racine projet, ex: source-tpuml/starter/demo.starttpuml
  content: string | Uint8Array;
}

/** Dossiers importants d’un projet T-PUML */
export interface TpuRoots {
  /** Racine logique du projet (contient les trois sous-dossiers) */
  root: DirNode;
  /** Dossier source (.starttpuml, .tpuml) : /source-tpuml */
  source: DirNode | null;
  /** Dossier génération (.puml) : /gen-puml */
  gen: DirNode | null;
  /** Dossier export (.svg) : /export */
  export: DirNode | null;
}

/** Projet T-PUML : vue haut-niveau pour l’app */
export interface TpuProject {
  id: string;                  // identifiant stable (ex: slug du nom)
  name: string;                // nom affichage
  manifest?: TpuManifest;

  roots: TpuRoots;

  /** Index rapides par chemin relatif */
  files: {
    all: Map<string, TpuFile>;
    source: Map<string, TpuFile>;  // .starttpuml/.tpuml
    puml: Map<string, TpuFile>;    // .puml
    svg: Map<string, TpuFile>;     // .svg
  };

  /** Indicateurs utilitaires */
  validation: {
    hasSourceRoot: boolean;
    hasGenRoot: boolean;
    hasExportRoot: boolean;
  };
}
