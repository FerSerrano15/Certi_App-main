import { Component, inject, signal, computed, input, output, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { CertificationProcessService, CertificationProcessDetail, ProcessStage } from '../../core/services/certification-process.service';
import { StagesService, Readiness, ReactivoRow } from '../../core/services/stages.service';
import { EvidencesService, Evidence } from '../../core/services/evidences.service';
import { CertificatesService, CertificateRequest } from '../../core/services/certificates.service';

const STAGE_LABELS: Record<string, string> = {
  DERECHOS_OBLIGACIONES: 'Recibo de derechos y obligaciones',
  DIAGNOSTICO: 'Diagnóstico',
  CARTA_COMPROMISO: 'Carta compromiso',
  PLAN_EVALUACION: 'Plan de evaluación',
  PREPARACION_EVALUACION: 'Preparación de la evaluación',
  RECOPILACION_EVIDENCIAS: 'Recopilación de evidencias',
  INSTRUMENTO_EVALUACION: 'Aplicación del instrumento de evaluación',
  CEDULA_EVALUACION: 'Cédula de evaluación',
  EMISION_JUICIO: 'Emisión de juicio',
  PRESENTACION_RESULTADOS: 'Presentación de resultados',
  TRAMITE_CERTIFICADO: 'Trámite de certificado',
  ENCUESTA_SATISFACCION: 'Encuesta de satisfacción',
  ENCUESTA_PROCESO_CERTIFICACION: 'Encuesta del proceso de certificación',
};

@Component({
  selector: 'app-process-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './process-workspace.component.html',
  styleUrl: './process-workspace.component.css',
})
export class ProcessWorkspaceComponent implements OnInit {
  processId = input.required<string>();
  closed = output<void>();

  private readonly auth = inject(AuthService);
  private readonly processSvc = inject(CertificationProcessService);
  private readonly stagesSvc = inject(StagesService);
  private readonly evidencesSvc = inject(EvidencesService);
  private readonly certificatesSvc = inject(CertificatesService);

  loading = signal(true);
  process = signal<CertificationProcessDetail | null>(null);
  expanded = signal<string | null>(null);
  busy = signal(false);
  feedback = signal('');

  // Panel-specific local state
  rights = signal<{ accepted: boolean; content: Record<string, unknown> } | null>(null);
  diagnostic = signal<Record<string, unknown> | null>(null);
  diagResult = signal('competente');
  diagObservations = signal('');
  commitment = signal<Record<string, unknown> | null>(null);
  plan = signal<Record<string, unknown> | null>(null);
  planStart = signal(''); planEnd = signal(''); planLocation = signal(''); planModality = signal(''); planObservations = signal('');
  evidences = signal<Evidence[]>([]);
  evFile: File | null = null;
  evType = signal('documento');
  evDescription = signal('');
  instrument = signal<ReactivoRow[]>([]);
  cedula = signal<Record<string, unknown> | null>(null);
  cedulaObservations = signal('');
  readiness = signal<Readiness | null>(null);
  judgment = signal<Record<string, unknown> | null>(null);
  judgmentResult = signal<'competente' | 'aun_no_competente'>('competente');
  judgmentScore = signal<number | null>(null);
  judgmentObservations = signal('');
  resultsPresentation = signal<Record<string, unknown> | null>(null);
  participantAccepted = signal(true);
  presentObservations = signal('');
  certRequests = signal<CertificateRequest[]>([]);
  myCertificate = signal<{ folio: string; status: string } | null>(null);
  surveyAnswers = signal<Record<string, string>>({});

  role = computed(() => this.auth.userRole());
  isAdmin = computed(() => this.auth.canManageUsers());
  isEvaluador = computed(() => this.role() === 'EVALUADOR');
  isCandidato = computed(() => this.role() === 'CANDIDATO');
  isAssignedEvaluador = computed(() => this.isEvaluador() && this.process()?.evaluator_id === this.auth.currentUser()?.id);
  canActEvaluador = computed(() => this.isAdmin() || this.isAssignedEvaluador());

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    const data = await this.processSvc.getOne(this.processId());
    this.process.set(data);
    this.loading.set(false);

    if (this.isCandidato()) {
      const mine = await this.certificatesSvc.listMine();
      const match = mine.find(c => c.process_id === this.processId());
      this.myCertificate.set(match ? { folio: match.folio, status: match.status } : null);
    }
  }

  stageLabel(code: string): string { return STAGE_LABELS[code] ?? code; }

  stageIcon(status: string): string {
    if (status === 'completed') return '✓';
    if (status === 'in_progress') return '…';
    if (status === 'skipped') return '—';
    return '○';
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      PREPARACION: 'Preparación', DIAGNOSTICO: 'Diagnóstico', EVALUACION: 'Evaluación',
      DICTAMEN: 'Dictamen emitido', RESULTADOS: 'Resultados presentados', TRAMITE: 'Trámite de certificado',
      EMISION: 'Certificado emitido', CIERRE: 'Cerrado', AUN_NO_COMPETENTE: 'Aún no competente', CANCELADO: 'Cancelado',
    };
    return map[status] ?? status;
  }

  async toggle(stage: ProcessStage) {
    if (this.expanded() === stage.stage_code) { this.expanded.set(null); return; }
    this.expanded.set(stage.stage_code);
    this.feedback.set('');
    await this.loadPanel(stage.stage_code);
  }

  private async loadPanel(stageCode: string) {
    const id = this.processId();
    switch (stageCode) {
      case 'DERECHOS_OBLIGACIONES':
        this.rights.set(await this.stagesSvc.getRights(id)); break;
      case 'DIAGNOSTICO': {
        const d = await this.stagesSvc.getDiagnostic(id);
        this.diagnostic.set(d);
        if (d) { this.diagResult.set(String(d['result'] ?? 'competente')); this.diagObservations.set(String(d['observations'] ?? '')); }
        break;
      }
      case 'CARTA_COMPROMISO':
        this.commitment.set(await this.stagesSvc.getCommitment(id)); break;
      case 'PLAN_EVALUACION': {
        const p = await this.stagesSvc.getPlan(id);
        this.plan.set(p);
        if (p) {
          this.planStart.set(String(p['planned_start'] ?? '').slice(0, 10));
          this.planEnd.set(String(p['planned_end'] ?? '').slice(0, 10));
          this.planLocation.set(String(p['location'] ?? ''));
          this.planModality.set(String(p['modality'] ?? ''));
          this.planObservations.set(String(p['observations'] ?? ''));
        }
        break;
      }
      case 'RECOPILACION_EVIDENCIAS':
        this.evidences.set(await this.evidencesSvc.list(id)); break;
      case 'INSTRUMENTO_EVALUACION':
        this.instrument.set(await this.stagesSvc.getInstrument(id)); break;
      case 'CEDULA_EVALUACION':
        this.cedula.set(await this.stagesSvc.getCedula(id)); break;
      case 'EMISION_JUICIO':
        this.judgment.set(await this.stagesSvc.getJudgment(id));
        this.readiness.set(await this.stagesSvc.checkReadiness(id));
        break;
      case 'PRESENTACION_RESULTADOS':
        this.resultsPresentation.set(await this.stagesSvc.getResultsPresentation(id)); break;
      case 'TRAMITE_CERTIFICADO':
        if (this.isAdmin()) this.certRequests.set(await this.certificatesSvc.listRequests(id));
        break;
      case 'ENCUESTA_SATISFACCION':
      case 'ENCUESTA_PROCESO_CERTIFICACION':
        break;
    }
  }

  private async run(action: () => Promise<{ ok: boolean; error?: string }>, successMsg: string) {
    this.busy.set(true);
    this.feedback.set('');
    const res = await action();
    this.busy.set(false);
    if (res.ok) {
      this.feedback.set(successMsg);
      await this.load();
      const code = this.expanded();
      if (code) await this.loadPanel(code);
    } else {
      this.feedback.set(res.error ?? 'Ocurrió un error.');
    }
  }

  async doAcceptRights() {
    await this.run(() => this.stagesSvc.acceptRights(this.processId(), true), '✅ Derechos y obligaciones aceptados.');
  }

  async doSaveDiagnostic() {
    await this.run(() => this.stagesSvc.saveDiagnostic(this.processId(), this.diagResult(), this.diagObservations()), '✅ Diagnóstico guardado.');
  }

  async doSignCommitment() {
    await this.run(() => this.stagesSvc.signCommitment(this.processId(), true), '✅ Carta compromiso firmada.');
  }

  async doSavePlan(submit: boolean) {
    await this.run(() => this.stagesSvc.savePlan(this.processId(), {
      planned_start: this.planStart() || undefined, planned_end: this.planEnd() || undefined,
      location: this.planLocation() || undefined, modality: this.planModality() || undefined,
      observations: this.planObservations() || undefined, submit,
    }), submit ? '✅ Plan enviado a revisión.' : '✅ Plan guardado como borrador.');
  }

  async doReviewPlan(approve: boolean) {
    await this.run(() => this.stagesSvc.reviewPlan(this.processId(), approve, this.planObservations() || undefined),
      approve ? '✅ Plan aprobado.' : 'Plan rechazado.');
  }

  async doCompletePreparacion() {
    await this.run(() => this.stagesSvc.completePreparacion(this.processId()), '✅ Preparación completada.');
  }

  onFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    this.evFile = input.files?.[0] ?? null;
  }

  async doUploadEvidence() {
    if (!this.evFile) { this.feedback.set('Selecciona un archivo.'); return; }
    this.busy.set(true);
    const res = await this.evidencesSvc.upload(this.processId(), this.evFile, this.evType(), this.evDescription() || undefined);
    this.busy.set(false);
    if (res.ok) {
      this.feedback.set('✅ Evidencia subida.');
      this.evFile = null; this.evDescription.set('');
      this.evidences.set(await this.evidencesSvc.list(this.processId()));
      await this.load();
    } else {
      this.feedback.set(res.error ?? 'No se pudo subir la evidencia.');
    }
  }

  async doReviewEvidence(ev: Evidence, status: 'validada' | 'rechazada' | 'requiere_correccion') {
    this.busy.set(true);
    const ok = await this.evidencesSvc.review(this.processId(), ev.id, status);
    this.busy.set(false);
    if (ok) {
      this.evidences.set(await this.evidencesSvc.list(this.processId()));
    } else {
      this.feedback.set('No se pudo actualizar la evidencia.');
    }
  }

  async doCompleteEvidenceStage() {
    await this.run(() => this.stagesSvc.completeEvidenceStage(this.processId()), '✅ Etapa de evidencias cerrada.');
  }

  async doInitInstrument() {
    this.busy.set(true);
    await this.stagesSvc.initInstrument(this.processId());
    this.instrument.set(await this.stagesSvc.getInstrument(this.processId()));
    this.busy.set(false);
  }

  setReactivoRespuesta(row: ReactivoRow, value: boolean) {
    this.instrument.update(list => list.map(r => r.id === row.id ? { ...r, respuesta: value } : r));
  }
  setReactivoObs(row: ReactivoRow, value: string) {
    this.instrument.update(list => list.map(r => r.id === row.id ? { ...r, observaciones: value } : r));
  }

  async doSaveReactivos() {
    const records = this.instrument().map(r => ({ reactivo_id: r.reactivo_id, respuesta: r.respuesta, observaciones: r.observaciones ?? undefined }));
    await this.run(() => this.stagesSvc.bulkSaveReactivos(this.processId(), records), '✅ Respuestas del instrumento guardadas.');
    this.instrument.set(await this.stagesSvc.getInstrument(this.processId()));
  }

  async doCloseCedula() {
    await this.run(() => this.stagesSvc.closeCedula(this.processId(), this.cedulaObservations() || undefined), '✅ Cédula cerrada.');
  }

  async doEmitJudgment() {
    await this.run(
      () => this.stagesSvc.emitJudgment(this.processId(), this.judgmentResult(), this.judgmentScore() ?? undefined, this.judgmentObservations() || undefined),
      '✅ Juicio emitido.',
    );
  }

  async doPresentResults() {
    await this.run(() => this.stagesSvc.presentResults(this.processId(), this.participantAccepted(), this.presentObservations() || undefined), '✅ Resultados presentados.');
  }

  async doCreateCertRequest() {
    this.busy.set(true);
    const res = await this.certificatesSvc.createRequest(this.processId());
    this.busy.set(false);
    if (res.ok) {
      this.feedback.set('✅ Trámite de certificado iniciado.');
      this.certRequests.set(await this.certificatesSvc.listRequests(this.processId()));
      await this.load();
    } else {
      this.feedback.set(res.error ?? 'No se pudo iniciar el trámite.');
    }
  }

  async doReviewCertRequest(req: CertificateRequest, approve: boolean) {
    this.busy.set(true);
    const res = await this.certificatesSvc.reviewRequest(req.id, approve);
    this.busy.set(false);
    if (res.ok) {
      this.feedback.set(approve ? '✅ Certificado emitido.' : 'Trámite rechazado.');
      this.certRequests.set(await this.certificatesSvc.listRequests(this.processId()));
      await this.load();
    } else {
      this.feedback.set(res.error ?? 'No se pudo revisar el trámite.');
    }
  }

  setSurveyAnswer(key: string, value: string) {
    this.surveyAnswers.update(a => ({ ...a, [key]: value }));
  }

  async doSubmitSurvey(code: 'ENCUESTA_SATISFACCION' | 'ENCUESTA_PROCESO_CERTIFICACION') {
    await this.run(() => this.stagesSvc.submitSurvey(this.processId(), code, this.surveyAnswers()), '✅ Encuesta enviada. ¡Gracias!');
  }

  close() { this.closed.emit(); }
}
