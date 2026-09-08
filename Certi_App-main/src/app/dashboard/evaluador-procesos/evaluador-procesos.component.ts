import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProcessWorkspaceComponent } from '../../shared/process-workspace/process-workspace.component';
import { CertificationProcessService, CertificationProcess } from '../../core/services/certification-process.service';

const STATUS_LABELS: Record<string, string> = {
  PREPARACION: 'Preparación', DIAGNOSTICO: 'Diagnóstico', EVALUACION: 'Evaluación',
  DICTAMEN: 'Dictamen emitido', RESULTADOS: 'Resultados presentados', TRAMITE: 'Trámite de certificado',
  EMISION: 'Certificado emitido', CIERRE: 'Cerrado', AUN_NO_COMPETENTE: 'Aún no competente', CANCELADO: 'Cancelado',
};

@Component({
  selector: 'app-evaluador-procesos',
  standalone: true,
  imports: [CommonModule, ProcessWorkspaceComponent],
  templateUrl: './evaluador-procesos.component.html',
  styleUrl: './evaluador-procesos.component.css',
})
export class EvaluadorProcesosComponent implements OnInit {
  private readonly svc = inject(CertificationProcessService);

  loading = signal(true);
  procesos = signal<CertificationProcess[]>([]);
  selectedId = signal<string | null>(null);

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading.set(true);
    this.procesos.set(await this.svc.listMine());
    this.loading.set(false);
  }

  statusLabel(s: string): string { return STATUS_LABELS[s] ?? s; }

  open(id: string) { this.selectedId.set(id); }
  onClosed() { this.selectedId.set(null); this.load(); }
}
