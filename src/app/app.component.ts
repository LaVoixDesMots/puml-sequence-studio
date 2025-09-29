import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImporterComponent } from './components/importer/importer.component';
import { FileTreeComponent } from './components/file-tree/file-tree.component';
import { PreviewComponent } from './components/preview/preview.component';
import { WorkspaceService } from './services/workspace.service';
import { RendererService } from './services/renderer.service';
import { ExampleGalleryComponent } from './components/example-gallery/example-gallery.component';
import { ProjectPickerComponent } from './components/project-picker/project-picker.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ImporterComponent, FileTreeComponent, PreviewComponent, ExampleGalleryComponent, ProjectPickerComponent],
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
    a.download = `${this.ws.getCurrentProject()}_bundle.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  onFileSelected(path: string) {
  // Toujours noter la sélection courante (utile pour la Preview / autres composants)
  // this.ws.select(path);

  // Cas 1 : SVG → rien à faire d’autre, la Preview lit via le path sélectionné.
  if (path.toLowerCase().endsWith('.svg')) {
    return;
  }

  // Cas 2 : starter → compose PUML + génère SVG + enregistre + sélectionne SVG
  if (path.toLowerCase().endsWith('.starttpuml')) {
    this.ws.select(path);
    this.generateFromStarter(path).catch(err => {
      console.error(err);
      alert(`Erreur génération depuis starter:\n${(err as Error).message || err}`);
      // si erreur, ne garde pas l’ancien SVG affiché
      this.ws.select(null);
    });
    return;
  }

  // Cas 3 : puml → génère le SVG + enregistre + sélectionne SVG
  if (path.toLowerCase().endsWith('.puml')) {
    this.generateFromPuml(path).catch(err => {
      console.error(err);
      alert(`Erreur génération SVG:\n${(err as Error).message || err}`);
      this.ws.select(null);
    });
    return;
  }

  // Cas 4 : tpuml “fragment” → rien de spécial (tu pourrais à terme ouvrir un éditeur)
  // this.editorService.open(path) ... si tu as un éditeur plus tard
}

/** Génère PUML + SVG à partir d’un .starttpuml, stocke dans le workspace et sélectionne le SVG. */
private async generateFromStarter(starterPath: string) {
  // 1) composition PUML
  const puml = await this.ws.buildPumlFromStarter(starterPath);

  // 2) chemins de sortie
  const baseName = starterPath.split('/').pop()!.replace(/\.starttpuml$/i, '');
  const outPumlPath = `gen-puml/${baseName}.puml`;
  const outSvgPath  = `export/svg/${baseName}.svg`;

  // 3) enregistre le .puml généré
  this.ws.upsert(outPumlPath, puml);

  // 4) rend le SVG et enregistre
  const svg = await this.renderer.renderPlantUmlToSvg(puml);
  this.ws.upsert(outSvgPath, svg);

  // 5) affiche le SVG généré
  // this.ws.select(outSvgPath);
}

/** Génère un SVG à partir d’un .puml existant, stocke et sélectionne le SVG. */
private async generateFromPuml(pumlPath: string) {
  const puml = this.ws.read(pumlPath);
  if (!puml) throw new Error(`PUML introuvable: ${pumlPath}`);

  const baseName = pumlPath.split('/').pop()!.replace(/\.puml$/i, '');
  const outSvgPath = `export/svg/${baseName}.svg`;

  const svg = await this.renderer.renderPlantUmlToSvg(puml);
  this.ws.upsert(outSvgPath, svg);

  // this.ws.select(outSvgPath);
}


}
