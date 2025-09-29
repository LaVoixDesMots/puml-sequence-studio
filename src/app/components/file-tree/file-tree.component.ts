import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnDestroy, OnInit, Output, Signal, computed, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { WorkspaceService } from '../../services/workspace.service';

export interface FileNode {
  name: string;
  path: string;           // chemin relatif dans le projet (ex: source-tpuml/starter/demo.starttpuml)
  isDir: boolean;
  children?: FileNode[];
}

function buildTree(paths: string[]): FileNode[] {
  // Racine virtuelle pour simplifier l’insertion
  const root: FileNode = { name: '', path: '', isDir: true, children: [] };

  // Cherche (ou crée) un dossier enfant sous un parent donné
  const ensureDir = (parent: FileNode, name: string, fullPath: string): FileNode => {
    const kids = parent.children!;
    let dir = kids.find(k => k.isDir && k.name === name);
    if (!dir) {
      dir = { name, path: fullPath, isDir: true, children: [] };
      kids.push(dir);
    }
    return dir;
  };

  for (const full of paths) {
    const parts = full.split('/').filter(Boolean);
    if (parts.length === 0) continue;

    let parent = root;
    let curPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLeaf = i === parts.length - 1;
      curPath = curPath ? `${curPath}/${part}` : part;

      if (isLeaf) {
        // fichier
        parent.children!.push({
          name: part,
          path: curPath,
          isDir: false
        });
      } else {
        // dossier (à créer si nécessaire)
        parent = ensureDir(parent, part, curPath);
      }
    }
  }

  // Tri: dossiers en premier, puis fichiers; ordre alphabétique
  const sortRec = (n: FileNode) => {
    if (!n.children) return;
    n.children.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    n.children.forEach(sortRec);
  };
  sortRec(root);

  return root.children!;
}


type OptionsShow = 'all'|'tpuml'|'start'|'puml'|'svg';

@Component({
  selector: 'app-file-tree',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './file-tree.component.html',
  styleUrls: ['./file-tree.component.css']
})
export class FileTreeComponent implements OnInit, OnDestroy {
  @Output() fileSelected = new EventEmitter<string>(); // émet le chemin relatif sélectionné

  // état local
  currentProject = signal<string | null>(null);
  tree = signal<FileNode[]>([]);
  expanded = signal<Set<string>>(new Set());  // chemins des dossiers ouverts
  selectedPath = signal<string | null>(null);
  message = signal<string | null>(null);

  // filtres rapides
  showOnly = signal<OptionsShow>('all');

  // vue filtrée
  filteredTree: Signal<FileNode[]> = computed(() => {
    const mode = this.showOnly();
    if (mode === 'all') return this.tree();
    const exts = {
      tpuml: ['.tpuml'],
      start: ['.starttpuml'],
      puml : ['.puml'],
      svg  : ['.svg'],
    }[mode];

    const filterNode = (n: FileNode): FileNode | null => {
      if (n.isDir) {
        const kids = (n.children || [])
          .map(filterNode)
          .filter((x): x is FileNode => !!x);
        return kids.length ? { ...n, children: kids } : null;
      } else {
        return exts.some(e => n.name.endsWith(e)) ? n : null;
      }
    };

    return this.tree()
      .map(filterNode)
      .filter((x): x is FileNode => !!x);
  });

  private sub?: Subscription;

  constructor(private ws: WorkspaceService) {}

  ngOnInit(): void {
    // init
    this.refresh();
    // se resynchroniser quand le workspace change (projet, fichiers…)
    this.sub = this.ws.changes$.subscribe(() => this.refresh());
    // multi-onglets
    window.addEventListener('storage', this.onStorage);
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    window.removeEventListener('storage', this.onStorage);
  }

  private onStorage = () => this.refresh();

  private refresh() {
    const proj = this.ws.getCurrentProject();
    this.currentProject.set(proj);

    if (!proj) {
      this.tree.set([]);
      this.message.set('Aucun projet sélectionné.');
      this.selectedPath.set(null);
      return;
    }

    const files = this.ws.listPaths();
    console.log(files);
    // Optionnel: ne montrer que ce qui nous intéresse
    // (laisse tout, le filtre est géré par "showOnly")
    const tree = buildTree(files);
    this.tree.set(tree);
    this.message.set(tree.length ? null : 'Ce projet ne contient aucun fichier.');
    // reset de la sélection si elle ne correspond plus
    const sel = this.selectedPath();
    if (sel && !files.includes(sel)) {
      this.selectedPath.set(null);
    }
  }

  toggle(node: FileNode) {
    if (!node.isDir) return;
    const s = new Set(this.expanded());
    if (s.has(node.path)) s.delete(node.path);
    else s.add(node.path);
    this.expanded.set(s);
  }

  isOpen(node: FileNode): boolean {
    return this.expanded().has(node.path);
  }

  select(node: FileNode) {
    if (node.isDir) {
      this.toggle(node);
      return;
    }
    this.selectedPath.set(node.path);
    this.fileSelected.emit(node.path);
  }

  // helpers d’icônes
  icon(node: FileNode): string {
    if (node.isDir) return this.isOpen(node) ? '📂' : '📁';
    if (node.name.endsWith('.starttpuml')) return '🚀';
    if (node.name.endsWith('.tpuml')) return '🧩';
    if (node.name.endsWith('.puml')) return '📐';
    if (node.name.endsWith('.svg')) return '🖼️';
    return '📄';
  }

  // ouverture rapide des sections racine
  expandRoots(prefixes: string[]) {
    const s = new Set(this.expanded());
    const walk = (nodes: FileNode[]) => {
      for (const n of nodes) {
        if (n.isDir && prefixes.some(p => n.path.startsWith(p))) {
          s.add(n.path);
          if (n.children) walk(n.children);
        }
      }
    };
    walk(this.tree());
    this.expanded.set(s);
  }

  onShowChange(target: EventTarget | null): void {
    this.showOnly.set(((target as HTMLSelectElement)?.value ?? 'all') as OptionsShow);
  }
}
