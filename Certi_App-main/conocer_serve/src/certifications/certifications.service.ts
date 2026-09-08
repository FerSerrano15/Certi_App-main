import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateCertificationDto } from './dto/create-certification.dto';

type JwtUser = { id: string; role: string };

/** Código reservado que representa la credencial general para poder evaluar. */
export const EVALUATOR_CREDENTIAL_TYPE = 'EVALUATOR_CREDENTIAL';
export const STANDARD_CREDENTIAL_TYPE = 'STANDARD';

export interface QualifiedEvaluator {
  evaluator_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  standard_expires_at: string | null;
  credential_expires_at: string | null;
}

@Injectable()
export class CertificationsService {
  constructor(private readonly supabase: SupabaseService) {}

  private requireAdmin(user: JwtUser) {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(user.role)) {
      throw new ForbiddenException('No tienes permisos para esta acción.');
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  CRUD
  // ════════════════════════════════════════════════════════════════════════════

  async list(user: JwtUser, userId?: string) {
    this.requireAdmin(user);
    let q = this.supabase.admin
      .from('certifications')
      .select('*, estandares ( codigo, nombre )')
      .order('created_at', { ascending: false });
    if (userId) q = q.eq('user_id', userId);
    const { data, error } = await q;
    if (error) throw new NotFoundException(error.message);
    return data ?? [];
  }

  async create(dto: CreateCertificationDto, user: JwtUser) {
    this.requireAdmin(user);

    let estandarCodigo = dto.code ?? null;
    let estandarNombre = dto.name ?? null;

    if (dto.type === STANDARD_CREDENTIAL_TYPE) {
      if (!dto.estandar_id && !dto.code) {
        throw new BadRequestException(
          'Para una certificación de tipo STANDARD indica el estándar (estandar_id) o al menos su código.',
        );
      }
      if (dto.estandar_id) {
        const { data: estandar, error } = await this.supabase.admin
          .from('estandares').select('codigo, nombre').eq('id', dto.estandar_id).single();
        if (error || !estandar) throw new NotFoundException('Estándar no encontrado.');
        estandarCodigo = dto.code ?? estandar.codigo;
        estandarNombre = dto.name ?? estandar.nombre;
      }
    }

    // `name` es NOT NULL en la base real — siempre debe llegar algo con sentido.
    const name = estandarNombre ?? dto.name ?? (dto.type === EVALUATOR_CREDENTIAL_TYPE
      ? 'Credencial general de evaluador'
      : (dto.code ?? 'Certificación'));

    const { data, error } = await this.supabase.admin
      .from('certifications')
      .insert({
        user_id: dto.user_id,
        estandar_id: dto.type === STANDARD_CREDENTIAL_TYPE ? (dto.estandar_id ?? null) : null,
        type: dto.type,
        code: dto.type === STANDARD_CREDENTIAL_TYPE ? estandarCodigo : null,
        name,
        status: dto.status ?? 'vigente',
        issued_at: dto.issued_at ?? null,
        expires_at: dto.expires_at ?? null,
        certificate_url: dto.certificate_url ?? null,
      })
      .select('*')
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async update(id: string, dto: Partial<CreateCertificationDto>, user: JwtUser) {
    this.requireAdmin(user);
    const { data, error } = await this.supabase.admin
      .from('certifications')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error || !data) throw new NotFoundException('Certificación no encontrada.');
    return data;
  }

  async remove(id: string, user: JwtUser) {
    this.requireAdmin(user);
    const { error } = await this.supabase.admin.from('certifications').delete().eq('id', id);
    if (error) throw new NotFoundException(error.message);
    return { message: 'Certificación eliminada.' };
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Helpers de elegibilidad — flujo LMS clásico (courses.code), sin cambios
  // ════════════════════════════════════════════════════════════════════════════

  private isActive(cert: { status: string; expires_at: string | null }): boolean {
    if (cert.status !== 'vigente') return false;
    if (!cert.expires_at) return true;
    return new Date(cert.expires_at) >= new Date();
  }

  /** user_ids que cuentan con la credencial general de evaluador vigente. */
  async getUsersWithEvaluatorCredential(): Promise<Set<string>> {
    const { data } = await this.supabase.admin
      .from('certifications')
      .select('user_id, status, expires_at')
      .eq('type', EVALUATOR_CREDENTIAL_TYPE);
    return new Set(
      (data ?? []).filter((c) => this.isActive(c)).map((c: { user_id: string }) => c.user_id),
    );
  }

  /** user_ids con certificación vigente para un código de estándar/curso específico. */
  async getUsersWithStandardCode(code: string): Promise<Set<string>> {
    const { data } = await this.supabase.admin
      .from('certifications')
      .select('user_id, status, expires_at')
      .eq('type', STANDARD_CREDENTIAL_TYPE)
      .eq('code', code);
    return new Set(
      (data ?? []).filter((c) => this.isActive(c)).map((c: { user_id: string }) => c.user_id),
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Elegibilidad — flujo de certificación por competencias (estandar_id)
  //  Regla (re-validada SIEMPRE en backend, nunca solo en el frontend):
  //    role = EVALUADOR AND is_active = true
  //    AND existe EVALUATOR_CREDENTIAL vigente (no vencida, no revocada)
  //    AND existe STANDARD vigente para el estándar solicitado
  // ════════════════════════════════════════════════════════════════════════════

  /** Evaluadores calificados para un estándar — usado por la pantalla de selección de evaluador. */
  async getQualifiedEvaluators(estandarId: string): Promise<QualifiedEvaluator[]> {
    const { data: evaluators, error } = await this.supabase.admin
      .from('users')
      .select('id, full_name, email, phone')
      .eq('role', 'EVALUADOR')
      .eq('is_active', true);
    if (error) throw new NotFoundException(error.message);
    if (!evaluators?.length) return [];

    const evaluatorIds = evaluators.map((e: { id: string }) => e.id);
    const today = new Date().toISOString().slice(0, 10);

    const [{ data: credentials }, { data: standards }] = await Promise.all([
      this.supabase.admin
        .from('certifications')
        .select('user_id, expires_at')
        .in('user_id', evaluatorIds)
        .eq('type', EVALUATOR_CREDENTIAL_TYPE)
        .eq('status', 'vigente'),
      this.supabase.admin
        .from('certifications')
        .select('user_id, expires_at')
        .in('user_id', evaluatorIds)
        .eq('type', STANDARD_CREDENTIAL_TYPE)
        .eq('status', 'vigente')
        .eq('estandar_id', estandarId),
    ]);

    const vigente = (rows: { expires_at: string | null }[] | null, uid: string, list: { user_id: string; expires_at: string | null }[] | null) =>
      (list ?? []).find((c) => c.user_id === uid && (!c.expires_at || c.expires_at >= today));

    const result: QualifiedEvaluator[] = [];
    for (const ev of evaluators) {
      const cred = vigente(credentials, ev.id, credentials as any);
      const std = vigente(standards, ev.id, standards as any);
      if (cred && std) {
        result.push({
          evaluator_id: ev.id,
          full_name: ev.full_name,
          email: ev.email,
          phone: ev.phone ?? null,
          credential_expires_at: cred.expires_at,
          standard_expires_at: std.expires_at,
        });
      }
    }
    return result;
  }

  /**
   * Re-valida la regla completa antes de guardar una asignación de evaluador.
   * Nunca confía en lo que ya se mostró en el frontend. Lanza ConflictException
   * con un motivo específico y accionable si no cumple.
   */
  async assertEvaluatorQualified(evaluatorId: string, estandarId: string): Promise<void> {
    const { data: evaluator, error } = await this.supabase.admin
      .from('users')
      .select('id, role, is_active')
      .eq('id', evaluatorId)
      .single<{ id: string; role: string; is_active: boolean }>();
    if (error || !evaluator) throw new NotFoundException('Evaluador no encontrado.');
    if (evaluator.role !== 'EVALUADOR') {
      throw new ConflictException('El usuario seleccionado no tiene el rol EVALUADOR.');
    }
    if (!evaluator.is_active) {
      throw new ConflictException('El evaluador seleccionado no está activo.');
    }

    const today = new Date().toISOString().slice(0, 10);

    const { data: credential } = await this.supabase.admin
      .from('certifications')
      .select('id, status, expires_at')
      .eq('user_id', evaluatorId)
      .eq('type', EVALUATOR_CREDENTIAL_TYPE)
      .order('expires_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle<{ id: string; status: string; expires_at: string | null }>();

    if (!credential) {
      throw new ConflictException('El evaluador no cuenta con credencial de evaluador (EVALUATOR_CREDENTIAL).');
    }
    if (credential.status !== 'vigente') {
      throw new ConflictException(`La credencial de evaluador está ${credential.status}, no vigente.`);
    }
    if (credential.expires_at && credential.expires_at < today) {
      throw new ConflictException('La credencial de evaluador está vencida.');
    }

    const { data: standard } = await this.supabase.admin
      .from('certifications')
      .select('id, status, expires_at')
      .eq('user_id', evaluatorId)
      .eq('type', STANDARD_CREDENTIAL_TYPE)
      .eq('estandar_id', estandarId)
      .order('expires_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle<{ id: string; status: string; expires_at: string | null }>();

    if (!standard) {
      throw new ConflictException('El evaluador no cuenta con certificación STANDARD vigente para el estándar solicitado.');
    }
    if (standard.status !== 'vigente') {
      throw new ConflictException(`La certificación del estándar está ${standard.status}, no vigente.`);
    }
    if (standard.expires_at && standard.expires_at < today) {
      throw new ConflictException('La certificación del estándar está vencida.');
    }
  }
}
