import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProcessWorkspaceComponent } from '../../shared/process-workspace/process-workspace.component';
import { SolicitudesService, Solicitud, SolicitudDetail, SolicitudReviewAction } from '../../core/services/solicitudes.service';
import { CoursesService, Course, Group } from '../../core/services/courses.service';
import { CertificationProcessService } from '../../core/services/certification-process.service';
import { QualifiedEvaluator } from '../../core/services/certifications.service';
import { DocumentsService, CandidateDocument } from '../../core/services/documents.service';

type DetailTab = 'candidato' | 'estandar' | 'documentos' | 'historial' | 'revision' | 'preparacion' | 'evaluador' | 'confirmacion';

const STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente', en_revision: 'En revisión', aprobada: 'Aprobada',
  rechazada: 'Rechazada', cancelada: 'Cancelada', completada: 'Completada',
};

const TABS: { id: DetailTab; label: string }[] = [
  { id: 'candidato', label: 'Datos del candidato' },
  { id: 'estandar', label: 'Estándar solicitado' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'historial', label: 'Historial' },
  { id: 'revision', label: 'Revisión' },
  { id: 'preparacion', label: 'Preparación del curso' },
  { id: 'evaluador', label: 'Selección de evaluador' },
  { id: 'confirmacion', label: 'Confirmación del proceso' },
];

@Component({
  selector: 'app-solicitudes-admin',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, ProcessWorkspaceComponent],
  templateUrl: './solicitudes-admin.component.html',
  styleUrl: './solicitudes-admin.component.css',
})
export class SolicitudesAdminComponent implements OnInit {
  private readonly svc = inject(SolicitudesService);
  private readonly coursesSvc = inject(CoursesService);
  private readonly processSvc = inject(CertificationProcessService);
  private readonly docsSvc = inject(DocumentsService);

  readonly tabs = TABS;

  loading = signal(true);
  solicitudes = signal<Solicitud[]>([]);
  filterStatus = signal<string>('');
  selected = signal<SolicitudDetail | null>(null);
  activeTab = signal<DetailTab>('candidato');
  openProcessId = signal<string | null>(null);

  // Revisión
  reviewReason = signal('');
  reviewBusy = signal(false);
  reviewFeedback = signal('');

  // Preparación
  courses = signal<Course[]>([]);
  groups = signal<Group[]>([]);
  chosenCourseId = signal('');
  chosenGroupId = signal('');
  newCourseName = signal('');
  newCourseCode = signal('');
  prepBusy = signal(false);
  prepFeedback = signal('');

  // Evaluador
  qualifiedEvaluators = signal<QualifiedEvaluator[]>([]);
  chosenEvaluatorId = signal('');
  evaluatorsLoading = signal(false);

  // Confirmación
  confirmBusy = signal(false);
  confirmFeedback = signal('');

  // Documentos — vista de solo lectura (la revisión/aprobación real vive en
  // Usuarios → clic en el candidato, junto con su foto de perfil).
  participantDocuments = signal<CandidateDocument[]>([]);
  documentsLoading = signal(false);

