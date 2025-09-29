import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { WorkspaceService } from '../../services/workspace.service';
import { createDemoProject } from '../../seeds/demo-project.seed';

@Component({
  selector: 'app-project-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './project-picker.component.html',
  styleUrls: ['./project-picker.component.css']
})
export class ProjectPickerComponent implements OnInit, OnDestroy {
  projects = signal<{ name: string; createdAt: number }[]>([]);
  current = signal<string | null>(null);
  message = signal<string | null>(null);

  private sub?: Subscription;

  constructor(private ws: WorkspaceService) { }

  ngOnInit(): void {
    this.refresh();
    this.sub = this.ws.changes$.subscribe(() => this.refresh());
    window.addEventListener('storage', this.onStorage);
  }
  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    window.removeEventListener('storage', this.onStorage);
  }
  private onStorage = () => this.refresh();

  private refresh() {
    this.projects.set(this.ws.listProjects());
    this.current.set(this.ws.getCurrentProject());
  }

  onChangeProject(name: string) {
    if (!name) return;
    this.ws.setCurrentProject(name);
    this.current.set(name);
  }
  createProject() {
    const name = prompt('Nom du nouveau projet (alphanumériques, tirets, underscores) ?');
    if (!name) return;
    const clean = name.trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(clean)) {
      this.message.set("Nom invalide. Utilise lettres/chiffres/_/-");
      return;
    }
    const exists = this.ws.listProjects().some(p => p.name === clean);
    if (exists && !confirm('Ce projet existe déjà. Le remplacer ?')) return;

    // crée un projet DEMO prêt à l’emploi
    const proj = createDemoProject(clean);   // <-- seed complet
    this.ws.upsertProject(proj);
    this.ws.setCurrentProject(clean);
    this.refresh();
  }
  deleteCurrent() {
    const name = this.current();
    if (!name) return;
    if (!confirm(`Supprimer le projet "${name}" et tous ses fichiers ?`)) return;
    this.ws.removeProject(name);
    this.refresh();
  }
}
