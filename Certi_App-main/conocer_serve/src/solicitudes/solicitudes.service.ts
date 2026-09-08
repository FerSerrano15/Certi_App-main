import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ParticipantsService } from '../participants/participants.service';
import { CreateSolicitudDto } from './dto/create-solicitud.dto';
import { ReviewSolicitudDto } from './dto/review-solicitud.dto';
import { PrepareSolicitudDto } from './dto/prepare-solicitud.dto';

type JwtUser = { id: string; role: string; email: string };

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];
const ENTITY = 'course_applications';

/**
 * Solicitudes de certificación (paso 3-4 del flujo). En la base real esta
 * entidad es `course_applications` (ya existía, sin módulo backend propio) —
 * aquí NO se crea una tabla nueva, se construye el flujo de negocio sobre la
 * que ya está en Supabase. Distinta de la ficha de registro (datos
 * personales) y del proceso de certificación (expediente formal, que solo
 * existe tras aprobar + preparar curso/grupo + asignar evaluador).
 */
@Injectable()
export class SolicitudesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly auditLogs: AuditLogsService,
    private readonly participants: ParticipantsService,
  ) {}

  private requireAdmin(user: JwtUser) {
    if (!ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('No tienes permisos para esta acción.');
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  CREAR / ENVIAR — el candidato ya tiene su ficha de registro para el
  //  estándar (paso 2); esta acción es la solicitud formal (paso 3-4).
  // ════════════════════════════════════════════════════════════════════════

  async create(dto: CreateSolicitudDto, user: JwtUser) {
    if (user.role !== 'CANDIDATO') {
      throw new ForbiddenException('Solo un candidato puede crear una solicitud de certificación.');
    }

    const { data: estandar, error: estandarErr } = await this.supabase.admin
      .from('estandares').select('id, codigo, nombre, vigente').eq('id', dto.estandar_id).single();
    if (estandarErr || !estandar) throw new NotFoundException('Estándar no encontrado.');
    if (!estandar.vigente) throw new ConflictException('Este estándar ya no está vigente.');

    const { data: ficha } = await this.supabase.admin
      .from('fichas_registro')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('estandar_id', dto.estandar_id)
      .maybeSingle();
    if (!ficha || !['enviada', 'validada'].includes(ficha.status)) {
      throw new BadRequestException(
        'Primero debes capturar y enviar tu ficha de registro para este estándar.',
      );
    }

    const participant = await this.participants.resolveOrCreateSelfParticipant(user);

    const { data: existing } = await this.supabase.admin
      .from('course_applications')
      .select('id, status')
      .eq('participant_id', participant.id)
      .eq('estandar_id', dto.estandar_id)
      .not('status', 'in', '(rechazada,cancelada)')
      .maybeSingle();
    if (existing) {
      throw new ConflictException('Ya tienes una solicitud activa para este estándar.');
    }

    const { data, error } = await this.supabase.admin
      .from('course_applications')
      .insert({
        participant_id: participant.id,
        estandar_id: dto.estandar_id,
        status: 'pendiente',
        application_date: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (error) throw new ConflictException(error.message);

    await this.auditLogs.log({
      user_id: user.id,
      action: 'SOLICITUD_CREADA',
      entity: ENTITY,
      entityid: data.id,
      metadata: { status: 'pendiente', estandar_codigo: estandar.codigo },
    });

    return data;
  }

  async cancel(id: string, user: JwtUser) {
    const solicitud = await this.getOneRaw(id);
    const isAdmin = ADMIN_ROLES.includes(user.role);
    if (!isAdmin) {
      const participant = await this.participants.resolveOrCreateSelfParticipant(user);
      if (solicitud.participant_id !== participant.id) {
        throw new ForbiddenException('No puedes cancelar la solicitud de otro candidato.');
      }
    }
    if (!['pendiente', 'en_revision', 'aprobada'].includes(solicitud.status)) {
      throw new ConflictException('Esta solicitud ya no puede cancelarse.');
    }

    const { data, error } = await this.supabase.admin
      .from('course_applications')
      .update({ status: 'cancelada' })
      .eq('id', id).select('*').single();
    if (error || !data) throw new ConflictException('No se pudo cancelar la solicitud.');

    await this.auditLogs.log({
      user_id: user.id, action: 'SOLICITUD_CANCELADA', entity: ENTITY, entityid: id,
      old_data: { status: solicitud.status }, metadata: { status: 'cancelada' },
    });
    return data;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  CONSULTAR
  // ════════════════════════════════════════════════════════════════════════

  async listMine(user: JwtUser) {
    if (user.role !== 'CANDIDATO') throw new ForbiddenException('Esta acción es solo para candidatos.');
    const participant = await this.participants.resolveOrCreateSelfParticipant(user);
    const { data, error } = await this.supabase.admin
      .from('course_applications')
      .select('*, estandares ( codigo, nombre ), courses ( id, name, code ), groups ( id, name )')
      .eq('participant_id', participant.id)
      .order('created_at', { ascending: false });
    if (error) throw new ConflictException(error.message);
    return data ?? [];
  }

  async listAll(user: JwtUser, status?: string) {
    this.requireAdmin(user);
    let q = this.supabase.admin
      .from('course_applications')
      .select('*, participants ( id, full_name, email, phone ), estandares ( codigo, nombre )')
      .order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw new ConflictException(error.message);
    return data ?? [];
  }

  private async getOneRaw(id: string) {
    const { data, error } = await this.supabase.admin
      .from('course_applications').select('*').eq('id', id).single();
    if (error || !data) throw new NotFoundException('Solicitud no encontrada.');
    return data;
  }

  /** Detalle completo — candidato dueño o admin. Alimenta la pantalla de detalle con pestañas. */
  async getOne(id: string, user: JwtUser) {
    const solicitud = await this.getOneRaw(id);
    const isAdmin = ADMIN_ROLES.includes(user.role);

    const { data: participant } = await this.supabase.admin
      .from('participants').select('*').eq('id', solicitud.participant_id).single();

    if (!isAdmin) {
      if (!participant || participant.user_id !== user.id) {
        throw new ForbiddenException('No tienes acceso a esta solicitud.');
      }
    }

    const [{ data: estandar }, { data: fichaRegistro }, history, { data: process }, { data: documentos }] = await Promise.all([
      this.supabase.admin.from('estandares').select('*').eq('id', solicitud.estandar_id).single(),
      this.supabase.admin.from('fichas_registro').select('*')
        .eq('user_id', participant?.user_id ?? '').eq('estandar_id', solicitud.estandar_id).maybeSingle(),
      this.getHistory(id),
      this.supabase.admin.from('certification_processes').select('id, folio, status').eq('application_id', id).maybeSingle(),
      isAdmin
        ? this.supabase.admin.from('documents').select('*').eq('participant_id', solicitud.participant_id).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as unknown[] }),
    ]);

    return { ...solicitud, candidato: participant, estandar, fichaRegistro, history, documentos: documentos ?? [], process: process ?? null };
  }

  /** Trazabilidad de cambios de estado — se reconstruye desde audit_logs (no hay tabla de historial propia). */
  async getHistory(id: string) {
    const { data, error } = await this.supabase.admin
      .from('audit_logs')
      .select('*, users ( full_name )')
      .eq('entity_type', ENTITY)
      .eq('entity_id', id)
      .order('created_at', { ascending: true });
    if (error) throw new ConflictException(error.message);
    return data ?? [];
  }

  // ════════════════════════════════════════════════════════════════════════
  //  REVISIÓN (ADMIN)
  // ════════════════════════════════════════════════════════════════════════

  async review(id: string, dto: ReviewSolicitudDto, user: JwtUser) {
    this.requireAdmin(user);
    let solicitud = await this.getOneRaw(id);

    // Primer contacto del admin con la solicitud: pendiente -> en_revision.
    if (solicitud.status === 'pendiente') {
      const { data } = await this.supabase.admin
        .from('course_applications').update({ status: 'en_revision' }).eq('id', id).select('*').single();
      await this.auditLogs.log({
        user_id: user.id, action: 'SOLICITUD_EN_REVISION', entity: ENTITY, entityid: id,
        old_data: { status: 'pendiente' }, metadata: { status: 'en_revision' },
      });
      solicitud = data ?? solicitud;
    }

    if (solicitud.status !== 'en_revision') {
      throw new ConflictException('Solo una solicitud en revisión puede aprobarse, rechazarse o recibir una corrección solicitada.');
    }

    if (dto.action === 'approve') {
      const { data, error } = await this.supabase.admin
        .from('course_applications')
        .update({ status: 'aprobada', reviewed_by: user.id, reviewed_at: new Date().toISOString(), notes: dto.reason ?? solicitud.notes })
        .eq('id', id).select('*').single();
      if (error || !data) throw new ConflictException('No se pudo aprobar la solicitud.');
      await this.auditLogs.log({
        user_id: user.id, action: 'SOLICITUD_APROBADA', entity: ENTITY, entityid: id,
        old_data: { status: 'en_revision' }, metadata: { status: 'aprobada', reason: dto.reason },
      });
      return data;
    }

    if (dto.action === 'reject') {
      if (!dto.reason || dto.reason.trim().length < 3) {
        throw new BadRequestException('Debes indicar el motivo del rechazo.');
      }
      const { data, error } = await this.supabase.admin
        .from('course_applications')
        .update({ status: 'rechazada', reviewed_by: user.id, reviewed_at: new Date().toISOString(), notes: dto.reason })
        .eq('id', id).select('*').single();
      if (error || !data) throw new ConflictException('No se pudo rechazar la solicitud.');
      await this.auditLogs.log({
        user_id: user.id, action: 'SOLICITUD_RECHAZADA', entity: ENTITY, entityid: id,
        old_data: { status: 'en_revision' }, metadata: { status: 'rechazada', reason: dto.reason },
      });
      return data;
    }

    // request_correction: la solicitud permanece en_revision — no hay un
    // estado propio para esto en el enum real; queda trazado en audit_logs
    // (old_data === new_data a propósito: es una anotación, no un cambio de
    // estado) y en `notes`, visible para el candidato.
    if (!dto.reason || dto.reason.trim().length < 3) {
      throw new BadRequestException('Debes indicar qué debe corregir el candidato.');
    }
    const { data, error } = await this.supabase.admin
      .from('course_applications')
      .update({ reviewed_by: user.id, reviewed_at: new Date().toISOString(), notes: `[Corrección solicitada] ${dto.reason}` })
      .eq('id', id).select('*').single();
    if (error || !data) throw new ConflictException('No se pudo solicitar la corrección.');
    await this.auditLogs.log({
      user_id: user.id, action: 'SOLICITUD_CORRECCION_SOLICITADA', entity: ENTITY, entityid: id,
      old_data: { status: 'en_revision' }, metadata: { status: 'en_revision', reason: dto.reason },
    });
    return data;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  PREPARACIÓN (ADMIN) — asigna curso/grupo a una solicitud ya APROBADA
  // ════════════════════════════════════════════════════════════════════════

  async prepare(id: string, dto: PrepareSolicitudDto, user: JwtUser) {
    this.requireAdmin(user);
    const solicitud = await this.getOneRaw(id);
    if (solicitud.status !== 'aprobada') {
      throw new ConflictException('Solo una solicitud aprobada puede prepararse con curso/grupo.');
    }

    const { data: course, error: courseErr } = await this.supabase.admin
      .from('courses').select('id, estandar_id').eq('id', dto.course_id).single();
    if (courseErr || !course) throw new NotFoundException('Curso no encontrado.');
    if (course.estandar_id !== solicitud.estandar_id) {
      throw new ConflictException('El curso seleccionado no corresponde al estándar de esta solicitud.');
    }

    if (dto.group_id) {
      const { data: group, error: groupErr } = await this.supabase.admin
        .from('groups').select('id, course_id').eq('id', dto.group_id).single();
      if (groupErr || !group) throw new NotFoundException('Grupo no encontrado.');
      if (group.course_id !== dto.course_id) {
        throw new ConflictException('El grupo seleccionado no pertenece al curso indicado.');
      }
    }

    const { data, error } = await this.supabase.admin
      .from('course_applications')
      .update({ course_id: dto.course_id, group_id: dto.group_id ?? null })
      .eq('id', id).select('*').single();
    if (error || !data) throw new ConflictException('No se pudo preparar la solicitud.');

    await this.auditLogs.log({
      user_id: user.id, action: 'SOLICITUD_PREPARADA', entity: ENTITY, entityid: id,
      metadata: { course_id: dto.course_id, group_id: dto.group_id ?? null },
    });
    return data;
  }

  /** Usado por CertificationProcessService al crear el proceso, y al cerrarlo. */
  async markCompleted(id: string, user: JwtUser) {
    await this.supabase.admin.from('course_applications').update({ status: 'completada' }).eq('id', id);
    await this.auditLogs.log({
      user_id: user.id, action: 'SOLICITUD_COMPLETADA', entity: ENTITY, entityid: id,
      metadata: { status: 'completada' },
    });
  }
}
