import { Component, inject, signal, computed, effect, input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { PdfService } from '../../core/services/pdf.service';
import {
  FichaRegistroService, FichaRegistroWithUser, FichaRegistroStatus,
} from '../../core/services/ficha-registro.service';

const STATUS_FILTERS: { value: FichaRegistroStatus | 'TODAS'; label: string }[] = [
  { value: 'TODAS',    label: 'Todas' },
  { value: 'enviada',  label: 'Enviadas' },
  { value: 'validada', label: 'Validadas' },
  { value: 'rechazada', label: 'Rechazadas' },
];

/** Vista admin "Solicitudes" — todas las fichas de registro enviadas, con su estado. */
@Component({
  selector: 'app-ficha-registro-admin',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ficha-registro-admin.component.html',
  styleUrl: './ficha-registro-admin.component.css',
})
export class FichaRegistroAdminComponent implements OnInit {
  private readonly svc = inject(FichaRegistroService);
  private readonly pdfSvc = inject(PdfService);
  private readonly auth = inject(AuthService);

  readonly statusFilters = STATUS_FILTERS;

  /** id de la ficha a resaltar/desplazar (viene de "Ver solicitud" en las notificaciones). */
  highlightId = input<string | null>(null);

  loading = signal(true);
  fichas = signal<FichaRegistroWithUser[]>([]);
  search = signal('');
  statusFilter = signal<FichaRegistroStatus | 'TODAS'>('TODAS');
  downloadingId = signal<string | null>(null);
  updatingId = signal<string | null>(null);
  highlighted = signal<string | null>(null);

  constructor() {
    // Cuando llega un highlightId (o cambian las fichas cargadas), nos
    // aseguramos de que los filtros no lo oculten, lo resaltamos y hacemos
    // scroll hasta su fila.
    effect(() => {
      const id = this.highlightId();
      const fichas = this.fichas();
      if (!id) return;
      if (!fichas.some(f => f.id === id)) return;

      this.statusFilter.set('TODAS');
      this.search.set('');
      this.highlighted.set(id);

      queueMicrotask(() => {
        document.getElementById('ficha-row-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      setTimeout(() => {
        if (this.highlighted() === id) this.highlighted.set(null);
      }, 4000);
    });
  }

  filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    return this.fichas().filter(f => {
      const matchesStatus = status === 'TODAS' || f.status === status;
      const matchesQuery = !q
        || (f.users?.full_name ?? '').toLowerCase().includes(q)
        || (f.users?.email ?? '').toLowerCase().includes(q)
        || f.estandar_codigo.toLowerCase().includes(q)
        || f.estandar_nombre.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  });

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    this.fichas.set(await this.svc.listAll());
    this.loading.set(false);
  }

  async verPdf(f: FichaRegistroWithUser) {
    const token = this.auth.getToken();
    if (!token) return;
    this.downloadingId.set(f.id);
    try {
      const url = await this.pdfSvc.getFichaRegistroBlobUrlByFichaId(f.id, token);
      window.open(url, '_blank');
    } catch {
      // silencioso: el admin puede reintentar
    } finally {
      this.downloadingId.set(null);
    }
  }

  async changeStatus(f: FichaRegistroWithUser, status: 'validada' | 'rechazada') {
    if (status === f.status) return;
    this.updatingId.set(f.id);
    const ok = await this.svc.updateStatus(f.id, status);
    if (ok) {
      this.fichas.update(list => list.map(x => x.id === f.id ? { ...x, status } : x));
    }
    this.updatingId.set(null);
  }

  statusLabel(status: FichaRegistroStatus): string {
    return { borrador: 'Borrador', enviada: 'Enviada', validada: 'Validada', rechazada: 'Rechazada' }[status];
  }
}