  coursesForEstandar = computed(() => {
    const s = this.selected();
    if (!s) return [];
    return this.courses().filter(c => c.estandar_id === s.estandar_id);
  });

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading.set(true);
    this.solicitudes.set(await this.svc.listAll(this.filterStatus() || undefined));
    this.loading.set(false);
  }

  async setFilter(status: string) {
    this.filterStatus.set(status);
    await this.load();
  }

  statusLabel(s: string): string { return STATUS_LABELS[s] ?? s; }

  async openDetail(s: Solicitud) {
    this.loading.set(true);
    const detail = await this.svc.getOne(s.id);
    this.loading.set(false);
    if (!detail) return;
    this.selected.set(detail);
    this.activeTab.set('candidato');
    this.reviewReason.set(''); this.reviewFeedback.set('');
    this.chosenCourseId.set(detail.course_id ?? '');
    this.chosenGroupId.set(detail.group_id ?? '');
    this.prepFeedback.set(''); this.confirmFeedback.set('');
    this.chosenEvaluatorId.set('');
    this.courses.set(await this.coursesSvc.getCourses());
    if (detail.course_id) this.groups.set(await this.coursesSvc.getGroups(detail.course_id));
  }

  backToList() { this.selected.set(null); this.openProcessId.set(null); this.load(); }

  setTab(tab: DetailTab) {
    this.activeTab.set(tab);
    if (tab === 'evaluador' && this.selected()) this.loadQualifiedEvaluators();
    if (tab === 'documentos' && this.selected()) this.loadParticipantDocuments();
  }

  // ─── Documentos: revisión de veracidad ─────────────────────────────────
  async loadParticipantDocuments() {
    const s = this.selected();
    if (!s) return;
    this.documentsLoading.set(true);
    this.participantDocuments.set(await this.docsSvc.list(s.participant_id));
    this.documentsLoading.set(false);
  }

  docTypeLabel(type: string): string { return this.docsSvc.typeLabel(type); }

  docStatusLabel(status: string): string {
    const map: Record<string, string> = { pending: 'Pendiente', validated: 'Validado', rejected: 'Rechazado' };
    return map[status] ?? status;
  }

  async viewDocument(d: CandidateDocument) {
    const url = await this.docsSvc.getUrl(d.id);
    if (url) window.open(url, '_blank', 'noopener');
  }

  async loadQualifiedEvaluators() {
    const s = this.selected();
    if (!s) return;
    this.evaluatorsLoading.set(true);
    this.qualifiedEvaluators.set(await this.processSvc.getQualifiedEvaluators(s.estandar_id));
    this.evaluatorsLoading.set(false);
  }

  // ─── Revisión ───────────────────────────────────────────────────────────
  async doReview(action: SolicitudReviewAction) {
    const s = this.selected();
    if (!s) return;
    if (action !== 'approve' && this.reviewReason().trim().length < 3) {
      this.reviewFeedback.set('Indica un motivo de al menos 3 caracteres.');
      return;
    }
    this.reviewBusy.set(true);
    const res = await this.svc.review(s.id, action, this.reviewReason() || undefined);
    this.reviewBusy.set(false);
    if (res.ok) {
      this.reviewFeedback.set('✅ Solicitud actualizada.');
      await this.openDetail(s);
    } else {
      this.reviewFeedback.set(res.error ?? 'No se pudo actualizar la solicitud.');
    }
  }

  // ─── Preparación ────────────────────────────────────────────────────────
  async onCourseChange(courseId: string) {
    this.chosenCourseId.set(courseId);
    this.chosenGroupId.set('');
    this.groups.set(courseId ? await this.coursesSvc.getGroups(courseId) : []);
  }

  async createCourseForEstandar() {
    const s = this.selected();
    if (!s) return;
    if (!this.newCourseName().trim() || !this.newCourseCode().trim()) {
      this.prepFeedback.set('Indica nombre y código del curso.');
      return;
    }
    this.prepBusy.set(true);
    const res = await this.coursesSvc.createCourseChecked({
      name: this.newCourseName().trim(),
      code: this.newCourseCode().trim(),
      estandar_id: s.estandar_id,
    });
    this.prepBusy.set(false);
    if (res.ok && res.data) {
      this.newCourseName.set(''); this.newCourseCode.set('');
      this.prepFeedback.set('');
      this.courses.set(await this.coursesSvc.getCourses());
      this.chosenCourseId.set(res.data.id);
    } else {
      this.prepFeedback.set(res.error ?? 'No se pudo crear el curso.');
    }
  }

  async savePreparacion() {
    const s = this.selected();
    if (!s || !this.chosenCourseId()) { this.prepFeedback.set('Selecciona un curso.'); return; }
    this.prepBusy.set(true);
    const res = await this.svc.prepare(s.id, this.chosenCourseId(), this.chosenGroupId() || undefined);
    this.prepBusy.set(false);
    if (res.ok) {
      this.prepFeedback.set('✅ Curso/grupo asignado a la solicitud.');
      await this.openDetail(s);
      this.activeTab.set('preparacion');
    } else {
      this.prepFeedback.set(res.error ?? 'No se pudo preparar la solicitud.');
    }
  }

  // ─── Confirmación / creación del proceso ───────────────────────────────
  async createProcess() {
    const s = this.selected();
    if (!s || !this.chosenEvaluatorId()) { this.confirmFeedback.set('Selecciona un evaluador calificado.'); return; }
    this.confirmBusy.set(true);
    const res = await this.processSvc.create(s.id, this.chosenEvaluatorId());
    this.confirmBusy.set(false);
    if (res.ok && res.data) {
      this.confirmFeedback.set('✅ Proceso de certificación creado.');
      this.openProcessId.set(res.data.id);
    } else {
      this.confirmFeedback.set(res.error ?? 'No se pudo crear el proceso.');
    }
  }

  onProcessWorkspaceClosed() {
    const s = this.selected();
    this.openProcessId.set(null);
    if (s) this.openDetail(s);
  }
}
