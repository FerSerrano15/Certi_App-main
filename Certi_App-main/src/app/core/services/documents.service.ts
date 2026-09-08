import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export interface CandidateDocument {
  id: string;
  participant_id: string | null;
  type: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  status: 'pending' | 'validated' | 'rejected';
  reviewed_by: string | null;
  uploaded_at: string;
  participants?: { id: string; full_name: string; email: string } | null;
}

export const DOCUMENT_TYPES: { value: string; label: string }[] = [
  { value: 'INE', label: 'Identificación oficial (INE)' },
  { value: 'COMPROBANTE_DOMICILIO', label: 'Comprobante de domicilio' },
  { value: 'CURP', label: 'CURP' },
  { value: 'COMPROBANTE_ESTUDIOS', label: 'Comprobante de estudios' },
  { value: 'FOTOGRAFIA', label: 'Fotografía' },
  { value: 'OTRO', label: 'Otro' },
];

@Injectable({ providedIn: 'root' })
export class DocumentsService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private token() { return this.auth.getToken() ?? ''; }

  async list(participantId?: string): Promise<CandidateDocument[]> {
    const qs = participantId ? `?participant_id=${participantId}` : '';
    try { return await firstValueFrom(this.api.get<CandidateDocument[]>(`/documents${qs}`, this.token())); }
    catch { return []; }
  }

  async uploadSelf(type: string, file: File): Promise<CandidateDocument | null> {
    const fd = new FormData();
    fd.append('type', type);
    fd.append('file', file);
    try { return await firstValueFrom(this.api.postFormData<CandidateDocument>('/documents/self', fd, this.token())); }
    catch { return null; }
  }

  async uploadForParticipant(participantId: string, type: string, file: File): Promise<CandidateDocument | null> {
    const fd = new FormData();
    fd.append('type', type);
    fd.append('participant_id', participantId);
    fd.append('file', file);
    try { return await firstValueFrom(this.api.postFormData<CandidateDocument>('/documents', fd, this.token())); }
    catch { return null; }
  }

  async getUrl(id: string): Promise<string | null> {
    try {
      const res = await firstValueFrom(this.api.get<{ url: string }>(`/documents/${id}/url`, this.token()));
      return res.url;
    } catch { return null; }
  }

  async updateStatus(id: string, status: 'validated' | 'rejected'): Promise<CandidateDocument | null> {
    try { return await firstValueFrom(this.api.patch<CandidateDocument>(`/documents/${id}/status`, { status }, this.token())); }
    catch { return null; }
  }

  async remove(id: string): Promise<boolean> {
    try { await firstValueFrom(this.api.delete(`/documents/${id}`, this.token())); return true; }
    catch { return false; }
  }

  typeLabel(type: string): string {
    return DOCUMENT_TYPES.find(t => t.value === type)?.label ?? type;
  }
}
