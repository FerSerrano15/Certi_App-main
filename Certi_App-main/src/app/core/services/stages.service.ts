import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export interface Readiness { ready: boolean; missing: string[] }

export type DiagnosticQuestionType = 'opcion_multiple' | 'abierta' | 'unir_reactivos';

export interface DiagnosticQuestion {
  id: string;
  estandar_id: string;
  type: DiagnosticQuestionType;
  prompt: string;
  options: Array<{ id: string; text?: string; left?: string; right?: string }>;
  correct_option_id: string | null;
  order_index: number;
  points: number;
}

export interface DiagnosticMatchAnswer { right_id: string; selected_left_id: string }

export interface DiagnosticAnswer {
  question_id: string;
  selected_option_id?: string;
  text?: string;
  matches?: DiagnosticMatchAnswer[];
  correct?: boolean | null;
  hits?: number;
  total?: number;
}

export interface ReactivoRow {
  id: string;
  process_id: string;
  reactivo_id: string;
  respuesta: boolean | null;
  observaciones: string | null;
  evaluated_by: string | null;
  evaluated_at: string | null;
  reactivos?: {
    id: string; codigo_reactivo: string; descripcion: string; peso: number;
    es_actitud_valor: boolean; orden: number;
    guias_observacion?: { id: string; titulo: string; orden: number; instrucciones: string | null; vigente: boolean } | null;
  } | null;
}

@Injectable({ providedIn: 'root' })
export class StagesService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private token() { return this.auth.getToken() ?? ''; }
  private base(id: string) { return `/certification-process/${id}`; }

  private async post<T>(path: string, body: unknown): Promise<{ ok: boolean; data: T | null; error?: string }> {
    try { return { ok: true, data: await firstValueFrom(this.api.post<T>(path, body, this.token())) }; }
    catch (err: unknown) { return { ok: false, data: null, error: this.extractError(err) }; }
  }
  private async get<T>(path: string, fallback: T): Promise<T> {
    try { return await firstValueFrom(this.api.get<T>(path, this.token())); }
    catch { return fallback; }
  }

  /** El evaluador/admin decide si el candidato puede ver esta etapa — reemplaza el badge de estado en su vista. */
  setStageCandidateAccess(id: string, stageCode: string, enabled: boolean) {
    return this.post(`${this.base(id)}/stages/${stageCode}/candidate-access`, { enabled });
  }

  // 1) Derechos y obligaciones
  getRights(id: string) { return this.get<{ accepted: boolean; content: Record<string, unknown> } | null>(`${this.base(id)}/rights`, null); }
  acceptRights(id: string, accepted: boolean) { return this.post(`${this.base(id)}/rights`, { accepted }); }

  // 2) Diagnóstico
  getDiagnostic(id: string) { return this.get<Record<string, unknown> | null>(`${this.base(id)}/diagnostic`, null); }

  /** El evaluador elige la modalidad (presencial / en_linea) — arranca la etapa. */
  startDiagnostic(id: string, modality: 'presencial' | 'en_linea') {
    return this.post(`${this.base(id)}/diagnostic/start`, { modality });
  }

  /** Banco de preguntas del estándar de este proceso (para renderizar el examen o repasarlo). */
  getDiagnosticQuestions(id: string) {
    return this.get<DiagnosticQuestion[]>(`${this.base(id)}/diagnostic/questions`, []);
  }

  /** El candidato envía sus respuestas (modalidad en línea) — se autocalifica lo objetivo. */
  submitDiagnosticAnswers(id: string, answers: DiagnosticAnswer[], candidate_signature?: string) {
    return this.post(`${this.base(id)}/diagnostic/answers`, { answers, candidate_signature });
  }

  /** El evaluador revisa y cierra la etapa (resultado, observaciones, decisión, firma). */
  saveDiagnostic(id: string, result: string, observations?: string, data?: Record<string, unknown>) {
    return this.post(`${this.base(id)}/diagnostic`, { result, observations, data });
  }

  // 3) Carta compromiso
  getCommitment(id: string) { return this.get<Record<string, unknown> | null>(`${this.base(id)}/commitment`, null); }
  signCommitment(id: string, signed: boolean, content?: string) { return this.post(`${this.base(id)}/commitment`, { signed, content }); }

  // 4) Plan de evaluación
  getPlan(id: string) { return this.get<Record<string, unknown> | null>(`${this.base(id)}/plan`, null); }
  savePlan(id: string, dto: { planned_start?: string; planned_end?: string; location?: string; modality?: string; observations?: string; submit?: boolean }) {
    return this.post(`${this.base(id)}/plan`, dto);
  }
  reviewPlan(id: string, approve: boolean, observations?: string) { return this.post(`${this.base(id)}/plan/review`, { approve, observations }); }

  // 5) Preparación de la evaluación
  completePreparacion(id: string, notes?: string) { return this.post(`${this.base(id)}/preparacion/complete`, { notes }); }

  // 6) Cierre de recopilación de evidencias
  completeEvidenceStage(id: string) { return this.post(`${this.base(id)}/evidence-stage/complete`, {}); }

  // 7) Instrumento de evaluación
  getInstrument(id: string) { return this.get<ReactivoRow[]>(`${this.base(id)}/instrument`, []); }
  initInstrument(id: string) { return this.post<{ created: number }>(`${this.base(id)}/instrument/init`, {}); }
  bulkSaveReactivos(id: string, records: { reactivo_id: string; respuesta: boolean | null; observaciones?: string }[]) {
    return this.post(`${this.base(id)}/instrument/bulk`, { records });
  }

  // 8) Cédula de evaluación
  getCedula(id: string) { return this.get<Record<string, unknown> | null>(`${this.base(id)}/cedula`, null); }
  closeCedula(id: string, observations?: string) { return this.post(`${this.base(id)}/cedula/close`, { observations }); }
  checkReadiness(id: string) { return this.get<Readiness>(`${this.base(id)}/readiness`, { ready: false, missing: [] }); }

  // 9) Emisión de juicio
  getJudgment(id: string) { return this.get<Record<string, unknown> | null>(`${this.base(id)}/judgment`, null); }
  emitJudgment(id: string, result: 'competente' | 'aun_no_competente', final_score?: number, observations?: string) {
    return this.post(`${this.base(id)}/judgment`, { result, final_score, observations });
  }

  // 10) Presentación de resultados
  getResultsPresentation(id: string) { return this.get<Record<string, unknown> | null>(`${this.base(id)}/results-presentation`, null); }
  presentResults(id: string, participant_accepted: boolean, observations?: string) {
    return this.post(`${this.base(id)}/results-presentation`, { participant_accepted, observations });
  }

  // 12/13) Encuestas
  getSurveyResponses(id: string) { return this.get<Record<string, unknown>[]>(`${this.base(id)}/surveys`, []); }
  submitSurvey(id: string, survey_code: 'ENCUESTA_SATISFACCION' | 'ENCUESTA_PROCESO_CERTIFICACION', responses: Record<string, unknown>) {
    return this.post(`${this.base(id)}/surveys`, { survey_code, responses });
  }

  private extractError(err: unknown): string {
    if (
      err !== null && typeof err === 'object' && 'error' in err &&
      (err as { error: unknown }).error !== null && typeof (err as { error: unknown }).error === 'object' &&
      'message' in (err as { error: Record<string, unknown> }).error
    ) {
      const msg = (err as { error: { message: unknown } }).error.message;
      return Array.isArray(msg) ? (msg as string[]).join(', ') : String(msg);
    }
    return 'Ocurrió un error. Intenta de nuevo.';
  }
}
