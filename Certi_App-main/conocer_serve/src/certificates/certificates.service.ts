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
import { ParticipantsService } from '../participants/participants.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

type JwtUser = { id: string; role: string; institution_id: string | null; email: string };

@Injectable()
export class CertificatesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly participants: ParticipantsService,
    private readonly auditLogs: AuditLogsService,
    private readonly config: ConfigService,
  ) {}

  private requireAdmin(user: JwtUser) {
    if (!['SUPER_ADMIN', 'ADMIN_INSTITUCION', 'COORDINADOR'].includes(user.role)) {
      throw new ForbiddenException('No tienes permisos para esta acción.');
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  EMITIR
  // ════════════════════════════════════════════════════════════════════════════

  async issue(enrollmentId: string, force: boolean, user: JwtUser) {
    this.requireAdmin(user);

    const { data: enrollment, error: enrErr } = await this.supabase.admin
      .from('enrollments')
      .select(`
        id, group_id, participant_id, final_grade, attendance_percentage, status,
        groups ( id, course_id, institution_id, courses ( id, name, code, passing_grade, min_attendance, validity_months ) )
      `)
      .eq('id', enrollmentId)
      .single<{
        id: string; group_id: string; participant_id: string;
        final_grade: number | null; attendance_percentage: number | null; status: string;
        groups: {
          id: string; course_id: string; institution_id: string | null;
          courses: {
            id: string; name: string; code: string;
            passing_grade: number; min_attendance: number; validity_months: number | null;
          } | null;
        } | null;
      }>();
    if (enrErr || !enrollment) throw new NotFoundException('Inscripción no encontrada.');

    const group = enrollment.groups;
    const course = group?.courses;
    if (!group || !course) throw new NotFoundException('No se pudo determinar el curso de esta inscripción.');

    // ¿Ya existe un certificado activo para esta inscripción?
    const { data: existing } = await this.supabase.admin
      .from('certificates')
      .select('*')
      .eq('enrollment_id', enrollmentId)
      .eq('status', 'active')
      .maybeSingle();
    if (existing) return existing;

    if (!force) {
      const grade = enrollment.final_grade ?? 0;
      const attendance = enrollment.attendance_percentage ?? 0;
      if (grade < course.passing_grade) {
        throw new ConflictException(
          `La calificación final (${grade}) no alcanza el mínimo requerido (${course.passing_grade}). Envía "force: true" para emitir de todas formas.`,
        );
      }
      if (attendance < course.min_attendance) {
        throw new ConflictException(
          `La asistencia (${attendance}%) no alcanza el mínimo requerido (${course.min_attendance}%). Envía "force: true" para emitir de todas formas.`,
        );
      }
    }

    const folio = await this.generateUniqueFolio(course.code);
    const verificationToken = crypto.randomBytes(24).toString('hex');
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:4200';
    const verificationUrl = `${frontendUrl}/verificar/${verificationToken}`;
    const qrDataUrl = await QRCode.toDataURL(verificationUrl, { margin: 1, width: 320 });

    const issuedAt = new Date();
    const expiresAt = course.validity_months
      ? new Date(issuedAt.getFullYear(), issuedAt.getMonth() + course.validity_months, issuedAt.getDate())
      : null;

    const { data, error } = await this.supabase.admin
      .from('certificates')
      .insert({
        institution_id: group.institution_id,
        participant_id: enrollment.participant_id,
        course_id: course.id,
        enrollment_id: enrollment.id,
        folio,
        verification_token: verificationToken,
        qr_data_url: qrDataUrl,
        final_grade: enrollment.final_grade,
        attendance_percentage: enrollment.attendance_percentage,
        status: 'active',
        issued_at: issuedAt.toISOString(),
        expires_at: expiresAt ? expiresAt.toISOString() : null,
      })
      .select('*')
      .single();
    if (error) throw new ConflictException(error.message);

    await this.auditLogs.log({
      user_id: user.id,
      institution_id: group.institution_id,
      action: 'CERTIFICATE_ISSUED',
      entity: 'certificates',
      entityid: data.id,
      metadata: { folio, enrollment_id: enrollmentId },
    });

    return data;
  }

  private async generateUniqueFolio(courseCode: string): Promise<string> {
    const prefix = (courseCode || 'CERT').replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || 'CERT';
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
      .select(`
        *,
        participants ( id, full_name, email ),
        courses ( id, name, code )
      `)
      .order('issued_at', { ascending: false });
    if (filters.participant_id) q = q.eq('participant_id', filters.participant_id);
    if (filters.course_id) q = q.eq('course_id', filters.course_id);
    if (user.role !== 'SUPER_ADMIN' && user.institution_id) {
      q = q.eq('institution_id', user.institution_id);
    }
    const { data, error } = await q;
    if (error) throw new NotFoundException(error.message);
    return data ?? [];
  }

  async listMine(user: JwtUser) {
    if (user.role !== 'OPERADOR') {
      throw new ForbiddenException('Esta acción es solo para candidatos.');
    }
    const participant = await this.participants.resolveOrCreateSelfParticipant(user);
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
      .update({ status: 'revoked', revocation_reason: reason ?? null, revoked_by: user.id })
      .eq('id', id)
      .select('*')
      .single();
    if (error || !data) throw new NotFoundException('Certificado no encontrado.');

    await this.auditLogs.log({
      user_id: user.id,
      institution_id: user.institution_id,
      action: 'CERTIFICATE_REVOKED',
      entity: 'certificates',
      entityid: id,
      metadata: { reason },
    });

    return data;
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  VERIFICACIÓN PÚBLICA (sin autenticación) — folio o token
  // ════════════════════════════════════════════════════════════════════════════

  async verifyPublic(ref: string) {
    // Solo caracteres que un folio/token real puede tener; evita inyectar
    // sintaxis de filtro de PostgREST a través del parámetro público.
    const cleanRef = (ref ?? '').trim().replace(/[^a-zA-Z0-9-]/g, '').slice(0, 128);

    let found = false;
    let result: Record<string, unknown> | null = null;

    if (cleanRef) {
      const { data } = await this.supabase.admin
        .from('certificates')
        .select(`
          folio, status, issued_at, expires_at, final_grade, attendance_percentage,
          participants ( full_name ),
          courses ( name, code ),
          institutions ( name )
        `)
        .or(`folio.eq.${cleanRef},verification_token.eq.${cleanRef}`)
        .maybeSingle<{
          folio: string; status: string; issued_at: string; expires_at: string | null;
          final_grade: number | null; attendance_percentage: number | null;
          participants: { full_name: string } | null;
          courses: { name: string; code: string } | null;
          institutions: { name: string } | null;
        }>();

      if (data) {
        found = true;
        const expired = data.expires_at ? new Date(data.expires_at) < new Date() : false;
        result = {
          valid: data.status === 'active' && !expired,
          folio: data.folio,
          status: data.status === 'revoked' ? 'revoked' : expired ? 'expired' : 'active',
          participant_name: data.participants?.full_name ?? null,
          course_name: data.courses?.name ?? null,
          course_code: data.courses?.code ?? null,
          institution_name: data.institutions?.name ?? null,
          issued_at: data.issued_at,
          expires_at: data.expires_at,
          final_grade: data.final_grade,
          attendance_percentage: data.attendance_percentage,
        };
      }
    }

    await this.logValidation(cleanRef || (ref ?? '').trim().slice(0, 128), found);

    return result ?? { valid: false };
  }

  private async logValidation(referencia: string, exitoso: boolean) {
    try {
      await this.supabase.admin.from('validation_logs').insert({ referencia, exitoso });
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
      .order('fecha', { ascending: false })
      .limit(limit);
    if (error) throw new NotFoundException(error.message);
    return data ?? [];
  }
}
