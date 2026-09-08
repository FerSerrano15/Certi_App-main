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

  /** Cierra el proceso (CIERRE) y marca la solicitud origen como completada. */
  async closeProcess(processId: string, user: JwtUser) {
    const process = await this.advanceStatus(processId, 'CIERRE', user, { completed_at: new Date().toISOString() });
    await this.solicitudes.markCompleted(process.application_id, user);
    return process;
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
      return process;
    }

    throw new ForbiddenException('No tienes acceso a este proceso.');
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

    const { data: judgment } = await this.supabase.admin
      .from('process_judgments').select('*').eq('process_id', id).maybeSingle();

    return { ...process, stages: orderedStages, participant, estandar, course, group, evaluator, judgment: judgment ?? null };
  }

  async listMine(user: JwtUser, status?: string) {
    if (user.role === 'CANDIDATO') {
      const participant = await this.participants.resolveOrCreateSelfParticipant(user);
      let q = this.supabase.admin
        .from('certification_processes')
        .select('*, estandares ( codigo, nombre ), courses ( name, code )')
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
        .select('*, estandares ( codigo, nombre ), courses ( name, code ), participants ( full_name, email )')
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
      .select('*, estandares ( codigo, nombre ), courses ( name, code ), participants ( full_name, email ), users:evaluator_id ( full_name, email )')
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
