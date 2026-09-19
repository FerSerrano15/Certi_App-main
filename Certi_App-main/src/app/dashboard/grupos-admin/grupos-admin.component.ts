import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProcessWorkspaceComponent } from '../../shared/process-workspace/process-workspace.component';
import {
  CertificationProcessService, CertificationProcess, FormarGrupoResultItem,
} from '../../core/services/certification-process.service';
import { FichaRegistroService } from '../../core/services/ficha-registro.service';
import { SolicitudesService, FichaDisponible } from '../../core/services/solicitudes.service';
import { CoursesService } from '../../core/services/courses.service';
import { QualifiedEvaluator } from '../../core/services/certifications.service';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';

const STATUS_LABELS: Record<string, string> = {
  PREPARACION: 'Preparación', DIAGNOSTICO: 'Diagnóstico', EVALUACION: 'Evaluación',
  DICTAMEN: 'Dictamen', RESULTADOS: 'Resultados', TRAMITE: 'Trámite',
  EMISION: 'Emisión', CIERRE: 'Certificado emitido',
  AUN_NO_COMPETENTE: 'Aún no competente', CANCELADO: 'Cancelado',
};

/** Estándar con al menos una ficha validada — opción para iniciar "Formar Grupo". */
interface EstandarOpcion { id: string; codigo: string; nombre: string }

/**
 * Fila agregada de la lista de control: candidatos que comparten
 * estándar + evaluador. No es una entidad persistida — el grupo es
 * momentáneo, solo dura lo que dura la certificación de esos candidatos.
 */
interface GrupoAgregado {
  key: string;
  estandarCodigo: string;
  estandarNombre: string;
  cursoCodigo: string;
  cursoNombre: string;
  evaluadorNombre: string;
  evaluadorEmail: string;
  procesos: CertificationProcess[];
}

/**
 * "Grupos" — reemplaza la antigua pantalla "Solicitudes de Certificación"
 * (wizard de 8 pestañas por candidato). Aquí el admin tiene control de
 * TODOS los grupos ya formados (agrupados por estándar+evaluador, con sus
 * candidatos y el avance de cada proceso) y puede formar grupos nuevos
 * directo desde fichas de registro ya validadas — sin depender de que el
 * candidato haya creado una solicitud por su cuenta. Formar un grupo es
 * solo elegir candidatos + evaluador: el grupo no es una entidad con
 * nombre/fechas que administrar, dura lo que dura la certificación.
 */
@Component({
  selector: 'app-grupos-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, ProcessWorkspaceComponent],
  templateUrl: './grupos-admin.component.html',
  styleUrl: './grupos-admin.component.css',
})
export class GruposAdminComponent implements OnInit {
  private readonly processSvc = inject(CertificationProcessService);
  private readonly fichaSvc = inject(FichaRegistroService);
  private readonly solicitudesSvc = inject(SolicitudesService);
  private readonly coursesSvc = inject(CoursesService);
  private readonly confirmSvc = inject(ConfirmDialogService);

