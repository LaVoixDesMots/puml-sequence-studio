import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TpumlManifestService, ProjectMeta } from '../../services/tpuml-manifest.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'project-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './project-picker.component.html',
  styleUrl: './project-picker.component.css'
})
export class ProjectPickerComponent {
  private svc = inject(TpumlManifestService);

  projects = signal<ProjectMeta[]>([]);
  selectedId = signal<string>('');
  desc = computed(() => this.projects().find(p => p.id === this.selectedId())?.description ?? '');

  constructor() {
    this.svc.projects$.subscribe(list => {
      this.projects.set(list);
      // sync sélection
      this.svc.currentProject$.subscribe(p => {
        if (p && p.id !== this.selectedId()) this.selectedId.set(p.id);
      });
    });
  }

  onChange(id: string) {
    this.selectedId.set(id);
    this.svc.setProject(id);
  }
}
