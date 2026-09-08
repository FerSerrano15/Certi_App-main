import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ParticipantsService } from '../participants/participants.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';

type JwtUser = { id: string; role: string; email: string };

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly participants: ParticipantsService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  private requireAdmin(user: JwtUser) {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(user.role)) {
      throw new ForbiddenException('No tienes permisos para esta acción.');
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  LIST — Por group_id o por participant_id
  // ════════════════════════════════════════════════════════════════════════════

  async listEnrollments(user: JwtUser, groupId?: string, participantId?: string) {
    let q = this.supabase.admin
      .from('enrollments')
      .select(`
        *,
        participants ( id, full_name, email, national_id ),
        groups ( id, name, course_id, courses ( id, name, code ) )
      `)
      .order('enrolled_at', { ascending: false });

    if (groupId)       q = q.eq('group_id', groupId);
    if (participantId) q = q.eq('participant_id', participantId);

    const { data, error } = await q;
    if (error) throw new NotFoundException(error.message);
    return data ?? [];
  }

  async getEnrollment(id: string) {
    const { data, error } = await this.supabase.admin
      .from('enrollments')
      .select(`
        *,
        participants ( id, full_name, email, national_id, phone ),
        groups ( id, name, courses ( id, name, code, passing_grade, min_attendance ) )
      `)
      .eq('id', id)
      .single();
    if (error || !data) throw new NotFoundException('Inscripción no encontrada.');
    return data;
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  SELF-ENROLL — El propio candidato (CANDIDATO) solicita inscripción a un grupo
  //  Crea (o vincula) su registro de participante automáticamente si no existe.
  // ════════════════════════════════════════════════════════════════════════════

  async selfEnroll(groupId: string, user: JwtUser) {
    if (user.role !== 'CANDIDATO') {
      throw new ForbiddenException('Esta acción es solo para candidatos.');
    }

    // 1. El grupo debe existir y seguir abierto a inscripciones
    const { data: group, error: groupErr } = await this.supabase.admin
      .from('groups')
      .select('id, status')
      .eq('id', groupId)
      .single<{ id: string; status: string }>();
    if (groupErr || !group) throw new NotFoundException('Grupo no encontrado.');
    if (['FINALIZADO', 'CANCELADO'].includes(group.status)) {
      throw new ConflictException('Este grupo ya no acepta inscripciones.');
    }

    // 2. Buscar (o crear) su registro de candidato en participants
    const participant = await this.participants.resolveOrCreateSelfParticipant(user);

    // 3. Evitar inscripciones duplicadas
    const { data: existingEnrollment } = await this.supabase.admin
      .from('enrollments')
      .select('*')
      .eq('group_id', groupId)
      .eq('participant_id', participant.id)
      .maybeSingle();
    if (existingEnrollment) return existingEnrollment;

    // 4. Crear la inscripción
    const { data, error } = await this.supabase.admin
      .from('enrollments')
      .insert({ group_id: groupId, participant_id: participant.id, status: 'enrolled' })
      .select('*')
      .single();
    if (error) throw new ConflictException(error.message);
    return data;
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  CREATE — Inscribir un participante a un grupo
  // ════════════════════════════════════════════════════════════════════════════

  async createEnrollment(dto: CreateEnrollmentDto, user: JwtUser) {
    this.requireAdmin(user);

    // Verificar que no esté ya inscrito en ese grupo
    const { data: existing } = await this.supabase.admin
      .from('enrollments')
      .select('id')
      .eq('group_id', dto.group_id)
      .eq('participant_id', dto.participant_id)
      .maybeSingle();

    if (existing) {
      throw new ConflictException('El participante ya está inscrito en este grupo.');
    }

    const { data, error } = await this.supabase.admin
      .from('enrollments')
      .insert({
        group_id:              dto.group_id,
        participant_id:        dto.participant_id,
        final_grade:           dto.final_grade ?? null,
        attendance_percentage: dto.attendance_percentage ?? null,
        documents_validated:   dto.documents_validated ?? false,
        status:                dto.status ?? 'enrolled',
      })
      .select('*')
      .single();

    if (error) throw new ConflictException(error.message);
    return data;
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  UPDATE — Calificación, asistencia, estado, documentos
  // ════════════════════════════════════════════════════════════════════════════

  async updateEnrollment(id: string, dto: Partial<CreateEnrollmentDto>, user: JwtUser) {
    this.requireAdmin(user);
    const { data, error } = await this.supabase.admin
      .from('enrollments')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error || !data) throw new NotFoundException('Inscripción no encontrada.');
    return data;
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  DELETE — Dar de baja la inscripción
  // ════════════════════════════════════════════════════════════════════════════

  async deleteEnrollment(id: string, user: JwtUser) {
    this.requireAdmin(user);
    const { error } = await this.supabase.admin
      .from('enrollments')
      .delete()
      .eq('id', id);
    if (error) throw new NotFoundException(error.message);
    await this.auditLogs.log({
      user_id: user.id,
      action: 'ENROLLMENT_DELETED', entity: 'enrollments', entityid: id,
    });
    return { message: 'Inscripción eliminada.' };
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  STATS — Resumen de un grupo (para reportes)
  // ════════════════════════════════════════════════════════════════════════════

  async getGroupStats(groupId: string) {
    const { data, error } = await this.supabase.admin
      .from('enrollments')
      .select('status, final_grade, attendance_percentage, documents_validated')
      .eq('group_id', groupId);

    if (error) throw new NotFoundException(error.message);
    const rows = data ?? [];

    return {
      total:       rows.length,
      enrolled:    rows.filter(r => r.status === 'enrolled').length,
      completed:   rows.filter(r => r.status === 'completed').length,
      dropped:     rows.filter(r => r.status === 'dropped').length,
      avg_grade:   rows.length ? +(rows.reduce((s, r) => s + (r.final_grade ?? 0), 0) / rows.length).toFixed(1) : null,
      avg_attend:  rows.length ? +(rows.reduce((s, r) => s + (r.attendance_percentage ?? 0), 0) / rows.length).toFixed(1) : null,
      docs_ok:     rows.filter(r => r.documents_validated).length,
    };
  }
}
