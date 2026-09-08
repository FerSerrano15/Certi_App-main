import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export type EvidenceStatus = 'pendiente' | 'validada' | 'rechazada' | 'requiere_correccion';

export interface Evidence {
  id: string;
  process_id: string;
  evidence_type: string;
  description: string | null;
  file_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  captured_at: string;
  uploaded_by: string;
  status: EvidenceStatus;
  notes: string | null;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class EvidencesService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private token() { return this.auth.getToken() ?? ''; }

  async list(processId: string): Promise<Evidence[]> {
    try { return await firstValueFrom(this.api.get<Evidence[]>(`/certification-process/${processId}/evidences`, this.token())); }
    catch { return []; }
  }

  async upload(processId: string, file: File, evidenceType: string, description?: string): Promise<{ ok: boolean; error?: string }> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('evidence_type', evidenceType);
    if (description) fd.append('description', description);
    try {
      await firstValueFrom(this.api.postFormData(`/certification-process/${processId}/evidences`, fd, this.token()));
      return { ok: true };
    } catch (err: unknown) { return { ok: false, error: this.extractError(err) }; }
  }

  async getUrl(processId: string, id: string): Promise<string | null> {
    try {
      const res = await firstValueFrom(this.api.get<{ url: string }>(`/certification-process/${processId}/evidences/${id}/url`, this.token()));
      return res.url;
    } catch { return null; }
  }

  async review(processId: string, id: string, status: EvidenceStatus, notes?: string): Promise<boolean> {
    try {
      await firstValueFrom(this.api.patch(`/certification-process/${processId}/evidences/${id}`, { status, notes }, this.token()));
      return true;
    } catch { return false; }
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
