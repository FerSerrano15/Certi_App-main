import { Component, inject, signal, computed, OnInit, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { FichaRegistroService, FichaRegistro } from '../../core/services/ficha-registro.service';
import { PdfService } from '../../core/services/pdf.service';
import { EstandaresService, Estandar } from '../../core/services/estandares.service';
import { FichaRegistroPageComponent } from '../ficha-registro-page/ficha-registro-page.component';

type TabView = 'estandares' | 'mis-fichas';

@Component({
  selector: 'app-mis-fichas',
  standalone: true,
  imports: [CommonModule, FormsModule, FichaRegistroPageComponent],
  templateUrl: './mis-fichas.component.html',
  styleUrl: './mis-fichas.component.css',
})
export class MisFichasComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly fichaSvc = inject(FichaRegistroService);
  private readonly estandaresSvc = inject(EstandaresService);
  private readonly pdfSvc = inject(PdfService);

  /** Emite cuando se guarda una ficha nueva exitosamente */
  fichaGuardada = output<void>();

  // 'catalog' muestra las cartas de estándares y mis fichas; 'form' abre la Ficha de Registro del estándar seleccionado
  viewMode = signal<'catalog' | 'form'>('catalog');
  activeTab = signal<TabView>('estandares');

  loading = signal(true);
  estandares = signal<Estandar[]>([]);
  fichas = signal<FichaRegistro[]>([]);
  chosenEstandar = signal<Estandar | null>(null);
  downloadingId = signal<string | null>(null);
  searchQuery = signal<string>('');

  // Filtrado reactivo de estándares de competencia
  filteredEstandares = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const list = this.estandares();
    if (!q) return list;
    return list.filter(e =>
      e.codigo.toLowerCase().includes(q) ||
      e.nombre.toLowerCase().includes(q) ||
      (e.categoria && e.categoria.toLowerCase().includes(q))
    );
  });

  // Mapa rápido de fichas del usuario por estandar_id
  fichasByEstandarId = computed(() => {
    const map = new Map<string, FichaRegistro>();
    for (const f of this.fichas()) {
      map.set(f.estandar_id, f);
    }
    return map;
  });

  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    this.loading.set(true);
    try {
      const [estList, fichasList] = await Promise.all([
        this.estandaresSvc.list(),
        this.fichaSvc.listMine()
      ]);
      this.estandares.set(estList);
      this.fichas.set(fichasList);
    } catch (err) {
      console.error('Error cargando estándares o fichas:', err);
    } finally {
      this.loading.set(false);
    }
  }

  onSelectEstandar(e: Estandar) {
    this.chosenEstandar.set(e);
    this.viewMode.set('form');
  }

  backToCatalog() {
    this.viewMode.set('catalog');
    this.chosenEstandar.set(null);
  }

  async onFichaSaved() {
    await this.loadData();
    this.fichaGuardada.emit();
  }

  async verPdf(f: FichaRegistro, event?: Event) {
    if (event) event.stopPropagation();
    const token = this.auth.getToken();
    if (!token) return;
    this.downloadingId.set(f.id);
    try {
      const url = await this.pdfSvc.getFichaRegistroBlobUrlByFichaId(f.id, token);
      window.open(url, '_blank');
    } catch {
      // reintento disponible
    } finally {
      this.downloadingId.set(null);
    }
  }
}

