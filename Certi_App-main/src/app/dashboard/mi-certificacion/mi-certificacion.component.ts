import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ProcessWorkspaceComponent } from '../../shared/process-workspace/process-workspace.component';
import { CertificationProcessService, CertificationProcess } from '../../core/services/certification-process.service';

type ViewMode = 'list' | 'process';

const STATUS_LABELS: Record<string, string> = {
  PREPARACION: 'Preparación', DIAGNOSTICO: 'Diagnóstico', EVALUACION: 'Evaluación',
  DICTAMEN: 'Dictamen', RESULTADOS: 'Resultados', TRAMITE: 'Trámite',
  EMISION: 'Emisión', CIERRE: 'Certificado emitido',
  AUN_NO_COMPETENTE: 'Aún no competente', CANCELADO: 'Cancelado',
};

/**
 * "Mis Grupos" — de solo lectura para el candidato: ya no existe aquí el
 * autoservicio "+Nueva solicitud"; el candidato ve directamente los grupos
 * (procesos de certificación) a los que un administrador ya lo asignó junto
 * con un evaluador, a partir de su Ficha de Registro (ver
 * FichaRegistroAdminComponent → "Formar Grupo").
 */
@Component({
  selector: 'app-mi-certificacion',
  standalone: true,
  imports: [CommonModule, DatePipe, ProcessWorkspaceComponent],
  templateUrl: './mi-certificacion.component.html',
  styleUrl: './mi-certificacion.component.css',
})
export class MiCertificacionComponent implements OnInit {
  private readonly svc = inject(CertificationProcessService);

  view = signal<ViewMode>('list');
  loading = signal(true);
  grupos = signal<CertificationProcess[]>([]);
  selectedProcessId = signal<string | null>(null);

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading.set(true);
    this.grupos.set(await this.svc.listMine());
    this.loading.set(false);
  }

  statusLabel(s: string): string { return STATUS_LABELS[s] ?? s; }

  openProcess(g: CertificationProcess) {
    if (!g.candidate_enabled) return;
    this.selectedProcessId.set(g.id);
    this.view.set('process');
  }

  onProcessClosed() {
    this.view.set('list');
    this.load();
  }
}
