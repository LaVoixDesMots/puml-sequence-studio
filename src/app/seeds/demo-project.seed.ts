import { TpuProject, upsertFile, createEmptyProject, ensureDir } from '../models/tpuml-project';

/** Construit un projet démo complet et prêt à l’emploi. */
export function createDemoProject(name: string = 'demo'): TpuProject {
  const p = createEmptyProject(name);

  const src = ensureDir(p.root, 'source-tpuml');

  // --- fichiers de styles ---
  upsertFile(src, 'styles/sequence.base.tpuml', `
' Pas de @startuml ici : c’est un include
' Réglages basiques
skinparam BackgroundColor white
skinparam Shadowing false
skinparam ArrowColor #181818
skinparam SequenceMessageAlign center
skinparam SequenceLifeLineBorderColor #181818
skinparam SequenceLifeLineBackgroundColor #E2E2F0
skinparam ParticipantBorderColor #181818
skinparam ParticipantBackgroundColor #E2E2F0
skinparam ParticipantFontColor #000000
`);

  // --- “types” (déclarations typées T-PUML) ---
  upsertFile(src, 'library/types.tpuml', `
' Déclarations typées (T-PUML). Seront transpilées en participants/actor/database…
type Actor   A_UI      "User"
type Service S_API     "API" <<service>>
type DB      DB_Main   "DB"
`);

  // --- (optionnel) autres fragments réutilisables ---
  upsertFile(src, 'fragments/ui/show_home.tpuml', `
' Exemple de fragment (PlantUML pur ou macros si tu veux)
' Ici on garde simple pour la démo
' Utilisation : juste un include si besoin
`);

  // --- starter principal (.starttpuml = point d’entrée) ---
  upsertFile(src, 'starter/demo.starttpuml', `
@starttpuml
' Includes ROOT-BASED → "/" = racine du workspace
include styles/sequence.base.tpuml
include library/types.tpuml

title Démo

A_UI -> S_API : GET /home
S_API -> DB_Main : SELECT * FROM stuff
DB_Main --> S_API : rows
S_API --> A_UI : 200 OK

@endtpuml
`);

  // déclare ce starter comme point d’entrée
  p.starters = ['source-tpuml/starter/demo.starttpuml'];
  p.src = src;
  return p;
}

/** Ajoute le même contenu de démo à un projet existant (au cas où). */
export function populateDemoProject(p: TpuProject): void {
  const demo = createDemoProject(p.name);
  // copie “bête” des fichiers dans la racine existante
  for (const path of [
    'styles/sequence.base.tpuml',
    'library/types.tpuml',
    'fragments/ui/show_home.tpuml',
    'starter/demo.starttpuml',
  ]) {
    const content = demo.root.children.get('source-tpuml') // traverse rapide
      ? (function get(d: any, pth: string): string|undefined {
          const parts = pth.split('/'); let cur: any = demo.root;
          for (const seg of parts) {
            if (!seg) continue;
            const child = cur.children.get(seg);
            if (!child) return;
            cur = child;
          }
          return cur.type === 'file' ? cur.content : undefined;
        })(demo.root, path)
      : undefined;
    if (content != null) upsertFile(p.root, path, content);
  }
  p.starters = Array.from(new Set([...(p.starters ?? []), ...demo.starters]));
}
