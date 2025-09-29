import { Component, OnDestroy, effect, signal, computed, inject, EffectRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { WorkspaceService } from '../../services/workspace.service';
import { RendererService } from '../../services/renderer.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-preview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './preview.component.html',
  styleUrls: ['./preview.component.css']
})
export class PreviewComponent implements OnDestroy {
  private ws = inject(WorkspaceService);
  private renderer = inject(RendererService);
  private sanitizer = inject(DomSanitizer);

  // UI state
  loading = signal(false);
  error = signal<string | null>(null);
  safeSvg = signal<SafeHtml | null>(null);
  generatedPuml = signal<string>('');   // pour debug
  diagMissing = signal<string[]>([]);   // includes manquants

  title = computed(() => this.ws.selected() ?? 'Aucun fichier');
  private sub?: Subscription;
  private stopEffect?: (EffectRef) | undefined;

  constructor() {
    // this.sub = this.ws.changes$.subscribe(() => {
    //   // quand le projet courant change :
    //   // if (!this.loading()) {
    //   //   this.safeSvg.set(null);             // reset (évite l’ancien affichage)
    //   //   this.error.set(null);
    //   // }
    // });

    effect(async () => {
      const sel = this.ws.selected();
      // reset UI state
      this.loading.set(false);
      this.error.set(null);
      this.safeSvg.set(null);
      this.generatedPuml.set('');
      this.diagMissing.set([]);
      

      if (!sel || !sel.endsWith('.starttpuml')) return;

      this.loading.set(true);
      try {
        // 1) diagnostic includes
        const diag = await this.ws.diagnoseStarter(sel);
        this.diagMissing.set(diag.missingIncludes);
        this.generatedPuml.set(diag.puml);  // on montre ce qui part au renderer

        if (diag.missingIncludes.length) {
          throw new Error(
            `Include(s) introuvable(s):\n- ${diag.missingIncludes.join('\n- ')}`
          );
        }
        // this.generatedPuml.set(puml);  // on montre ce qui part au renderer
        // 2) rendu
        const svg = await this.renderer.renderPlantUmlToSvg(diag.puml);
        if (!svg || !svg.trim()) {
          throw new Error('Le renderer a retourné un SVG vide.');
        }
        // garde-fou : PlantUML renvoie parfois un message texte au lieu de SVG
        if (!/^<svg[\s\S]*<\/svg>\s*$/i.test(svg.trim())) {
          throw new Error('Sortie inattendue (pas un SVG). Voir console & “PUML généré”.');
        }

        this.safeSvg.set(this.sanitizer.bypassSecurityTrustHtml(svg));
      } catch (e: any) {
        console.error('[Preview error]', e);
        this.error.set(e?.message ?? String(e));
        this.safeSvg.set(null);
      } finally {
        this.loading.set(false);
      }
    }, { allowSignalWrites: true });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
