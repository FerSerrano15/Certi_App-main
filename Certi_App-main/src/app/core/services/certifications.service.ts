import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export type CertificationType = 'INSTRUCTOR_CREDENTIAL' | 'STANDARD';
export type CertificationStatus = 'vigente' | 'vencido' | 'revocado';

export interface Certification {
  id: string;
  user_id: string;
  type: CertificationType;
  code: string | null;
  name: string | null;
  status: CertificationStatus;
  issued_at: string | null;
  expires_at: string | null;
  certificate_url: string | null;
  institution_id: string | null;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class CertificationsService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private token() { return this.auth.getToken() ?? ''; }

  async getByUser(userId: string): Promise<Certification[]> {
    try { return await firstValueFrom(this.api.get<Certification[]>(`/certifications?user_id=${userId}`, this.token())); }
    catch { return []; }
  }

  async create(data: {
    user_id: string;
    type: CertificationType;
    code?: string;
    name?: string;
    status?: CertificationStatus;
    issued_at?: string;
    expires_at?: string;
  }): Promise<Certification | null> {
    try { return await firstValueFrom(this.api.post<Certification>('/certifications', data, this.token())); }
    catch { return null; }
  }

  async remove(id: string): Promise<boolean> {
    try { await firstValueFrom(this.api.delete(`/certifications/${id}`, this.token())); return true; }
    catch { return false; }
  }
}
