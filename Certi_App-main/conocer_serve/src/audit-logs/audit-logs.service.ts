import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

type JwtUser = { id: string; role: string };

export interface AuditLogEntry {
  user_id?: string | null;
  action: string;
  entity?: string;
  entityid?: string;
  metadata?: Record<string, unknown>;
  old_data?: Record<string, unknown> | null;
  ip?: string | null;
}

/**
 * Servicio de auditoría, disponible globalmente (ver AuditLogsModule).
 * El registro nunca debe romper la operación principal: cualquier error
 * al escribir el log se captura y solo se reporta por consola.
 */
@Injectable()
export class AuditLogsService {
  constructor(private readonly supabase: SupabaseService) {}

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      // NOTA: la tabla real en Supabase usa entity_type/entity_id/new_data/
      // ip_address (no entity/entityid/metadata/ip) — se mapea aquí para no
      // tener que tocar los ~15 call sites existentes que usan los nombres
      // "amigables" del AuditLogEntry.
      const { error } = await this.supabase.admin.from('audit_logs').insert({
        user_id: entry.user_id ?? null,
        action: entry.action,
        entity_type: entry.entity ?? null,
        entity_id: entry.entityid ?? null,
        old_data: entry.old_data ?? null,
        new_data: entry.metadata ?? null,
        ip_address: entry.ip ?? null,
      });
      if (error) console.error('[AuditLogsService] Error al registrar auditoría:', error.message);
    } catch (err) {
      console.error('[AuditLogsService] Excepción al registrar auditoría:', err);
    }
  }

  async list(user: JwtUser, limit = 100, offset = 0) {
    if (user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Solo el Super Admin puede ver la bitácora de auditoría.');
    }
    const { data, error } = await this.supabase.admin
      .from('audit_logs')
      .select('*, users ( id, full_name, email )')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new NotFoundException(error.message);
    return data ?? [];
  }
}
