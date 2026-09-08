import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CertificationProcessService, JwtUser } from '../certification-process/certification-process.service';
import { StagesService } from '../certification-process/stages.service';
import { CreateCertificateRequestDto } from './dto/create-certificate-request.dto';
import { ReviewCertificateRequestDto } from './dto/review-certificate-request.dto';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];

/**
 * Trámite y emisión del certificado (pasos 18-19 del flujo). En la base real,
 * un certificado SIEMPRE nace de un certificate_request aprobado, y un
 * certificate_request SIEMPRE está ligado a un certification_process cuyo
 * dictamen (process_judgments.result) debe ser 'competente' — es la barrera
 * que bloquea emitir un certificado con juicio 'aun_no_competente'.
 */
@Injectable()
export class CertificatesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly auditLogs: AuditLogsService,
    private readonly config: ConfigService,
    private readonly processes: CertificationProcessService,
    private readonly stages: StagesService,
  ) {}

  private requireAdmin(user: JwtUser) {
    if (!ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('No tienes permisos para esta acción.');
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  TRÁMITE — certificate_requests
  // ════════════════════════════════════════════════════════════════════════════

  async createRequest(dto: CreateCertificateRequestDto, user: JwtUser) {
    this.requireAdmin(user);

    const process = await this.processes.getProcessRaw(dto.process_id);
    const { data: judgment } = await this.supabase.admin
      .from('process_judgments').select('result').eq('process_id', dto.process_id).maybeSingle();

    if (!judgment || judgment.result !== 'competente') {
      throw new ConflictException(
        'No se puede iniciar el trámite de certificado: el juicio del proceso debe ser "competente" (o aún no se ha emitido).',
      );
    }
    if (process.status === 'CANCELADO') {
      throw new ConflictException('Este proceso está cancelado.');
    }

    const { data: existing } = await this.supabase.admin
      .from('certificate_requests').select('id, status').eq('process_id', dto.process_id).maybeSingle();
    if (existing) {
      throw new ConflictException(`Ya existe un trámite de certificado para este proceso (estado: ${existing.status}).`);
    }

    const { data, error } = await this.supabase.admin
      .from('certificate_requests')
      .insert({ process_id: dto.process_id, requested_by: user.id, status: 'pendiente' })
      .select('*')
      .single();
    if (error) throw new ConflictException(error.message);

    await this.stages.markStage(dto.process_id, 'TRAMITE_CERTIFICADO', 'in_progress', user, 'Trámite de certificado iniciado.');
    if (['DICTAMEN', 'RESULTADOS'].includes(process.status)) {
      await this.processes.advanceStatus(dto.process_id, 'TRAMITE', user);
    }

    await this.auditLogs.log({
      user_id: user.id, action: 'CERTIFICATE_REQUEST_CREATED', entity: 'certificate_requests', entityid: data.id,
      metadata: { process_id: dto.process_id },
    });

    return data;
  }

  async listRequests(user: JwtUser, processId?: string) {
    this.requireAdmin(user);
    let q = this.supabase.admin
      .from('certificate_requests')
      .select('*, certification_processes ( folio, participant_id, estandar_id ) ')
      .order('requested_at', { ascending: false });
    if (processId) q = q.eq('process_id', processId);
    const { data, error } = await q;
    if (error) throw new NotFoundException(error.message);
    return data ?? [];
  }

  /** Aprobar el trámite EMITE el certificado de inmediato (folio + token + QR). Rechazarlo no. */
  async reviewRequest(id: string, dto: ReviewCertificateRequestDto, user: JwtUser) {
    this.requireAdmin(user);

    const { data: request, error } = await this.supabase.admin
      .from('certificate_requests').select('*').eq('id', id).single();
    if (error || !request) throw new NotFoundException('Trámite de certificado no encontrado.');
    if (!['pendiente', 'en_revision'].includes(request.status)) {
      throw new ConflictException('Este trámite ya fue revisado.');
    }

    const now = new Date().toISOString();

    if (!dto.approve) {
      const { data, error: updErr } = await this.supabase.admin
        .from('certificate_requests')
        .update({ status: 'rechazada', reviewed_by: user.id, reviewed_at: now, notes: dto.notes ?? null })
        .eq('id', id).select('*').single();
      if (updErr) throw new ConflictException(updErr.message);
      await this.auditLogs.log({
        user_id: user.id, action: 'CERTIFICATE_REQUEST_REJECTED', entity: 'certificate_requests', entityid: id,
        old_data: { status: request.status }, metadata: { status: 'rechazada', notes: dto.notes },
      });
      return data;
    }

    const { data: approvedRequest, error: approveErr } = await this.supabase.admin
      .from('certificate_requests')
      .update({ status: 'aprobada', reviewed_by: user.id, reviewed_at: now, notes: dto.notes ?? null })
      .eq('id', id).select('*').single();
    if (approveErr || !approvedRequest) throw new ConflictException('No se pudo aprobar el trámite.');

    const certificate = await this.issueFromApprovedRequest(approvedRequest, user);

    await this.auditLogs.log({
      user_id: user.id, action: 'CERTIFICATE_REQUEST_APPROVED', entity: 'certificate_requests', entityid: id,
      old_data: { status: request.status }, metadata: { status: 'aprobada' },
    });

    return { request: approvedRequest, certificate };
  }

  private async issueFromApprovedRequest(request: { id: string; process_id: string }, user: JwtUser) {
    const process = await this.processes.getProcessRaw(request.process_id);

    const { data: estandar } = await this.supabase.admin
      .from('estandares').select('codigo').eq('id', process.estandar_id).single();

    const folio = await this.generateUniqueFolio(estandar?.codigo ?? 'CERT');
    const verificationToken = crypto.randomBytes(24).toString('hex');
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:4200';
    const verificationUrl = `${frontendUrl}/verificar/${verificationToken}`;
    const qrDataUrl = await QRCode.toDataURL(verificationUrl, { margin: 1, width: 320 });

    const { data: cedula } = await this.supabase.admin
      .from('evaluation_cedulas').select('total_score').eq('process_id', process.id).maybeSingle();

    const { data: certificate, error } = await this.supabase.admin
      .from('certificates')
      .insert({
        process_id: process.id,
        certificate_request_id: request.id,
        participant_id: process.participant_id,
        course_id: process.course_id,
        folio,
        verification_token: verificationToken,
        qr_data_url: qrDataUrl,
        final_grade: cedula?.total_score ?? null,
        status: 'vigente',
        issued_at: new Date().toISOString(),
        issued_by: user.id,
      })
      .select('*')
      .single();
    if (error) throw new ConflictException(error.message);

    await this.stages.markStage(process.id, 'TRAMITE_CERTIFICADO', 'completed', user, 'Certificado emitido.');
    await this.processes.advanceStatus(process.id, 'EMISION', user);
    await this.processes.closeProcess(process.id, user);

    await this.auditLogs.log({
      user_id: user.id, action: 'CERTIFICATE_ISSUED', entity: 'certificates', entityid: certificate.id,
      metadata: { folio, process_id: process.id },
    });

    return certificate;
  }

  private async generateUniqueFolio(estandarCodigo: string): Promise<string> {
    const prefix = (estandarCodigo || 'CERT').replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || 'CERT';
    for (let attempt = 0; attempt < 5; attempt++) {
      const random = crypto.randomBytes(4).toString('hex').toUpperCase();
      const year = new Date().getFullYear();
      const folio = `${prefix}-${year}-${random}`;
      const { data } = await this.supabase.admin
        .from('certificates').select('id').eq('folio', folio).maybeSingle();
      if (!data) return folio;
    }
    throw new ConflictException('No se pudo generar un folio único. Intenta de nuevo.');
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  LISTAR
  // ════════════════════════════════════════════════════════════════════════════

  async list(user: JwtUser, filters: { participant_id?: string; course_id?: string } = {}) {
    this.requireAdmin(user);
    let q = this.supabase.admin
      .from('certificates')
      .select(`*, participants ( id, full_name, email ), courses ( id, name, code )`)
      .order('issued_at', { ascending: false });
    if (filters.participant_id) q = q.eq('participant_id', filters.participant_id);
    if (filters.course_id) q = q.eq('course_id', filters.course_id);
    const { data, error } = await q;
    if (error) throw new NotFoundException(error.message);
    return data ?? [];
  }

  async listMine(user: JwtUser) {
    if (user.role !== 'CANDIDATO') {
      throw new ForbiddenException('Esta acción es solo para candidatos.');
    }
    const { data: participant } = await this.supabase.admin
      .from('participants').select('id').eq('user_id', user.id).maybeSingle();
    if (!participant) return [];
    const { data, error } = await this.supabase.admin
      .from('certificates')
      .select(`*, courses ( id, name, code )`)
      .eq('participant_id', participant.id)
      .order('issued_at', { ascending: false });
    if (error) throw new NotFoundException(error.message);
    return data ?? [];
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  REVOCAR
  // ════════════════════════════════════════════════════════════════════════════

  async revoke(id: string, reason: string | undefined, user: JwtUser) {
    this.requireAdmin(user);
    const { data, error } = await this.supabase.admin
      .from('certificates')
      .update({ status: 'revocado', revocation_reason: reason ?? null, revoked_by: user.id })
      .eq('id', id)
      .select('*')
      .single();
    if (error || !data) throw new NotFoundException('Certificado no encontrado.');

    await this.auditLogs.log({
      user_id: user.id, action: 'CERTIFICATE_REVOKED', entity: 'certificates', entityid: id, metadata: { reason },
    });

    return data;
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  VERIFICACIÓN PÚBLICA (sin autenticación) — folio o token
  // ════════════════════════════════════════════════════════════════════════════

  async verifyPublic(ref: string) {
    const cleanRef = (ref ?? '').trim().replace(/[^a-zA-Z0-9-]/g, '').slice(0, 128);

    let found = false;
    let result: Record<string, unknown> | null = null;

    if (cleanRef) {
      const { data } = await this.supabase.admin
        .from('certificates')
        .select(`
          folio, status, issued_at, expires_at, final_grade,
          participants ( full_name ),
          courses ( name, code )
        `)
        .or(`folio.eq.${cleanRef},verification_token.eq.${cleanRef}`)
        .maybeSingle<{
          folio: string; status: string; issued_at: string; expires_at: string | null;
          final_grade: number | null;
          participants: { full_name: string } | null;
          courses: { name: string; code: string } | null;
        }>();

      if (data) {
        found = true;
        const expired = data.expires_at ? new Date(data.expires_at) < new Date() : false;
        result = {
          valid: data.status === 'vigente' && !expired,
          folio: data.folio,
          status: data.status === 'revocado' ? 'revocado' : expired ? 'vencido' : data.status,
          participant_name: data.participants?.full_name ?? null,
          course_name: data.courses?.name ?? null,
          course_code: data.courses?.code ?? null,
          issued_at: data.issued_at,
          expires_at: data.expires_at,
          final_grade: data.final_grade,
        };
      }
    }

    await this.logValidation(cleanRef || (ref ?? '').trim().slice(0, 128), found);

    return result ?? { valid: false };
  }

  private async logValidation(referencia: string, exitoso: boolean) {
    try {
      // La tabla real (validation_logs) usa process_id/validation_type/status/
      // message/details — no `referencia`/`exitoso`. Se registra igual como
      // un evento de validación genérico para no perder la traza pública.
      await this.supabase.admin.from('validation_logs').insert({
        validation_type: 'PUBLIC_CERTIFICATE_LOOKUP',
        status: exitoso ? 'ok' : 'warning',
        message: exitoso ? 'Referencia encontrada.' : 'Referencia no encontrada.',
        details: { referencia },
      });
    } catch (err) {
      console.error('[CertificatesService] Error al registrar validation_logs:', err);
    }
  }

  async listValidationLogs(user: JwtUser, limit = 100) {
    if (user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Solo el Super Admin puede ver este historial.');
    }
    const { data, error } = await this.supabase.admin
      .from('validation_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new NotFoundException(error.message);
    return data ?? [];
  }
}
