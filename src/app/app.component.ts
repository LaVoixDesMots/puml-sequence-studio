import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImporterComponent } from './components/importer/importer.component';
import { FileTreeComponent } from './components/file-tree/file-tree.component';
import { PreviewComponent } from './components/preview/preview.component';
import { WorkspaceService } from './services/workspace.service';
import { RendererService } from './services/renderer.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ImporterComponent, FileTreeComponent, PreviewComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  ws = inject(WorkspaceService);
  renderer = inject(RendererService);

  async onImport(files: FileList) {
    for (const f of Array.from(files)) {
      await this.ws.importAny(f);
    }
  }

  pick(p: string) { this.ws.select(p); }

  async exportAll() {
    const blob = await this.ws.exportZip((puml) => this.renderer.renderPlantUmlToSvg(puml));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${this.ws.projectName()}_bundle.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
