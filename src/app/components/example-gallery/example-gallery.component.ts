import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExampleCatalogService, ExampleEntry } from '../../services/example-catalog.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-example-gallery',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './example-gallery.component.html',
  styleUrls: ['./example-gallery.component.css']
})
export class ExampleGalleryComponent implements OnInit, OnDestroy {
  examples = signal<ExampleEntry[]>([]);
  busy = signal(false);
  message = signal<string | null>(null);
  sub?: Subscription;

  constructor(private catalog: ExampleCatalogService) {}

  ngOnInit() {
    this.sub = this.catalog.list().subscribe({
      next: ex => this.examples.set(ex),
      error: err => this.message.set(String(err))
    });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  importExample(ex: ExampleEntry) {
    this.busy.set(true); this.message.set(null);
    this.catalog.importExample(ex, ex.id).subscribe({
      next: () => { this.busy.set(false); this.message.set(`Exemple "${ex.title}" importé.`); },
      error: err => { this.busy.set(false); console.log(err); this.message.set(String(err)); }
    });
  }
}
