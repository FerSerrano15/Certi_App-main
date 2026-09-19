import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { DiagnosticQuestion, DiagnosticQuestionType } from './stages.service';

export interface DiagnosticQuestionOption { id: string; text?: string; left?: string; right?: string }

export interface CreateDiagnosticQuestion {
  estandar_id: string;
  type: DiagnosticQuestionType;
  prompt: string;
  options?: DiagnosticQuestionOption[];
  correct_option_id?: string;
  order_index?: number;
  points?: number;
}

/** Banco de preguntas de Diagnóstico — lo administra el evaluador, reutilizable por estándar. */
@Injectable({ providedIn: 'root' })
export class DiagnosticQuestionsService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private token() { return this.auth.getToken() ?? ''; }

  async listByEstandar(estandarId: string): Promise<DiagnosticQuestion[]> {
    try { return await firstValueFrom(this.api.get<DiagnosticQuestion[]>(`/diagnostic-questions?estandar_id=${estandarId}`, this.token())); }
    catch { return []; }
  }

  async create(dto: CreateDiagnosticQuestion): Promise<{ ok: boolean; data: DiagnosticQuestion | null; error?: string }> {
    try {
      const data = await firstValueFrom(this.api.post<DiagnosticQuestion>('/diagnostic-questions', dto, this.token()));
      return { ok: true, data };
    } catch (err: unknown) { return { ok: false, data: null, error: this.extractError(err) }; }
  }

  async update(id: string, dto: Partial<CreateDiagnosticQuestion>): Promise<DiagnosticQuestion | null> {
    try { return await firstValueFrom(this.api.patch<DiagnosticQuestion>(`/diagnostic-questions/${id}`, dto, this.token())); }
    catch { return null; }
  }

  async remove(id: string): Promise<boolean> {
    try { await firstValueFrom(this.api.delete(`/diagnostic-questions/${id}`, this.token())); return true; }
    catch { return false; }
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
