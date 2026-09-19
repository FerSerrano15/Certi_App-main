import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ParticipantsService } from '../participants/participants.service';
import { CertificationsService } from '../certifications/certifications.service';
import { SolicitudesService } from '../solicitudes/solicitudes.service';
import { CreateProcessDto } from './dto/create-process.dto';
import { FormarGrupoDto } from './dto/formar-grupo.dto';
import { DeleteGroupDto } from './dto/delete-group.dto';

export interface FormarGrupoResultItem {
  ficha_id: string;
  ok: boolean;
  process_id?: string;
  folio?: string;
  error?: string;
}

export type JwtUser = { id: string; role: string; email: string };

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];
const ENTITY = 'certification_processes';

/**
 * Expediente formal del candidato (certification_processes +
 * certification_process_stages). Solo se crea cuando la solicitud ya está
 * APROBADA, tiene curso asignado, y el evaluador fue re-validado en backend
 * (nunca se confía en lo que ya se mostró en el frontend).
 */
@Injectable()
export class CertificationProcessService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly auditLogs: AuditLogsService,
    private readonly participants: ParticipantsService,
    private readonly certifications: CertificationsService,
    private readonly solicitudes: SolicitudesService,
  ) {}

  private requireAdmin(user: JwtUser) {
    if (!ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('No tienes permisos para esta acción.');
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  EVALUADORES CALIFICADOS (para la pantalla de selección)
  // ════════════════════════════════════════════════════════════════════════

  async getQualifiedEvaluators(estandarId: string, user: JwtUser) {
    this.requireAdmin(user);
    return this.certifications.getQualifiedEvaluators(estandarId);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  CREAR EL PROCESO
  // ════════════════════════════════════════════════════════════════════════

  async create(dto: CreateProcessDto, user: JwtUser) {
    this.requireAdmin(user);

    const { data: application, error: appErr } = await this.supabase.admin
      .from('course_applications')
      .select('id, participant_id, estandar_id, course_id, group_id, status')
      .eq('id', dto.application_id)
      .single();
    if (appErr || !application) throw new NotFoundException('Solicitud no encontrada.');
    if (application.status !== 'aprobada') {
      throw new ConflictException('Solo una solicitud aprobada puede convertirse en proceso de certificación.');
    }
    if (!application.course_id) {
      throw new ConflictException('Primero debes preparar la solicitud con un curso (y grupo, si aplica).');
    }

    const { data: existingProcess } = await this.supabase.admin
      .from('certification_processes').select('id').eq('application_id', dto.application_id).maybeSingle();
    if (existingProcess) {
      throw new ConflictException('Esta solicitud ya tiene un proceso de certificación.');
    }

    // Re-validación server-side de la regla completa de evaluador calificado
    // — nunca confiar solo en lo que ya filtró el frontend.
    await this.certifications.assertEvaluatorQualified(dto.evaluator_id, application.estandar_id);

    const { data: estandar } = await this.supabase.admin
      .from('estandares').select('codigo, nombre').eq('id', application.estandar_id).single();

    const folio = await this.generateUniqueFolio(estandar?.codigo ?? 'PROC');

    const { data: process, error } = await this.supabase.admin
      .from('certification_processes')
      .insert({
        folio,
        application_id: application.id,
        participant_id: application.participant_id,
        estandar_id: application.estandar_id,
        course_id: application.course_id,
        group_id: application.group_id ?? null,
        evaluator_id: dto.evaluator_id,
        status: 'PREPARACION',
      })
      .select('*')
      .single();
    if (error || !process) throw new ConflictException(error?.message ?? 'No se pudo crear el proceso.');

    // Genera TODAS las etapas del catálogo — nunca se agregan/quitan después.
    const { data: catalog } = await this.supabase.admin
      .from('certification_stage_catalog')
      .select('code, stage_order')
      .eq('is_active', true)
      .order('stage_order', { ascending: true });

    if (catalog?.length) {
      const stageRows = catalog.map((s: { code: string }) => ({
        process_id: process.id,
        stage_code: s.code,
        status: 'pending',
      }));
      await this.supabase.admin.from('certification_process_stages').insert(stageRows);
    }

    await this.auditLogs.log({
      user_id: user.id,
      action: 'EVALUADOR_ASIGNADO',
      entity: ENTITY,
      entityid: process.id,
      metadata: { evaluator_id: dto.evaluator_id, application_id: application.id },
    });
    await this.auditLogs.log({
      user_id: user.id,
      action: 'CERTIFICATION_PROCESS_CREADO',
      entity: ENTITY,
      entityid: process.id,
      metadata: { folio, estandar_id: application.estandar_id },
    });

    return this.getOne(process.id, user);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  FORMAR GRUPO — acción compuesta del admin: a partir de fichas de
  //  registro ya validadas, crea/adopta la solicitud de cada candidato, la
  //  aprueba con el curso/grupo elegido y de inmediato le asigna el
  //  evaluador. Reemplaza abrir la solicitud de cada candidato una por una.
  // ════════════════════════════════════════════════════════════════════════

  async formarGrupo(dto: FormarGrupoDto, user: JwtUser): Promise<FormarGrupoResultItem[]> {
    this.requireAdmin(user);

    // Se valida una sola vez para todo el grupo — si el evaluador no
    // califica, no tiene sentido seguir candidato por candidato.
    await this.certifications.assertEvaluatorQualified(dto.evaluator_id, dto.estandar_id);

    const results: FormarGrupoResultItem[] = [];
    for (const fichaId of dto.ficha_ids) {
      try {
        const application = await this.solicitudes.createFromFicha(
          { ficha_id: fichaId, course_id: dto.course_id, group_id: dto.group_id },
          user,
        );
        const process = await this.create({ application_id: application.id, evaluator_id: dto.evaluator_id }, user);
        results.push({ ficha_id: fichaId, ok: true, process_id: process.id, folio: process.folio });
      } catch (err: any) {
        results.push({
          ficha_id: fichaId,
          ok: false,
          error: err?.message ?? 'No se pudo formar el grupo para esta ficha.',
        });
      }
    }
    return results;
  }

  /** Cierra el proceso (CIERRE) y marca la solicitud origen como completada. */
  async closeProcess(processId: string, user: JwtUser) {
    const process = await this.advanceStatus(processId, 'CIERRE', user, { completed_at: new Date().toISOString() });
    await this.solicitudes.markCompleted(process.application_id, user);
    return process;
  }

  /**
   * Cancela el proceso de un candidato dentro de un grupo (ADMIN) — para
   * deshacer una asignación hecha por error o dar de baja a un candidato
   * que ya no continuará. Libera también la solicitud origen (queda
   * 'cancelada'), por lo que el candidato vuelve a aparecer como disponible
   * para "Formar Grupo" en este estándar.
   */
  async cancelProcess(processId: string, user: JwtUser) {
    this.requireAdmin(user);
    const process = await this.getProcessRaw(processId);
    if (['CIERRE', 'CANCELADO'].includes(process.status)) {
      throw new ConflictException('Este proceso ya está cerrado o cancelado.');
    }
    const updated = await this.advanceStatus(processId, 'CANCELADO', user);
    await this.solicitudes.cancel(process.application_id, user);
    return updated;
  }

  private async generateUniqueFolio(estandarCodigo: string): Promise<string> {
    const prefix = (estandarCodigo || 'PROC').replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || 'PROC';
    for (let attempt = 0; attempt < 5; attempt++) {
      const random = crypto.randomBytes(4).toString('hex').toUpperCase();
      const year = new Date().getFullYear();
      const folio = `PROC-${prefix}-${year}-${random}`;
      const { data } = await this.supabase.admin
        .from('certification_processes').select('id').eq('folio', folio).maybeSingle();
      if (!data) return folio;
    }
    throw new ConflictException('No se pudo generar un folio único. Intenta de nuevo.');
  }

  // ════════════════════════════════════════════════════════════════════════
  //  ACCESO / PROPIEDAD — reutilizado por StagesService y EvidencesService
  // ════════════════════════════════════════════════════════════════════════

  async getProcessRaw(id: string) {
    const { data, error } = await this.supabase.admin
      .from('certification_processes').select('*').eq('id', id).single();
    if (error || !data) throw new NotFoundException('Proceso de certificación no encontrado.');
    return data;
  }

  /**
   * Verifica que `user` pueda actuar sobre el proceso `id` y devuelve el
   * proceso. Un EVALUADOR solo puede ver/actuar sobre SUS procesos
   * asignados; un CANDIDATO solo sobre el suyo; ADMIN/SUPER_ADMIN sin
   * restricción. Lanza ForbiddenException en cualquier otro caso — esta es
   * la barrera que bloquea "evaluador viendo proceso de otro" y "candidato
   * viendo expediente ajeno".
   */
  async getProcessForActor(id: string, user: JwtUser) {
    const process = await this.getProcessRaw(id);
    if (ADMIN_ROLES.includes(user.role)) return process;

    if (user.role === 'EVALUADOR') {
      if (process.evaluator_id !== user.id) {
        throw new ForbiddenException('No tienes acceso a este proceso: no eres el evaluador asignado.');
      }
      return process;
    }

    if (user.role === 'CANDIDATO') {
      const { data: participant } = await this.supabase.admin
        .from('participants').select('id, user_id').eq('id', process.participant_id).single();
      if (!participant || participant.user_id !== user.id) {
        throw new ForbiddenException('No tienes acceso a este expediente de certificación.');
      }
      // El candidato ve que el grupo existe (listMine), pero no puede ENTRAR
      // a su expediente hasta que el evaluador asignado lo habilite.
      if (!process.candidate_enabled) {
        throw new ForbiddenException('Tu evaluador aún no ha habilitado el acceso a este proceso.');
      }
      return process;
    }

    throw new ForbiddenException('No tienes acceso a este proceso.');
  }

  /**
   * El evaluador asignado (o un admin) habilita el acceso del candidato a
   * su propio expediente. Antes de esto, el candidato solo ve el grupo en
   * su lista pero no puede abrirlo.
   */
  async enableForCandidate(processId: string, user: JwtUser) {
    const process = await this.getProcessRaw(processId);
    const isAdmin = ADMIN_ROLES.includes(user.role);
    const isAssignedEvaluador = user.role === 'EVALUADOR' && process.evaluator_id === user.id;
    if (!isAdmin && !isAssignedEvaluador) {
      throw new ForbiddenException('Solo el evaluador asignado o un admin pueden habilitar el acceso del candidato.');
    }
    if (process.candidate_enabled) return process;

    const { data, error } = await this.supabase.admin
      .from('certification_processes')
      .update({ candidate_enabled: true })
      .eq('id', processId)
      .select('*')
      .single();
    if (error || !data) throw new ConflictException('No se pudo habilitar el acceso del candidato.');

    await this.auditLogs.log({
      user_id: user.id, action: 'CANDIDATO_HABILITADO', entity: ENTITY, entityid: processId,
    });
    return data;
  }

  /**
   * Elimina definitivamente un grupo ya cancelado — solo cuando TODOS sus
   * candidatos están en CANCELADO. Borra el historial de esos procesos y,
   * si el grupo tenía nombre, también la fila de `groups` (y sus sesiones).
   * Acción destructiva: solo un admin puede hacerla.
   */
  async deleteCancelledGroup(dto: DeleteGroupDto, user: JwtUser) {
    if (!ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('Solo un admin puede eliminar un grupo.');
    }

    const { data: processes, error } = await this.supabase.admin
      .from('certification_processes').select('id, status').in('id', dto.process_ids);
    if (error) throw new ConflictException(error.message);
    if (!processes || processes.length !== dto.process_ids.length) {
      throw new NotFoundException('Alguno de los procesos indicados no existe.');
    }
    if (processes.some((p: { status: string }) => p.status !== 'CANCELADO')) {
      throw new ConflictException('Solo se puede eliminar un grupo cuando todos sus candidatos están cancelados.');
    }

    await this.supabase.admin.from('certification_processes').delete().in('id', dto.process_ids);
    if (dto.group_id) {
      await this.supabase.admin.from('sessions').delete().eq('group_id', dto.group_id);
      await this.supabase.admin.from('groups').delete().eq('id', dto.group_id);
    }

    await this.auditLogs.log({
      user_id: user.id, action: 'GRUPO_ELIMINADO', entity: ENTITY, entityid: dto.group_id ?? 'sin-grupo',
      metadata: { process_ids: dto.process_ids },
    });
    return { message: 'Grupo eliminado.' };
  }

  // ════════════════════════════════════════════════════════════════════════
  //  CONSULTAR
  // ════════════════════════════════════════════════════════════════════════

  async getOne(id: string, user: JwtUser) {
    const process = await this.getProcessForActor(id, user);

    const [{ data: stages }, { data: participant }, { data: estandar }, { data: course }, { data: group }, { data: evaluator }] = await Promise.all([
      this.supabase.admin.from('certification_process_stages')
        .select('*, certification_stage_catalog ( name, description, stage_order )')
        .eq('process_id', id),
      this.supabase.admin.from('participants').select('id, full_name, email, phone, user_id').eq('id', process.participant_id).single(),
      this.supabase.admin.from('estandares').select('id, codigo, nombre').eq('id', process.estandar_id).single(),
      this.supabase.admin.from('courses').select('id, name, code').eq('id', process.course_id).single(),
      process.group_id ? this.supabase.admin.from('groups').select('id, name').eq('id', process.group_id).single() : Promise.resolve({ data: null }),
      this.supabase.admin.from('users').select('id, full_name, email').eq('id', process.evaluator_id).single(),
    ]);

    const orderedStages = (stages ?? []).sort(
      (a: any, b: any) => (a.certification_stage_catalog?.stage_order ?? 0) - (b.certification_stage_catalog?.stage_order ?? 0),
    );

    // El candidato solo ve las etapas que el evaluador le habilitó
    // explícitamente (metadata.candidate_enabled) — admin/evaluador siempre
    // ven el catálogo completo para poder habilitarlas.
    const visibleStages = user.role === 'CANDIDATO'
      ? orderedStages.filter((s: any) => s.metadata?.candidate_enabled === true)
      : orderedStages;

    const { data: judgment } = await this.supabase.admin
      .from('process_judgments').select('*').eq('process_id', id).maybeSingle();

    return { ...process, stages: visibleStages, participant, estandar, course, group, evaluator, judgment: judgment ?? null };
  }

  async listMine(user: JwtUser, status?: string) {
    if (user.role === 'CANDIDATO') {
      const participant = await this.participants.resolveOrCreateSelfParticipant(user);
      let q = this.supabase.admin
        .from('certification_processes')
        .select('*, estandares ( codigo, nombre ), courses ( name, code ), groups ( id, name ), users:evaluator_id ( id, full_name, email )')
        .eq('participant_id', participant.id)
        .order('created_at', { ascending: false });
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw new ConflictException(error.message);
      return data ?? [];
    }
    if (user.role === 'EVALUADOR') {
      let q = this.supabase.admin
        .from('certification_processes')
        .select('*, estandares ( codigo, nombre ), courses ( name, code ), groups ( id, name ), participants ( full_name, email )')
        .eq('evaluator_id', user.id)
        .order('created_at', { ascending: false });
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw new ConflictException(error.message);
      return data ?? [];
    }
    return this.listAll(user, status);
  }

  async listAll(user: JwtUser, status?: string) {
    this.requireAdmin(user);
    let q = this.supabase.admin
      .from('certification_processes')
      .select('*, estandares ( codigo, nombre ), courses ( name, code ), groups ( id, name ), participants ( full_name, email ), users:evaluator_id ( full_name, email )')
      .order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw new ConflictException(error.message);
    return data ?? [];
  }

  // ════════════════════════════════════════════════════════════════════════
  //  TRANSICIONES DE ESTADO DEL PROCESO — siempre con rastro en audit_logs
  // ════════════════════════════════════════════════════════════════════════

  async advanceStatus(processId: string, toStatus: string, user: JwtUser, extra: Record<string, unknown> = {}) {
    const process = await this.getProcessRaw(processId);
    if (process.status === toStatus) return process;
    const { data, error } = await this.supabase.admin
      .from('certification_processes')
      .update({ status: toStatus, ...extra })
      .eq('id', processId)
      .select('*')
      .single();
    if (error || !data) throw new ConflictException('No se pudo actualizar el estado del proceso.');
    await this.auditLogs.log({
      user_id: user.id,
      action: 'CERTIFICATION_PROCESS_STATUS_CHANGED',
      entity: ENTITY,
      entityid: processId,
      old_data: { status: process.status },
      metadata: { status: toStatus },
    });
    return data;
  }
}
