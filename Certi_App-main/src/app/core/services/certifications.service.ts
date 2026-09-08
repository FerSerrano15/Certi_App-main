import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export type CertificationType = 'EVALUATOR_CREDENTIAL' | 'STANDARD';
export type CertificationStatus = 'vigente' | 'vencida' | 'revocada' | 'cancelada';

export interface Certification {
  id: string;
  user_id: string;
  estandar_id: string | null;
  type: CertificationType;
  code: string | null;
  name: string | null;
  status: CertificationStatus;
  issued_at: string | null;
  expires_at: string | null;
  certificate_url: string | null;
  created_at: string;
  estandares?: { codigo: string; nombre: string } | null;
}

export interface QualifiedEvaluator {
  evaluator_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  standard_expires_at: string | null;
  credential_expires_at: string | null;
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
    estandar_id?: string;
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

  /** Evaluadores calificados para un estándar — role EVALUADOR + activo + EVALUATOR_CREDENTIAL vigente + STANDARD vigente. */
  async getQualifiedEvaluators(estandarId: string): Promise<QualifiedEvaluator[]> {
    try {
      return await firstValueFrom(
        this.api.get<QualifiedEvaluator[]>(`/certification-process/qualified-evaluators?estandar_id=${estandarId}`, this.token())
      );
    } catch { return []; }
  }
}
