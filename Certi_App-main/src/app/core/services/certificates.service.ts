import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export interface Certificate {
  id: string;
  process_id: string;
  certificate_request_id: string;
  participant_id: string;
  course_id: string;
  enrollment_id: string | null;
  folio: string;
  verification_token: string;
  qr_data_url: string;
  final_grade: number | null;
  attendance_percentage: number | null;
  status: 'vigente' | 'vencido' | 'revocado' | 'cancelado';
  issued_at: string;
  expires_at: string | null;
  issued_by: string;
  revocation_reason: string | null;
  revoked_by: string | null;
  participants?: { id: string; full_name: string; email: string } | null;
  courses?: { id: string; name: string; code: string } | null;
}

export interface CertificateVerification {
  valid: boolean;
  folio?: string;
  status?: 'vigente' | 'vencido' | 'revocado';
  participant_name?: string | null;
  course_name?: string | null;
  course_code?: string | null;
  issued_at?: string;
  expires_at?: string | null;
  final_grade?: number | null;
  attendance_percentage?: number | null;
}

export interface CertificateRequest {
  id: string;
  process_id: string;
  requested_by: string;
  status: 'pendiente' | 'en_revision' | 'aprobada' | 'rechazada' | 'cancelada';
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
}

export interface ValidationLogEntry {
  id: number;
  validation_type: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  details: Record<string, unknown>;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class CertificatesService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private token() { return this.auth.getToken() ?? ''; }

  /** Inicia el trámite de certificado para un proceso (requiere dictamen 'competente'). */
  async createRequest(processId: string): Promise<{ ok: boolean; data: CertificateRequest | null; error?: string }> {
    try {
      const data = await firstValueFrom(
        this.api.post<CertificateRequest>('/certificate-requests', { process_id: processId }, this.token())
      );
      return { ok: true, data };
    } catch (err: unknown) {
      return { ok: false, data: null, error: this.extractError(err) };
    }
  }

  async listRequests(processId?: string): Promise<CertificateRequest[]> {
    const qs = processId ? `?process_id=${processId}` : '';
    try { return await firstValueFrom(this.api.get<CertificateRequest[]>(`/certificate-requests${qs}`, this.token())); }
    catch { return []; }
  }

  /** Aprobar EMITE el certificado de inmediato; rechazar solo cierra el trámite. */
  async reviewRequest(id: string, approve: boolean, notes?: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await firstValueFrom(this.api.patch(`/certificate-requests/${id}/review`, { approve, notes }, this.token()));
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, error: this.extractError(err) };
    }
  }

  async list(filters?: { participant_id?: string; course_id?: string }): Promise<Certificate[]> {
    const params: string[] = [];
    if (filters?.participant_id) params.push(`participant_id=${filters.participant_id}`);
    if (filters?.course_id) params.push(`course_id=${filters.course_id}`);
    const qs = params.length ? `?${params.join('&')}` : '';
    try { return await firstValueFrom(this.api.get<Certificate[]>(`/certificates${qs}`, this.token())); }
    catch { return []; }
  }

  async listMine(): Promise<Certificate[]> {
    try { return await firstValueFrom(this.api.get<Certificate[]>('/certificates/mine', this.token())); }
    catch { return []; }
  }

  async revoke(id: string, reason?: string): Promise<boolean> {
    try { await firstValueFrom(this.api.patch(`/certificates/${id}/revoke`, { reason }, this.token())); return true; }
    catch { return false; }
  }

  /** Pública, no requiere sesión. */
  async verify(ref: string): Promise<CertificateVerification> {
    try { return await firstValueFrom(this.api.get<CertificateVerification>(`/certificates/verify/${encodeURIComponent(ref)}`)); }
    catch { return { valid: false }; }
  }

  async listValidationLogs(): Promise<ValidationLogEntry[]> {
    try { return await firstValueFrom(this.api.get<ValidationLogEntry[]>('/certificates/validation-logs', this.token())); }
    catch { return []; }
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
