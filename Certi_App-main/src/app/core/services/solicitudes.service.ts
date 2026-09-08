import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export type SolicitudStatus = 'pendiente' | 'en_revision' | 'aprobada' | 'rechazada' | 'cancelada' | 'completada';

export interface Solicitud {
  id: string;
  participant_id: string;
  estandar_id: string;
  course_id: string | null;
  group_id: string | null;
  status: SolicitudStatus;
  application_date: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
  estandares?: { codigo: string; nombre: string } | null;
  courses?: { id: string; name: string; code: string } | null;
  groups?: { id: string; name: string } | null;
  participants?: { id: string; full_name: string; email: string; phone: string | null } | null;
}

export interface SolicitudDetail extends Solicitud {
  candidato: { id: string; full_name: string; email: string; phone: string | null; user_id: string } | null;
  estandar: { id: string; codigo: string; nombre: string; categoria: string | null; version: number; vigente: boolean } | null;
  fichaRegistro: Record<string, unknown> | null;
  history: AuditEntry[];
  documentos: Record<string, unknown>[];
  process: { id: string; folio: string; status: string } | null;
}

export interface AuditEntry {
  id: number;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
  users?: { full_name: string } | null;
}

export type SolicitudReviewAction = 'approve' | 'reject' | 'request_correction';

@Injectable({ providedIn: 'root' })
export class SolicitudesService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private token() { return this.auth.getToken() ?? ''; }

  async create(estandarId: string): Promise<{ ok: boolean; data: Solicitud | null; error?: string }> {
    try {
      const data = await firstValueFrom(this.api.post<Solicitud>('/solicitudes', { estandar_id: estandarId }, this.token()));
      return { ok: true, data };
    } catch (err: unknown) { return { ok: false, data: null, error: this.extractError(err) }; }
  }

  async listMine(): Promise<Solicitud[]> {
    try { return await firstValueFrom(this.api.get<Solicitud[]>('/solicitudes/mine', this.token())); }
    catch { return []; }
  }

  async listAll(status?: string): Promise<Solicitud[]> {
    const qs = status ? `?status=${status}` : '';
    try { return await firstValueFrom(this.api.get<Solicitud[]>(`/solicitudes${qs}`, this.token())); }
    catch { return []; }
  }

  async getOne(id: string): Promise<SolicitudDetail | null> {
    try { return await firstValueFrom(this.api.get<SolicitudDetail>(`/solicitudes/${id}`, this.token())); }
    catch { return null; }
  }

  async getHistory(id: string): Promise<AuditEntry[]> {
    try { return await firstValueFrom(this.api.get<AuditEntry[]>(`/solicitudes/${id}/history`, this.token())); }
    catch { return []; }
  }

  async cancel(id: string): Promise<boolean> {
    try { await firstValueFrom(this.api.post(`/solicitudes/${id}/cancel`, {}, this.token())); return true; }
    catch { return false; }
  }

  async review(id: string, action: SolicitudReviewAction, reason?: string): Promise<{ ok: boolean; data: Solicitud | null; error?: string }> {
    try {
      const data = await firstValueFrom(this.api.patch<Solicitud>(`/solicitudes/${id}/review`, { action, reason }, this.token()));
      return { ok: true, data };
    } catch (err: unknown) { return { ok: false, data: null, error: this.extractError(err) }; }
  }

  async prepare(id: string, courseId: string, groupId?: string): Promise<{ ok: boolean; data: Solicitud | null; error?: string }> {
    try {
      const data = await firstValueFrom(this.api.patch<Solicitud>(`/solicitudes/${id}/prepare`, { course_id: courseId, group_id: groupId }, this.token()));
      return { ok: true, data };
    } catch (err: unknown) { return { ok: false, data: null, error: this.extractError(err) }; }
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