  loading = signal(true);
  procesos = signal<CertificationProcess[]>([]);
  search = signal('');
  expandedKey = signal<string | null>(null);
  openProcessId = signal<string | null>(null);
  cancellingId = signal<string | null>(null);
  enablingId = signal<string | null>(null);
  deletingKey = signal<string | null>(null);
  actionFeedback = signal('');

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    this.procesos.set(await this.processSvc.listAll());
    this.loading.set(false);
  }

  statusLabel(s: string): string {
    return STATUS_LABELS[s] ?? s;
  }

  grupos = computed<GrupoAgregado[]>(() => {
    const map = new Map<string, GrupoAgregado>();
    for (const p of this.procesos()) {
      const key = `${p.estandar_id}:${p.evaluator_id}`;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          estandarCodigo: p.estandares?.codigo ?? '',
          estandarNombre: p.estandares?.nombre ?? '',
          cursoCodigo: p.courses?.code ?? '',
          cursoNombre: p.courses?.name ?? '',
          evaluadorNombre: p.users?.full_name ?? '—',
          evaluadorEmail: p.users?.email ?? '',
          procesos: [],
        };
        map.set(key, g);
      }
      g.procesos.push(p);
    }
    return Array.from(map.values()).sort((a, b) => b.procesos.length - a.procesos.length);
  });

  filteredGrupos = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.grupos();
    return this.grupos().filter(g =>
      g.estandarCodigo.toLowerCase().includes(q)
      || g.estandarNombre.toLowerCase().includes(q)
      || g.evaluadorNombre.toLowerCase().includes(q)
      || g.procesos.some(p => (p.participants?.full_name ?? '').toLowerCase().includes(q)),
    );
  });

  toggleExpand(g: GrupoAgregado) {
    this.expandedKey.update(k => (k === g.key ? null : g.key));
    this.actionFeedback.set('');
  }

  openProceso(p: CertificationProcess) {
    this.openProcessId.set(p.id);
  }

  onProcessWorkspaceClosed() {
    this.openProcessId.set(null);
    this.load();
  }

  /** Un proceso ya cerrado (certificado emitido) o ya cancelado no puede volver a cancelarse. */
  canCancel(p: CertificationProcess): boolean {
    return p.status !== 'CIERRE' && p.status !== 'CANCELADO';
  }

  async cancelCandidato(p: CertificationProcess) {
    const nombre = p.participants?.full_name ?? 'este candidato';
    const ok1 = await this.confirmSvc.ask({
      title: 'Cancelar candidato del grupo',
      message: `¿Cancelar el proceso de ${nombre} en este grupo?`,
      detail: 'Se libera la solicitud de este candidato para este estándar, así podrá volver a formarse un grupo para él más adelante. Esta acción no se puede deshacer.',
      confirmText: 'Sí, cancelar',
    });
    if (!ok1) return;

    this.cancellingId.set(p.id);
    const res = await this.processSvc.cancelProcess(p.id);
    this.cancellingId.set(null);
    if (res.ok) await this.load();
  }

  async cancelGrupo(g: GrupoAgregado) {
    const cancelables = g.procesos.filter(p => this.canCancel(p));
    if (!cancelables.length) return;

    const ok1 = await this.confirmSvc.ask({
      title: 'Cancelar grupo completo',
      message: `¿Cancelar el grupo completo (${cancelables.length} candidato(s))?`,
      detail: 'Se libera la solicitud de cada candidato para este estándar. Esta acción no se puede deshacer.',
      confirmText: 'Sí, cancelar grupo',
    });
    if (!ok1) return;

    for (const p of cancelables) {
      this.cancellingId.set(p.id);
      await this.processSvc.cancelProcess(p.id);
    }
    this.cancellingId.set(null);
    await this.load();
  }

  /** Un grupo con todos sus candidatos ya cancelados puede eliminarse por completo. */
  isFullyCancelled(g: GrupoAgregado): boolean {
    return g.procesos.every(p => p.status === 'CANCELADO');
  }

  async deleteGrupo(g: GrupoAgregado) {
    const ok1 = await this.confirmSvc.ask({
      title: 'Eliminar grupo',
      message: `¿Eliminar definitivamente este grupo (${g.procesos.length} candidato(s) cancelado(s))?`,
      detail: 'Se borra el historial de estos procesos. Esta acción no se puede deshacer.',
      confirmText: 'Sí, eliminar',
    });
    if (!ok1) return;

    this.deletingKey.set(g.key);
    const res = await this.processSvc.deleteCancelledGroup(g.procesos.map(p => p.id));
    this.deletingKey.set(null);
    if (res.ok) {
      if (this.expandedKey() === g.key) this.expandedKey.set(null);
      await this.load();
    } else {
      this.actionFeedback.set(res.error ?? 'No se pudo eliminar el grupo.');
    }
  }

  async enableCandidato(p: CertificationProcess) {
    this.enablingId.set(p.id);
    const res = await this.processSvc.enableForCandidate(p.id);
    this.enablingId.set(null);
    if (res.ok) {
      await this.load();
    } else {
      this.actionFeedback.set(res.error ?? 'No se pudo habilitar el acceso del candidato.');
    }
  }

  // ─── Formar Grupo ──────────────────────────────────────────────────────
  // Del catálogo de fichas ya validadas se elige un estándar; a partir de
  // ahí se elige a los candidatos y al evaluador — y ya, no hay más datos
  // que capturar. El "curso" no se le pide al admin — es un detalle interno
  // de la base de datos, uno por estándar: se reutiliza el que ya exista o
  // se crea automáticamente la primera vez.

  showFormarGrupo = signal(false);
  formarGrupoEstandarId = signal('');
  estandaresDisponibles = signal<EstandarOpcion[]>([]);
  loadingEstandares = signal(false);
  loadingDisponibles = signal(false);
  fichasDisponibles = signal<FichaDisponible[]>([]);
  selectedFichaIds = signal<Set<string>>(new Set());

  /** Curso ya existente para el estándar elegido (oculto en la UI); vacío si aún no existe y se creará al enviar. */
  private resolvedCourseId = signal('');

  qualifiedEvaluators = signal<QualifiedEvaluator[]>([]);
  chosenEvaluatorId = signal('');
  evaluatorsLoading = signal(false);

  formingGroup = signal(false);
  formarGrupoFeedback = signal('');
  formarGrupoResults = signal<FormarGrupoResultItem[] | null>(null);

  async openFormarGrupo() {
    this.showFormarGrupo.set(true);
    this.formarGrupoEstandarId.set('');
    this.fichasDisponibles.set([]);
    this.selectedFichaIds.set(new Set());
    this.resetFormarGrupoForm();

    this.loadingEstandares.set(true);
    const fichas = await this.fichaSvc.listAll();
    const map = new Map<string, EstandarOpcion>();
    for (const f of fichas) {
      if (f.status === 'validada' && !map.has(f.estandar_id)) {
        map.set(f.estandar_id, { id: f.estandar_id, codigo: f.estandar_codigo, nombre: f.estandar_nombre });
      }
    }
    this.estandaresDisponibles.set(Array.from(map.values()));
    this.loadingEstandares.set(false);
  }

  closeFormarGrupo() {
    this.showFormarGrupo.set(false);
  }

  private resetFormarGrupoForm() {
    this.resolvedCourseId.set(''); this.chosenEvaluatorId.set('');
    this.qualifiedEvaluators.set([]);
    this.formarGrupoFeedback.set(''); this.formarGrupoResults.set(null);
  }

  async onFormarGrupoEstandarChange(estandarId: string) {
    this.formarGrupoEstandarId.set(estandarId);
    this.resetFormarGrupoForm();
    if (!estandarId) return;

    this.loadingDisponibles.set(true);
    const [disponibles, courses] = await Promise.all([
      this.solicitudesSvc.getFichasDisponibles(estandarId),
      this.coursesSvc.getCourses(),
    ]);
    this.fichasDisponibles.set(disponibles);
    // Por defecto se seleccionan todos los candidatos disponibles.
    this.selectedFichaIds.set(new Set(disponibles.map(f => f.id)));

    // El curso de este estándar ya existe si se formó un grupo antes para
    // él — se reutiliza en silencio.
    const existingCourse = courses.find(c => c.estandar_id === estandarId);
    if (existingCourse) this.resolvedCourseId.set(existingCourse.id);
    this.loadingDisponibles.set(false);

    this.evaluatorsLoading.set(true);
    this.qualifiedEvaluators.set(await this.processSvc.getQualifiedEvaluators(estandarId));
    this.evaluatorsLoading.set(false);
  }

  toggleFicha(id: string, checked: boolean) {
    this.selectedFichaIds.update(set => {
      const next = new Set(set);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  isFichaSelected(id: string): boolean {
    return this.selectedFichaIds().has(id);
  }

  /** Curso interno del estándar elegido: reutiliza el existente o crea uno nuevo la primera vez. */
  private async ensureCourseForEstandar(): Promise<{ ok: true; courseId: string } | { ok: false; error: string }> {
    const existing = this.resolvedCourseId();
    if (existing) return { ok: true, courseId: existing };

    const estandar = this.estandaresDisponibles().find(e => e.id === this.formarGrupoEstandarId());
    if (!estandar) return { ok: false, error: 'Selecciona un estándar.' };

    const res = await this.coursesSvc.createCourseChecked({
      name: `${estandar.codigo} — ${estandar.nombre}`,
      code: estandar.codigo,
      estandar_id: estandar.id,
    });
    if (!res.ok || !res.data) return { ok: false, error: res.error ?? 'No se pudo preparar el curso de este estándar.' };
    this.resolvedCourseId.set(res.data.id);
    return { ok: true, courseId: res.data.id };
  }

  async submitFormarGrupo() {
    const estandarId = this.formarGrupoEstandarId();
    const fichaIds = Array.from(this.selectedFichaIds());
    if (!estandarId || fichaIds.length === 0) {
      this.formarGrupoFeedback.set('Selecciona al menos un candidato.');
      return;
    }
    if (!this.chosenEvaluatorId()) { this.formarGrupoFeedback.set('Selecciona un evaluador calificado.'); return; }

    this.formingGroup.set(true);
    this.formarGrupoFeedback.set('');

    const courseRes = await this.ensureCourseForEstandar();
    if (!courseRes.ok) {
      this.formingGroup.set(false);
      this.formarGrupoFeedback.set(courseRes.error);
      return;
    }

    const res = await this.processSvc.formarGrupo({
      estandar_id: estandarId,
      ficha_ids: fichaIds,
      course_id: courseRes.courseId,
      evaluator_id: this.chosenEvaluatorId(),
    });
    this.formingGroup.set(false);

    if (!res.ok || !res.data) {
      this.formarGrupoFeedback.set(res.error ?? 'No se pudo formar el grupo.');
      return;
    }

    this.formarGrupoResults.set(res.data);
    const okIds = new Set(res.data.filter(r => r.ok).map(r => r.ficha_id));
    this.fichasDisponibles.update(list => list.filter(f => !okIds.has(f.id)));
    this.selectedFichaIds.update(set => {
      const next = new Set(set);
      okIds.forEach(id => next.delete(id));
      return next;
    });

    const okCount = res.data.filter(r => r.ok).length;
    if (okCount > 0) {
      this.formarGrupoFeedback.set(`✅ Grupo formado para ${okCount} de ${res.data.length} candidato(s).`);
      await this.load();
    }
  }
}
