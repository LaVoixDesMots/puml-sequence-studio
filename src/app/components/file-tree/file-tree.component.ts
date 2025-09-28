import { Component, Input, Output, EventEmitter, computed, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-file-tree',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './file-tree.component.html',
  styleUrls: ['./file-tree.component.css']
})
export class FileTreeComponent {
  @Input({ required: true }) files: string[] = [];
  @Input() selected: string | null = null;
  @Output() pick = new EventEmitter<string>();

  trackByPath = (_: number, p: string) => p;
}
