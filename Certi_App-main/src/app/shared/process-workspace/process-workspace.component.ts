import { Component, inject, signal, computed, input, output, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { CertificationProcessService, CertificationProcessDetail, ProcessStage } from '../../core/services/certification-process.service';
import { StagesService, Readiness, ReactivoRow, DiagnosticQuestion, DiagnosticQuestionType, DiagnosticAnswer } from '../../core/services/stages.service';
import { EvidencesService, Evidence } from '../../core/services/evidences.service';
import { CertificatesService, CertificateRequest } from '../../core/services/certificates.service';
import { DiagnosticQuestionsService, DiagnosticQuestionOption } from '../../core/services/diagnostic-questions.service';
import { PdfService } from '../../core/services/pdf.service';
import { PdfPreviewDialogService } from '../pdf-preview-dialog/pdf-preview-dialog.service';
import { SignaturePadComponent } from '../signature-pad/signature-pad.component';

interface DiagOptionDraft { id: string; text: string; left: string; right: string }
interface DiagAnswerDraft { selected_option_id?: string; text?: string; matchByRight?: Record<string, string> }

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
  imports: [CommonModule, FormsModule, DatePipe, SignaturePadComponent],
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
  private readonly diagnosticQuestionsSvc = inject(DiagnosticQuestionsService);
  private readonly pdfSvc = inject(PdfService);
  private readonly pdfPreview = inject(PdfPreviewDialogService);

  loading = signal(true);
  process = signal<CertificationProcessDetail | null>(null);
  expanded = signal<string | null>(null);
  busy = signal(false);
  feedback = signal('');

  // Panel-specific local state
  rights = signal<{ accepted: boolean; content: Record<string, unknown> } | null>(null);
  diagnostic = signal<Record<string, unknown> | null>(null);
  diagResult = signal('Excelente');
  diagObservations = signal('');
  diagLugar = signal('');
  diagDecision = signal<'participar' | 'curso_taller' | ''>('');
  diagEvaluatorSignature = signal<string | null>(null);

  // Diagnóstico — examen del candidato (modalidad en línea)
  diagQuestions = signal<DiagnosticQuestion[]>([]);
  diagShuffledOptions = signal<Record<string, DiagOptionDraft[]>>({});
  diagAnswerDraft = signal<Record<string, DiagAnswerDraft>>({});
  diagCandidateSignature = signal<string | null>(null);
  diagSubmittingAnswers = signal(false);
  /** Calificación del evaluador para cada pregunta abierta (question_id → correcta sí/no). */
  diagAbiertaGrades = signal<Record<string, boolean>>({});

  // Diagnóstico — foto del examen (modalidad presencial)
  diagPhoto = signal<Evidence | null>(null);
  diagPhotoUrl = signal<string | null>(null);
  diagPhotoFile: File | null = null;
  diagUploadingPhoto = signal(false);

  // Diagnóstico — banco de preguntas del estándar (lo arma el evaluador)
  diagBankOpen = signal(false);
  diagBank = signal<DiagnosticQuestion[]>([]);
  diagBankLoading = signal(false);
  newQType = signal<DiagnosticQuestionType>('opcion_multiple');
  newQPrompt = signal('');
  newQPoints = signal('1');
  newQOptions = signal<DiagOptionDraft[]>([]);
  newQCorrectId = signal('');
  savingQuestion = signal(false);

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

  diagModality = computed<'presencial' | 'en_linea' | null>(() => {
    const data = this.diagnostic()?.['data'] as Record<string, unknown> | undefined;
    return (data?.['modality'] as 'presencial' | 'en_linea' | undefined) ?? null;
  });
  diagIsSubmitted = computed(() => {
    const data = this.diagnostic()?.['data'] as Record<string, unknown> | undefined;
    return !!data?.['submitted_at'];
  });
  diagIsFinalized = computed(() => !!this.diagnostic()?.['result']);
  diagServerAnswers = computed<DiagnosticAnswer[]>(() => {
    const data = this.diagnostic()?.['data'] as Record<string, unknown> | undefined;
    return (data?.['answers'] as DiagnosticAnswer[] | undefined) ?? [];
  });
  diagAutoScore = computed(() => {
    const data = this.diagnostic()?.['data'] as Record<string, unknown> | undefined;
    return { score: data?.['auto_score'] as number | undefined, max: data?.['max_auto_score'] as number | undefined };
  });
  /** Calificación sobre 10 — suma de todos los puntos (objetivas + abiertas ya calificadas) entre el total posible. */
  diagCalificacion = computed(() => {
    const questions = this.diagQuestions();
    const totalPoints = questions.reduce((sum, q) => sum + Number(q.points), 0);
    const autoEarned = this.diagAutoScore().score ?? 0;
    const grades = this.diagAbiertaGrades();
    const abiertaEarned = questions
      .filter(q => q.type === 'abierta' && grades[q.id])
      .reduce((sum, q) => sum + Number(q.points), 0);
    const totalEarned = autoEarned + abiertaEarned;
    return totalPoints > 0 ? Math.round((totalEarned / totalPoints) * 10 * 100) / 100 : 0;
  });

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

  isStageEnabledForCandidate(stage: ProcessStage): boolean {
    return stage.metadata?.['candidate_enabled'] === true;
  }

  async toggleStageAccess(stage: ProcessStage, event: Event) {
    event.stopPropagation();
    const enabled = !this.isStageEnabledForCandidate(stage);
    const res = await this.stagesSvc.setStageCandidateAccess(this.processId(), stage.stage_code, enabled);
    if (res.ok) await this.load();
    else this.feedback.set(res.error ?? 'No se pudo actualizar la visibilidad de la etapa.');
  }

  private async loadPanel(stageCode: string) {
    const id = this.processId();
    switch (stageCode) {
      case 'DERECHOS_OBLIGACIONES':
        this.rights.set(await this.stagesSvc.getRights(id)); break;
      case 'DIAGNOSTICO': {
        const d = await this.stagesSvc.getDiagnostic(id);
        this.diagnostic.set(d);
        if (d) {
          if (d['result']) this.diagResult.set(String(d['result']));
          this.diagObservations.set(String(d['observations'] ?? ''));
          const data = (d['data'] as Record<string, unknown>) ?? {};
          this.diagDecision.set((data['decision'] as any) ?? '');
          this.diagEvaluatorSignature.set((data['evaluator_signature'] as string) ?? null);
          this.diagLugar.set((data['lugar'] as string) ?? '');
          const grades = (data['abierta_grades'] as { question_id: string; correct: boolean }[] | undefined) ?? [];
          this.diagAbiertaGrades.set(Object.fromEntries(grades.map(g => [g.question_id, g.correct])));
        }
        await this.loadDiagnosticSubpanel();
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

  // ─── Diagnóstico ─────────────────────────────────────────────────────────

  private async loadDiagnosticSubpanel() {
    const modality = this.diagModality();
    if (modality === 'en_linea') {
      const questions = await this.stagesSvc.getDiagnosticQuestions(this.processId());
      this.diagQuestions.set(questions);

      const shuffled: Record<string, DiagOptionDraft[]> = {};
      for (const q of questions) {
        if (q.type !== 'unir_reactivos') continue;
        const opts = (q.options as DiagOptionDraft[]).map(o => ({ id: o.id, text: o.text ?? '', left: o.left ?? '', right: o.right ?? '' }));
        for (let i = opts.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [opts[i], opts[j]] = [opts[j], opts[i]];
        }
        shuffled[q.id] = opts;
      }
      this.diagShuffledOptions.set(shuffled);

      // Si ya hay respuestas guardadas (reintento tras revisión), precargar el borrador.
      const draft: Record<string, DiagAnswerDraft> = {};
      for (const a of this.diagServerAnswers()) {
        if (a.selected_option_id) draft[a.question_id] = { selected_option_id: a.selected_option_id };
        else if (a.text) draft[a.question_id] = { text: a.text };
        else if (a.matches?.length) {
          const matchByRight: Record<string, string> = {};
          for (const m of a.matches) matchByRight[m.right_id] = m.selected_left_id;
          draft[a.question_id] = { matchByRight };
        }
      }
      this.diagAnswerDraft.set(draft);
    } else if (modality === 'presencial') {
      const evs = await this.evidencesSvc.list(this.processId());
      const photo = evs.filter(e => e.evidence_type === 'diagnostico').sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
      this.diagPhoto.set(photo);
      this.diagPhotoUrl.set(photo ? await this.evidencesSvc.getUrl(this.processId(), photo.id) : null);
    }
  }

  async doStartDiagnostic(modality: 'presencial' | 'en_linea') {
    await this.run(() => this.stagesSvc.startDiagnostic(this.processId(), modality), modality === 'presencial' ? '✅ Modalidad: presencial.' : '✅ Modalidad: en línea.');
  }

  getServerAnswer(questionId: string): DiagnosticAnswer | undefined {
    return this.diagServerAnswers().find(a => a.question_id === questionId);
  }

  setAbiertaGrade(questionId: string, correct: boolean) {
    this.diagAbiertaGrades.update(g => ({ ...g, [questionId]: correct }));
  }

  optionsFor(q: DiagnosticQuestion): DiagOptionDraft[] {
    return q.type === 'unir_reactivos' ? (this.diagShuffledOptions()[q.id] ?? []) : (q.options as DiagOptionDraft[]);
  }

  setOpcionMultiple(q: DiagnosticQuestion, optionId: string) {
    this.diagAnswerDraft.update(d => ({ ...d, [q.id]: { selected_option_id: optionId } }));
  }

  setAbierta(q: DiagnosticQuestion, text: string) {
    this.diagAnswerDraft.update(d => ({ ...d, [q.id]: { text } }));
  }

  setMatch(q: DiagnosticQuestion, rightId: string, leftId: string) {
    this.diagAnswerDraft.update(d => {
      const cur = d[q.id] ?? {};
      return { ...d, [q.id]: { matchByRight: { ...(cur.matchByRight ?? {}), [rightId]: leftId } } };
    });
  }

  async doSubmitDiagnosticAnswers() {
    const draft = this.diagAnswerDraft();
    if (!this.diagCandidateSignature()) { this.feedback.set('Dibuja tu firma antes de enviar.'); return; }

    const answers: DiagnosticAnswer[] = this.diagQuestions().map(q => {
      const a = draft[q.id] ?? {};
      if (q.type === 'unir_reactivos') {
        const matches = Object.entries(a.matchByRight ?? {}).map(([right_id, selected_left_id]) => ({ right_id, selected_left_id }));
        return { question_id: q.id, matches };
      }
      if (q.type === 'opcion_multiple') return { question_id: q.id, selected_option_id: a.selected_option_id };
      return { question_id: q.id, text: a.text };
    });

    this.diagSubmittingAnswers.set(true);
    const res = await this.stagesSvc.submitDiagnosticAnswers(this.processId(), answers, this.diagCandidateSignature() ?? undefined);
    this.diagSubmittingAnswers.set(false);
    if (res.ok) {
      this.feedback.set('✅ Respuestas enviadas. En espera de revisión del evaluador.');
      await this.load();
      await this.loadPanel('DIAGNOSTICO');
    } else {
      this.feedback.set(res.error ?? 'No se pudieron enviar las respuestas.');
    }
  }

  onDiagPhotoSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    this.diagPhotoFile = input.files?.[0] ?? null;
  }

  async doUploadDiagnosticPhoto() {
    if (!this.diagPhotoFile) { this.feedback.set('Selecciona la foto del examen.'); return; }
    this.diagUploadingPhoto.set(true);
    const res = await this.evidencesSvc.upload(this.processId(), this.diagPhotoFile, 'diagnostico');
    this.diagUploadingPhoto.set(false);
    if (res.ok) {
      this.diagPhotoFile = null;
      this.feedback.set('✅ Foto del examen subida.');
      await this.loadPanel('DIAGNOSTICO');
    } else {
      this.feedback.set(res.error ?? 'No se pudo subir la foto.');
    }
  }

  async doSaveDiagnostic() {
    const abiertaGrades = this.diagQuestions()
      .filter(q => q.type === 'abierta')
      .map(q => ({ question_id: q.id, correct: this.diagAbiertaGrades()[q.id] === true }));

    await this.run(() => this.stagesSvc.saveDiagnostic(this.processId(), this.diagResult(), this.diagObservations(), {
      decision: this.diagDecision() || undefined,
      evaluator_signature: this.diagEvaluatorSignature() ?? undefined,
      lugar: this.diagLugar() || undefined,
      abierta_grades: this.diagModality() === 'en_linea' ? abiertaGrades : undefined,
      calificacion: this.diagModality() === 'en_linea' ? this.diagCalificacion() : undefined,
    }), '✅ Diagnóstico guardado.');
  }

  async doViewDiagnosticoPdf() {
    const token = this.auth.getToken();
    if (!token) return;
    try {
      const url = await this.pdfSvc.getDiagnosticoBlobUrl(this.processId(), token);
      const name = this.process()?.participant?.full_name ?? this.processId();
      this.pdfPreview.open({
        title: 'Evaluación Diagnóstica',
        blobUrl: url,
        fileName: `diagnostico_${name.replace(/\s+/g, '-').toLowerCase()}`,
      });
    } catch {
      this.feedback.set('No se pudo generar el PDF del diagnóstico.');
    }
  }

  // ─── Banco de preguntas de Diagnóstico (evaluador) ─────────────────────

  async openDiagBank() {
    const estandarId = this.process()?.estandar_id;
    if (!estandarId) return;
    this.diagBankOpen.set(true);
    this.diagBankLoading.set(true);
    this.diagBank.set(await this.diagnosticQuestionsSvc.listByEstandar(estandarId));
    this.diagBankLoading.set(false);
  }

  closeDiagBank() {
    this.diagBankOpen.set(false);
    this.resetNewQuestionForm();
  }

  resetNewQuestionForm() {
    this.newQType.set('opcion_multiple');
    this.newQPrompt.set('');
    this.newQPoints.set('1');
    this.newQOptions.set([]);
    this.newQCorrectId.set('');
  }

  addOptionRow() {
    this.newQOptions.update(list => [...list, { id: crypto.randomUUID(), text: '', left: '', right: '' }]);
  }

  removeOptionRow(id: string) {
    this.newQOptions.update(list => list.filter(o => o.id !== id));
    if (this.newQCorrectId() === id) this.newQCorrectId.set('');
  }

  updateOptionField(id: string, field: 'text' | 'left' | 'right', value: string) {
    this.newQOptions.update(list => list.map(o => (o.id === id ? { ...o, [field]: value } : o)));
  }

  async createQuestion() {
    const estandarId = this.process()?.estandar_id;
    if (!estandarId) return;
    if (!this.newQPrompt().trim()) { this.feedback.set('Escribe el enunciado de la pregunta.'); return; }

    const type = this.newQType();
    let options: DiagnosticQuestionOption[] = [];
    if (type === 'opcion_multiple') {
      options = this.newQOptions().filter(o => o.text.trim()).map(o => ({ id: o.id, text: o.text.trim() }));
      if (options.length < 2) { this.feedback.set('Agrega al menos 2 opciones.'); return; }
      if (!this.newQCorrectId()) { this.feedback.set('Marca cuál opción es la correcta.'); return; }
    } else if (type === 'unir_reactivos') {
      options = this.newQOptions()
        .filter(o => o.left.trim() && o.right.trim())
        .map(o => ({ id: o.id, left: o.left.trim(), right: o.right.trim() }));
      if (options.length < 2) { this.feedback.set('Agrega al menos 2 pares término-definición.'); return; }
    }

    this.savingQuestion.set(true);
    const res = await this.diagnosticQuestionsSvc.create({
      estandar_id: estandarId,
      type,
      prompt: this.newQPrompt().trim(),
      options,
      correct_option_id: type === 'opcion_multiple' ? this.newQCorrectId() : undefined,
      points: Number(this.newQPoints()) || 1,
    });
    this.savingQuestion.set(false);
    if (res.ok) {
      this.resetNewQuestionForm();
      this.diagBank.set(await this.diagnosticQuestionsSvc.listByEstandar(estandarId));
    } else {
      this.feedback.set(res.error ?? 'No se pudo guardar la pregunta.');
    }
  }

  async deleteQuestion(id: string) {
    const estandarId = this.process()?.estandar_id;
    if (!estandarId) return;
    const ok = await this.diagnosticQuestionsSvc.remove(id);
    if (ok) this.diagBank.set(await this.diagnosticQuestionsSvc.listByEstandar(estandarId));
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

  async doEnableForCandidate() {
    await this.run(() => this.processSvc.enableForCandidate(this.processId()), '✅ Acceso del candidato habilitado.');
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
