import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

type JwtUser = { id: string; role: string };

// Las notificaciones de fichas de registro son un flujo operativo del
// ADMIN — el SUPER_ADMIN a propósito no las ve (tiene su propia vista de
// Solicitudes si la necesita, pero no debe ser interrumpido por la campanita).
const NOTIFIABLE_ROLES = ['ADMIN'];

export interface NotifyAdminsInput {
  type: string;
  title: string;
  message: string;
  payload?: Record<string, unknown>;
}

/**
 * Servicio de notificaciones in-app, disponible globalmente (ver
 * NotificationsModule). Igual que AuditLogsService: nunca debe romper
 * la operación principal, cualquier error al insertar se captura y
 * solo se reporta por consola.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly supabase: SupabaseService) {}

  private requireAdmin(role: string) {
    if (!NOTIFIABLE_ROLES.includes(role)) {
      throw new ForbiddenException('Se requiere rol de administrador.');
    }
  }

  async notifyAdmins(input: NotifyAdminsInput): Promise<void> {
    try {
      const { error } = await this.supabase.admin.from('notifications').insert({
        target_role: 'ADMIN',
        type: input.type,
        title: input.title,
        message: input.message,
        payload: input.payload ?? {},
      });
      if (error) console.error('[NotificationsService] Error al crear notificación:', error.message);
    } catch (err) {
      console.error('[NotificationsService] Excepción al crear notificación:', err);
    }
  }

  async list(user: JwtUser, unreadOnly = false, limit = 50) {
    this.requireAdmin(user.role);
    let q = this.supabase.admin
      .from('notifications')
      .select('*')
      .in('target_role', NOTIFIABLE_ROLES)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (unreadOnly) q = q.eq('read', false);
    const { data, error } = await q;
    if (error) throw new NotFoundException(error.message);
    return data ?? [];
  }

  async unreadCount(user: JwtUser): Promise<{ count: number }> {
    this.requireAdmin(user.role);
    const { count, error } = await this.supabase.admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .in('target_role', NOTIFIABLE_ROLES)
      .eq('read', false);
    if (error) throw new NotFoundException(error.message);
    return { count: count ?? 0 };
  }

  async markRead(id: string, user: JwtUser) {
    this.requireAdmin(user.role);
    const { data, error } = await this.supabase.admin
      .from('notifications')
      .update({ read: true, read_by: user.id, read_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error || !data) throw new NotFoundException('Notificación no encontrada.');
    return data;
  }
}
