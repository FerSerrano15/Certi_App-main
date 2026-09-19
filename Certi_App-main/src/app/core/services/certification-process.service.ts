import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { QualifiedEvaluator } from './certifications.service';

export type ProcessStatus =
  | 'PREPARACION' | 'DIAGNOSTICO' | 'EVALUACION' | 'DICTAMEN' | 'RESULTADOS'
  | 'TRAMITE' | 'EMISION' | 'CIERRE' | 'AUN_NO_COMPETENTE' | 'CANCELADO';

export type StageStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export interface ProcessStage {
  id: string;
  process_id: string;
  stage_code: string;
  status: StageStatus;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  certification_stage_catalog?: { name: string; description: string | null; stage_order: number } | null;
}

export interface CertificationProcess {
  id: string;
  folio: string;
  application_id: string;
  participant_id: string;
  estandar_id: string;
  course_id: string;
  group_id: string | null;
  evaluator_id: string;
  status: ProcessStatus;
  completed_at: string | null;
  created_at: string;
  /** El candidato solo puede abrir su expediente cuando el evaluador (o un admin) lo habilita explícitamente. */
  candidate_enabled: boolean;
  estandares?: { codigo: string; nombre: string } | null;
  courses?: { name: string; code: string } | null;
  groups?: { id: string; name: string } | null;
  participants?: { full_name: string; email: string } | null;
  users?: { id: string; full_name: string; email: string } | null;
}

export interface FormarGrupoRequest {
  estandar_id: string;
  ficha_ids: string[];
  course_id: string;
  group_id?: string;
  evaluator_id: string;
}

export interface FormarGrupoResultItem {
  ficha_id: string;
  ok: boolean;
  process_id?: string;
  folio?: string;
  error?: string;
}

export interface CertificationProcessDetail extends CertificationProcess {
  stages: ProcessStage[];
  participant: { id: string; full_name: string; email: string; phone: string | null; user_id: string } | null;
  estandar: { id: string; codigo: string; nombre: string } | null;
  course: { id: string; name: string; code: string } | null;
  group: { id: string; name: string } | null;
  evaluator: { id: string; full_name: string; email: string } | null;
  judgment: { result: 'competente' | 'aun_no_competente'; final_score: number | null; observations: string | null; issued_at: string } | null;
}

@Injectable({ providedIn: 'root' })
export class CertificationProcessService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private token() { return this.auth.getToken() ?? ''; }

  async getQualifiedEvaluators(estandarId: string): Promise<QualifiedEvaluator[]> {
    try {
      return await firstValueFrom(this.api.get<QualifiedEvaluator[]>(`/certification-process/qualified-evaluators?estandar_id=${estandarId}`, this.token()));
    } catch { return []; }
  }

  async create(applicationId: string, evaluatorId: string): Promise<{ ok: boolean; data: CertificationProcessDetail | null; error?: string }> {
    try {
      const data = await firstValueFrom(
        this.api.post<CertificationProcessDetail>('/certification-process', { application_id: applicationId, evaluator_id: evaluatorId }, this.token())
      );
      return { ok: true, data };
    } catch (err: unknown) { return { ok: false, data: null, error: this.extractError(err) }; }
  }

  async listMine(status?: string): Promise<CertificationProcess[]> {
    const qs = status ? `?status=${status}` : '';
    try { return await firstValueFrom(this.api.get<CertificationProcess[]>(`/certification-process/mine${qs}`, this.token())); }
    catch { return []; }
  }

  async listAll(status?: string): Promise<CertificationProcess[]> {
    const qs = status ? `?status=${status}` : '';
    try { return await firstValueFrom(this.api.get<CertificationProcess[]>(`/certification-process${qs}`, this.token())); }
    catch { return []; }
  }

  async getOne(id: string): Promise<CertificationProcessDetail | null> {
    try { return await firstValueFrom(this.api.get<CertificationProcessDetail>(`/certification-process/${id}`, this.token())); }
    catch { return null; }
  }

  /**
   * Acción compuesta "Formar Grupo": a partir de fichas de registro ya
   * validadas, crea la solicitud de cada candidato, la aprueba con el
   * curso/grupo elegido y le asigna el evaluador de una sola vez —
   * reemplaza tener que abrir la solicitud de cada candidato una por una.
   */
  async formarGrupo(dto: FormarGrupoRequest): Promise<{ ok: boolean; data: FormarGrupoResultItem[] | null; error?: string }> {
    try {
      const data = await firstValueFrom(
        this.api.post<FormarGrupoResultItem[]>('/certification-process/formar-grupo', dto, this.token())
      );
      return { ok: true, data };
    } catch (err: unknown) { return { ok: false, data: null, error: this.extractError(err) }; }
  }

  /**
   * Cancela el proceso de un candidato (ADMIN) — libera también la
   * solicitud origen, así vuelve a estar disponible para "Formar Grupo".
   */
  async cancelProcess(id: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await firstValueFrom(this.api.post(`/certification-process/${id}/cancel`, {}, this.token()));
      return { ok: true };
    } catch (err: unknown) { return { ok: false, error: this.extractError(err) }; }
  }

  /** El evaluador asignado (o un admin) habilita el acceso del candidato a su propio expediente. */
  async enableForCandidate(id: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await firstValueFrom(this.api.post(`/certification-process/${id}/enable-candidate`, {}, this.token()));
      return { ok: true };
    } catch (err: unknown) { return { ok: false, error: this.extractError(err) }; }
  }

  /** Elimina definitivamente un grupo ya cancelado (todos sus candidatos en CANCELADO). Solo admin. */
  async deleteCancelledGroup(processIds: string[], groupId?: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await firstValueFrom(this.api.post('/certification-process/delete-group', { process_ids: processIds, group_id: groupId }, this.token()));
      return { ok: true };
    } catch (err: unknown) { return { ok: false, error: this.extractError(err) }; }
  }

  extractError(err: unknown): string {
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
