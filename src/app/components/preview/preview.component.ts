import { CommonModule } from '@angular/common';
import { Component, DestroyRef, effect, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-preview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './preview.component.html',
  styleUrls: ['./preview.component.css'],
})
export class PreviewComponent {
  /** Chemin (relatif à /export) vers le SVG à afficher, ex: /export/svg/mon-diagramme.svg */
  svgPath = input<string | null>(null);

  /** Titre affiché au-dessus du rendu */
  title = input<string>('Preview');

  // état d’affichage
  safeHtml   = signal<SafeHtml | null>(null);
  downloadUrl = signal<string | null>(null);
  error      = signal<string | null>(null);
  loading    = signal<boolean>(false);

  private currentBlobUrl: string | null = null;
  private requestId = 0;

  constructor(
    private http: HttpClient,
    private sanitizer: DomSanitizer,
    private destroyRef: DestroyRef
  ) {
    // nettoyage du blobUrl quand le composant est détruit
    this.destroyRef.onDestroy(() => this.revokeBlob());

    // Réagit aux changements de svgPath()
    effect(() => {
      const path = this.svgPath();

      // reset immédiat pour éviter d’afficher l’ancien SVG en cas d’erreur
      this.revokeBlob();
      this.safeHtml.set(null);
      this.downloadUrl.set(null);
      this.error.set(null);
      if (!path) return;

      const rid = ++this.requestId;
      this.loading.set(true);

      this.http
        .get(path, { responseType: 'text' })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (svgText) => {
            // Si une nouvelle requête a démarré, on ignore le résultat précédent
            if (this.requestId !== rid) return;

            // Rendu inline (évite frame-src/object-src de ta CSP)
            this.safeHtml.set(this.sanitizer.bypassSecurityTrustHtml(svgText));

            // URL blob uniquement pour le bouton "Télécharger"
            const blob = new Blob([svgText], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            this.currentBlobUrl = url;
            this.downloadUrl.set(url);

            this.loading.set(false);
          },
          error: () => {
            if (this.requestId !== rid) return;
            this.safeHtml.set(null);
            this.downloadUrl.set(null);
            this.error.set('SVG introuvable ou inaccessible.');
            this.loading.set(false);
          },
        });
    }, { allowSignalWrites: true });
  }

  private revokeBlob() {
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }
  }
}
