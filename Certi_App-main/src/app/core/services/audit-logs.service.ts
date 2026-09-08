import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export interface AuditLogEntry {
  id: number;
  user_id: string | null;
  action: string;
  entity: string | null;
  entityid: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
  users?: { id: string; full_name: string; email: string } | null;
}

@Injectable({ providedIn: 'root' })
export class AuditLogsService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private token() { return this.auth.getToken() ?? ''; }

  async list(limit = 100, offset = 0): Promise<AuditLogEntry[]> {
    try {
      return await firstValueFrom(
        this.api.get<AuditLogEntry[]>(`/audit-logs?limit=${limit}&offset=${offset}`, this.token())
      );
    } catch { return []; }
  }
}
