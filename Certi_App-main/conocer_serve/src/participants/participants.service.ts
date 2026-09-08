import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateParticipantDto } from './dto/create-participant.dto';

type JwtUser = { id: string; role: string; email: string };

@Injectable()
export class ParticipantsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  private requireAtLeastEvaluator(user: JwtUser) {
    if (!['SUPER_ADMIN', 'ADMIN', 'EVALUADOR'].includes(user.role)) {
      throw new ForbiddenException('No tienes permisos para esta acción.');
    }
  }

  private requireAdmin(user: JwtUser) {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(user.role)) {
      throw new ForbiddenException('No tienes permisos para esta acción.');
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  LIST
  // ════════════════════════════════════════════════════════════════════════════

  async listParticipants(user: JwtUser, search?: string) {
    let q = this.supabase.admin
      .from('participants')
      .select('*')
      .order('full_name');

    // CANDIDATO sólo ve su propio registro de participante
    if (user.role === 'CANDIDATO') {
      q = q.or(`user_id.eq.${user.id},email.eq.${user.email}`);
    }

    if (search) {
      q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,national_id.ilike.%${search}%`);
    }

    const { data, error } = await q;
    if (error) throw new NotFoundException(error.message);
    return data ?? [];
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  ELEGIBLES PARA UN GRUPO
  //  Un candidato aparece como opción para inscribirse en un grupo únicamente si:
  //   1) No está ya inscrito en ese grupo.
  //   2) Ya llenó (en alguna inscripción previa) su carta_solicitud y su
  //      ficha_registro con status = 'submitted' — es decir, ya demostró
  //      tener su documentación de candidato en regla.
  // ════════════════════════════════════════════════════════════════════════════

  async getEligibleForGroup(groupId: string, user: JwtUser) {
    this.requireAtLeastEvaluator(user);

    const { data: group, error: groupErr } = await this.supabase.admin
      .from('groups')
      .select('id')
      .eq('id', groupId)
      .single();
    if (groupErr || !group) throw new NotFoundException('Grupo no encontrado.');

    const { data: currentEnrollments } = await this.supabase.admin
      .from('enrollments')
      .select('participant_id')
      .eq('group_id', groupId);
    const enrolledIds = new Set(
      (currentEnrollments ?? []).map((e: { participant_id: string }) => e.participant_id),
    );

    const { data: allParticipants, error } = await this.supabase.admin
      .from('participants').select('*').order('full_name');
    if (error) throw new NotFoundException(error.message);

    const candidates = (allParticipants ?? []).filter(
      (p: { id: string }) => !enrolledIds.has(p.id),
    );
    if (candidates.length === 0) return [];
    const candidateIds = candidates.map((c: { id: string }) => c.id);

    // Todas las inscripciones previas de estos candidatos (en cualquier grupo)
    const { data: priorEnrollments } = await this.supabase.admin
      .from('enrollments')
      .select('id, participant_id')
      .in('participant_id', candidateIds);

    const enrollmentToParticipant = new Map<string, string>();
    (priorEnrollments ?? []).forEach((e: { id: string; participant_id: string }) => {
      enrollmentToParticipant.set(e.id, e.participant_id);
    });
    const enrollmentIds = Array.from(enrollmentToParticipant.keys());
    if (enrollmentIds.length === 0) return [];

    const { data: forms } = await this.supabase.admin
      .from('enrollment_forms')
      .select('enrollment_id, form_type, status')
      .in('enrollment_id', enrollmentIds)
      .eq('status', 'submitted');

    const submittedByParticipant = new Map<string, Set<string>>();
    (forms ?? []).forEach((f: { enrollment_id: string; form_type: string }) => {
      const pid = enrollmentToParticipant.get(f.enrollment_id);
      if (!pid) return;
      if (!submittedByParticipant.has(pid)) submittedByParticipant.set(pid, new Set());
      submittedByParticipant.get(pid)!.add(f.form_type);
    });

    return candidates.filter((p: { id: string }) => {
      const types = submittedByParticipant.get(p.id);
      return !!types && types.has('carta_solicitud') && types.has('ficha_registro');
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  RESOLVER/CREAR EL REGISTRO PROPIO DE CANDIDATO (autoservicio)
  //  Usado por EnrollmentsService, DocumentsService y CertificatesService
  //  cuando un CANDIDATO realiza una acción sobre sí mismo (inscribirse,
  //  subir un documento, etc.) y aún no tiene fila en `participants`.
  // ════════════════════════════════════════════════════════════════════════════

  async resolveOrCreateSelfParticipant(user: JwtUser) {
    const { data: profile, error: profileErr } = await this.supabase.admin
      .from('users')
      .select('email, full_name, phone')
      .eq('id', user.id)
      .single<{ email: string; full_name: string; phone: string | null }>();
    if (profileErr || !profile) throw new NotFoundException('Usuario no encontrado.');

    const { data: existing } = await this.supabase.admin
      .from('participants')
      .select('*')
      .or(`user_id.eq.${user.id},email.eq.${profile.email}`)
      .maybeSingle();

    if (existing) {
      if (!existing.user_id) {
        // El admin ya había prerregistrado a este candidato; lo vinculamos a su cuenta.
        await this.supabase.admin.from('participants').update({ user_id: user.id }).eq('id', existing.id);
        existing.user_id = user.id;
      }
      return existing;
    }

    const { data: newParticipant, error: createErr } = await this.supabase.admin
      .from('participants')
      .insert({
        user_id: user.id,
        full_name: profile.full_name,
        email: profile.email,
        phone: profile.phone,
      })
      .select('*')
      .single();
    if (createErr || !newParticipant) {
      throw new ConflictException('No se pudo crear tu registro de candidato: ' + createErr?.message);
    }
    return newParticipant;
  }

  async getParticipant(id: string, user: JwtUser) {
    this.requireAtLeastEvaluator(user);
    const { data, error } = await this.supabase.admin
      .from('participants')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) throw new NotFoundException('Participante no encontrado.');
    return data;
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  CREATE
  // ════════════════════════════════════════════════════════════════════════════

  async createParticipant(dto: CreateParticipantDto, user: JwtUser) {
    this.requireAdmin(user);

    const { data, error } = await this.supabase.admin
      .from('participants')
      .insert({
        user_id:        dto.user_id ?? null,
        full_name:      dto.full_name,
        email:          dto.email,
        phone:          dto.phone ?? null,
        national_id:    dto.national_id ?? null,
      })
      .select('*')
      .single();

    if (error) throw new ConflictException(error.message);
    return data;
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  UPDATE
  // ════════════════════════════════════════════════════════════════════════════

  async updateParticipant(id: string, dto: Partial<CreateParticipantDto>, user: JwtUser) {
    this.requireAdmin(user);
    const { data, error } = await this.supabase.admin
      .from('participants')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error || !data) throw new NotFoundException('Participante no encontrado.');
    return data;
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  DELETE
  // ════════════════════════════════════════════════════════════════════════════

  async deleteParticipant(id: string, user: JwtUser) {
    this.requireAdmin(user);
    const { error } = await this.supabase.admin
      .from('participants')
      .delete()
      .eq('id', id);
    if (error) throw new NotFoundException(error.message);
    await this.auditLogs.log({
      user_id: user.id,
      action: 'PARTICIPANT_DELETED', entity: 'participants', entityid: id,
    });
    return { message: 'Participante eliminado.' };
  }
}
