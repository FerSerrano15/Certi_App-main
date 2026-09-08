import { Component, inject, signal, OnInit, OnDestroy, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EstandaresService, Estandar } from '../../core/services/estandares.service';

/**
 * Buscador de estándares (código/nombre) reutilizable. Emite `selected`
 * cuando el usuario elige uno de la lista.
 */
@Component({
  selector: 'app-estandar-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './estandar-picker.component.html',
  styleUrl: './estandar-picker.component.css',
})
export class EstandarPickerComponent implements OnInit, OnDestroy {
  private readonly svc = inject(EstandaresService);

  selected = output<Estandar>();

  query = signal('');
  results = signal<Estandar[]>([]);
  loading = signal(false);
  searched = signal(false);

  private debounceHandle: ReturnType<typeof setTimeout> | null = null;

  async ngOnInit() {
    await this.search('');
  }

  ngOnDestroy() {
    if (this.debounceHandle) clearTimeout(this.debounceHandle);
  }

  onQueryChange(value: string) {
    this.query.set(value);
    if (this.debounceHandle) clearTimeout(this.debounceHandle);
    this.debounceHandle = setTimeout(() => this.search(value), 300);
  }

  private async search(q: string) {
    this.loading.set(true);
    this.results.set(await this.svc.list(q.trim() || undefined));
    this.searched.set(true);
    this.loading.set(false);
  }

  pick(e: Estandar) {
    this.selected.emit(e);
  }
}
