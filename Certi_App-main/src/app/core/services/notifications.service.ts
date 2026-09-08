import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export interface AppNotification {
  id: string;
  target_role: 'ADMIN' | 'SUPER_ADMIN';
  type: string;
  title: string;
  message: string;
  payload: {
    ficha_id?: string;
    user_id?: string;
    full_name?: string;
    estandar_codigo?: string;
    estandar_nombre?: string;
    [key: string]: unknown;
  };
  read: boolean;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private token() { return this.auth.getToken() ?? ''; }

  async list(unreadOnly = false, limit = 50): Promise<AppNotification[]> {
    try {
      const qs = `?limit=${limit}${unreadOnly ? '&unread=true' : ''}`;
      return await firstValueFrom(this.api.get<AppNotification[]>(`/notifications${qs}`, this.token()));
    } catch { return []; }
  }

  async unreadCount(): Promise<number> {
    try {
      const res = await firstValueFrom(this.api.get<{ count: number }>('/notifications/unread-count', this.token()));
      return res.count;
    } catch { return 0; }
  }

  async markRead(id: string): Promise<boolean> {
    try { await firstValueFrom(this.api.patch(`/notifications/${id}/read`, {}, this.token())); return true; }
    catch { return false; }
  }
}
