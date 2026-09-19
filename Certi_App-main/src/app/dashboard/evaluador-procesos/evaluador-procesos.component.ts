import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProcessWorkspaceComponent } from '../../shared/process-workspace/process-workspace.component';
import { CertificationProcessService, CertificationProcess } from '../../core/services/certification-process.service';

const STATUS_LABELS: Record<string, string> = {
  PREPARACION: 'Preparación', DIAGNOSTICO: 'Diagnóstico', EVALUACION: 'Evaluación',
  DICTAMEN: 'Dictamen emitido', RESULTADOS: 'Resultados presentados', TRAMITE: 'Trámite de certificado',
  EMISION: 'Certificado emitido', CIERRE: 'Cerrado', AUN_NO_COMPETENTE: 'Aún no competente', CANCELADO: 'Cancelado',
};

/**
 * Fila agregada: candidatos que comparten estándar del evaluador. No es una
 * entidad persistida — el grupo es momentáneo, dura lo que dura la
 * certificación de esos candidatos.
 */
interface GrupoAgregado {
  key: string;
  estandarCodigo: string;
  estandarNombre: string;
  cursoNombre: string;
  procesos: CertificationProcess[];
}

/**
 * "Mis Grupos" del evaluador — sus candidatos agrupados por estándar, con
 * acceso directo al expediente de cada uno y la opción de habilitarles el
 * acceso a su propio proceso.
 */
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
  expandedKey = signal<string | null>(null);
  enablingId = signal<string | null>(null);
  actionFeedback = signal('');

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading.set(true);
    this.procesos.set(await this.svc.listMine());
    this.loading.set(false);
  }

  statusLabel(s: string): string { return STATUS_LABELS[s] ?? s; }

  open(id: string) { this.selectedId.set(id); }
  onClosed() { this.selectedId.set(null); this.load(); }

  grupos = computed<GrupoAgregado[]>(() => {
    const map = new Map<string, GrupoAgregado>();
    for (const p of this.procesos()) {
      const key = p.estandar_id;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          estandarCodigo: p.estandares?.codigo ?? '',
          estandarNombre: p.estandares?.nombre ?? '',
          cursoNombre: p.courses?.name ?? '',
          procesos: [],
        };
        map.set(key, g);
      }
      g.procesos.push(p);
    }
    return Array.from(map.values());
  });

  toggleExpand(g: GrupoAgregado) {
    this.expandedKey.update(k => (k === g.key ? null : g.key));
    this.actionFeedback.set('');
  }

  async enableCandidato(p: CertificationProcess) {
    this.enablingId.set(p.id);
    const res = await this.svc.enableForCandidate(p.id);
    this.enablingId.set(null);
    if (res.ok) {
      await this.load();
    } else {
      this.actionFeedback.set(res.error ?? 'No se pudo habilitar el acceso del candidato.');
    }
  }
}
