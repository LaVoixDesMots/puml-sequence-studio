import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-importer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './importer.component.html',
  styleUrls: ['./importer.component.css']
})
export class ImporterComponent {
  @Output() files = new EventEmitter<FileList>();

  onFileChange(ev: Event) {
    const input = ev.target as HTMLInputElement;
    if (input.files && input.files.length) this.files.emit(input.files);
    input.value = '';
  }

  onDrop(ev: DragEvent) {
    ev.preventDefault();
    if (ev.dataTransfer?.files?.length) this.files.emit(ev.dataTransfer.files);
  }
  onDragOver(ev: DragEvent) { ev.preventDefault(); }
}
