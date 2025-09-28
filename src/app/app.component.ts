// src/app/app.component.ts
import { Component, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PreviewComponent } from './components/preview/preview.component';
import { ProjectPickerComponent } from './components/project-picker/project-picker.component';
import { TpumlManifestService, GeneratedItem } from './services/tpuml-manifest.service';
import { Observable, Subject } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, PreviewComponent, ProjectPickerComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title: string = "puml-sequence-studio"
  items$: Subject<GeneratedItem[]> = new Subject();
  current?: GeneratedItem;

  constructor(private manifest: TpumlManifestService, private destroyRef: DestroyRef) {
    this.manifest.items$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(items => {
        this.current = undefined;
        this.items$.next(items);
      });


    // // ⬅️ reset selection when project changes
    // this.manifest.currentProject$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
    //   this.current = undefined;
    // });
  }
  
  select(it: GeneratedItem) { this.current = it; }

  get currentSvgUrl() { return this.current?.svg ?? null; } // null if none
}
