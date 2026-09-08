import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { BulkAttendanceDto, CreateAttendanceDto } from './dto/create-attendance.dto';

type JwtUser = { id: string; role: string };

@Injectable()
export class AttendanceService {
  constructor(private readonly supabase: SupabaseService) {}

  private requireEvaluator(user: JwtUser) {
    if (!['SUPER_ADMIN', 'ADMIN', 'EVALUADOR'].includes(user.role)) {
      throw new ForbiddenException('No tienes permisos para esta acción.');
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  LIST — Asistencia por sesión
  // ════════════════════════════════════════════════════════════════════════════

  async listBySession(sessionId: string, user: JwtUser) {
    this.requireEvaluator(user);
    const { data, error } = await this.supabase.admin
      .from('attendance')
      .select(`
        *,
        enrollments (
          id, status,
          participants ( id, full_name, email, national_id )
        )
      `)
      .eq('session_id', sessionId)
      .order('marked_at');

    if (error) throw new NotFoundException(error.message);
    return data ?? [];
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  INIT SESSION — Crea registros de asistencia para todos los inscritos
  //  Útil para inicializar antes de empezar a marcar
  // ════════════════════════════════════════════════════════════════════════════

  async initSessionAttendance(sessionId: string, user: JwtUser) {
    this.requireEvaluator(user);

    // 1. Obtener el group_id de la sesión
    const { data: session } = await this.supabase.admin
      .from('sessions')
      .select('group_id')
      .eq('id', sessionId)
      .single<{ group_id: string }>();

    if (!session) throw new NotFoundException('Sesión no encontrada.');

    // 2. Obtener todos los inscritos activos del grupo
    const { data: enrollments } = await this.supabase.admin
      .from('enrollments')
      .select('id')
      .eq('group_id', session.group_id)
      .neq('status', 'dropped');

    if (!enrollments?.length) return { created: 0 };

    // 3. Verificar cuáles ya tienen registro de asistencia
    const { data: existing } = await this.supabase.admin
      .from('attendance')
      .select('enrollment_id')
      .eq('session_id', sessionId);

    const existingIds = new Set((existing ?? []).map(e => e.enrollment_id));
    const toInsert = enrollments
      .filter(e => !existingIds.has(e.id))
      .map(e => ({ session_id: sessionId, enrollment_id: e.id, present: false }));

    if (!toInsert.length) return { created: 0 };

    const { error } = await this.supabase.admin.from('attendance').insert(toInsert);
    if (error) throw new NotFoundException(error.message);

    return { created: toInsert.length };
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  BULK UPSERT — Marcar asistencia en lote (la UI envía array completo)
  // ════════════════════════════════════════════════════════════════════════════

  async bulkUpsert(dto: BulkAttendanceDto, user: JwtUser) {
    this.requireEvaluator(user);

    const rows = dto.records.map(r => ({
      session_id:    dto.session_id,
      enrollment_id: r.enrollment_id,
      present:       r.present,
      marked_at:     new Date().toISOString(),
    }));

    const { data, error } = await this.supabase.admin
      .from('attendance')
      .upsert(rows, { onConflict: 'session_id,enrollment_id' })
      .select('*');

    if (error) throw new NotFoundException(error.message);
    return data ?? [];
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  SINGLE TOGGLE — Marcar/desmarcar un participante
  // ════════════════════════════════════════════════════════════════════════════

  async toggle(sessionId: string, enrollmentId: string, user: JwtUser) {
    this.requireEvaluator(user);

    const { data: existing } = await this.supabase.admin
      .from('attendance')
      .select('id, present')
      .eq('session_id', sessionId)
      .eq('enrollment_id', enrollmentId)
      .maybeSingle<{ id: string; present: boolean }>();

    if (existing) {
      const { data, error } = await this.supabase.admin
        .from('attendance')
        .update({ present: !existing.present, marked_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) throw new NotFoundException(error.message);
      return data;
    } else {
      // Si no existe, crearlo como presente
      const { data, error } = await this.supabase.admin
        .from('attendance')
        .insert({ session_id: sessionId, enrollment_id: enrollmentId, present: true })
        .select('*')
        .single();
      if (error) throw new NotFoundException(error.message);
      return data;
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  RECALCULATE — Recalcula attendance_percentage en enrollments
  //  Se llama después de guardar asistencia de una sesión
  // ════════════════════════════════════════════════════════════════════════════

  async recalculateAttendance(groupId: string, user: JwtUser) {
    this.requireEvaluator(user);

    // Total de sesiones del grupo
    const { data: sessions } = await this.supabase.admin
      .from('sessions')
      .select('id')
      .eq('group_id', groupId);

    const totalSessions = sessions?.length ?? 0;
    if (totalSessions === 0) return { updated: 0 };

    // Todos los inscritos del grupo
    const { data: enrollments } = await this.supabase.admin
      .from('enrollments')
      .select('id')
      .eq('group_id', groupId);

    if (!enrollments?.length) return { updated: 0 };

    let updated = 0;
    for (const enrollment of enrollments) {
      const { data: att } = await this.supabase.admin
        .from('attendance')
        .select('present')
        .eq('enrollment_id', enrollment.id);

      const present = (att ?? []).filter(a => a.present).length;
      const pct = totalSessions > 0 ? Math.round((present / totalSessions) * 100) : 0;

      await this.supabase.admin
        .from('enrollments')
        .update({ attendance_percentage: pct, updated_at: new Date().toISOString() })
        .eq('id', enrollment.id);

      updated++;
    }

    return { updated };
  }
}
