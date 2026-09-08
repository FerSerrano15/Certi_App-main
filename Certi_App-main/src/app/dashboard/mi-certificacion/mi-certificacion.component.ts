import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { EstandarPickerComponent } from '../../shared/estandar-picker/estandar-picker.component';
import { ProcessWorkspaceComponent } from '../../shared/process-workspace/process-workspace.component';
import { SolicitudesService, Solicitud, SolicitudDetail } from '../../core/services/solicitudes.service';
import { Estandar } from '../../core/services/estandares.service';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';

type ViewMode = 'list' | 'new' | 'detail' | 'process';

const STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente', en_revision: 'En revisión', aprobada: 'Aprobada',
  rechazada: 'Rechazada', cancelada: 'Cancelada', completada: 'Completada',
};

@Component({
  selector: 'app-mi-certificacion',
  standalone: true,
  imports: [CommonModule, DatePipe, EstandarPickerComponent, ProcessWorkspaceComponent],
  templateUrl: './mi-certificacion.component.html',
  styleUrl: './mi-certificacion.component.css',
})
export class MiCertificacionComponent implements OnInit {
  private readonly svc = inject(SolicitudesService);
  private readonly confirmSvc = inject(ConfirmDialogService);

  view = signal<ViewMode>('list');
  loading = signal(true);
  solicitudes = signal<Solicitud[]>([]);
  selected = signal<SolicitudDetail | null>(null);
  selectedProcessId = signal<string | null>(null);
  feedback = signal('');
  creating = signal(false);

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading.set(true);
    this.solicitudes.set(await this.svc.listMine());
    this.loading.set(false);
  }

  statusLabel(s: string): string { return STATUS_LABELS[s] ?? s; }

  openNew() { this.view.set('new'); this.feedback.set(''); }
  backToList() { this.view.set('list'); this.load(); }

  async onEstandarSelected(e: Estandar) {
    this.creating.set(true);
    const res = await this.svc.create(e.id);
    this.creating.set(false);
    if (res.ok) {
      this.feedback.set(`✅ Solicitud enviada para ${e.codigo} — ${e.nombre}.`);
      this.view.set('list');
      await this.load();
    } else {
      this.feedback.set(res.error ?? 'No se pudo enviar la solicitud.');
    }
  }

  async openDetail(s: Solicitud) {
    this.loading.set(true);
    const detail = await this.svc.getOne(s.id);
    this.loading.set(false);
    if (detail) { this.selected.set(detail); this.view.set('detail'); }
  }

  openProcess() {
    const p = this.selected()?.process;
    if (p) { this.selectedProcessId.set(p.id); this.view.set('process'); }
  }

  async cancel(s: Solicitud) {
    const ok1 = await this.confirmSvc.ask({
      title: 'Cancelar solicitud',
      message: '¿Cancelar esta solicitud de certificación?',
      detail: 'Perderás el avance de esta solicitud (revisión, curso/grupo asignado, evaluador, etc. si ya se había preparado). Esta acción no se puede deshacer.',
      confirmText: 'Sí, cancelar',
    });
    if (!ok1) return;
    const ok = await this.svc.cancel(s.id);
    if (ok) await this.load();
  }

  onProcessClosed() { this.view.set('list'); this.load(); }
}
