import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateCertificationDto } from './dto/create-certification.dto';

type JwtUser = { id: string; role: string; institution_id: string | null };

/** Código reservado que representa la credencial general para poder instruir. */
export const INSTRUCTOR_CREDENTIAL_TYPE = 'INSTRUCTOR_CREDENTIAL';
export const STANDARD_CREDENTIAL_TYPE = 'STANDARD';

@Injectable()
export class CertificationsService {
  constructor(private readonly supabase: SupabaseService) {}

  private requireAdmin(user: JwtUser) {
    if (!['SUPER_ADMIN', 'ADMIN_INSTITUCION', 'COORDINADOR'].includes(user.role)) {
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
      .select('*')
      .order('created_at', { ascending: false });
    if (userId) q = q.eq('user_id', userId);
    const { data, error } = await q;
    if (error) throw new NotFoundException(error.message);
    return data ?? [];
  }

  async create(dto: CreateCertificationDto, user: JwtUser) {
    this.requireAdmin(user);
    if (dto.type === STANDARD_CREDENTIAL_TYPE && !dto.code) {
      throw new BadRequestException(
        'El código del estándar es obligatorio para certificaciones de tipo STANDARD.',
      );
    }
    const { data, error } = await this.supabase.admin
      .from('certifications')
      .insert({
        user_id: dto.user_id,
        type: dto.type,
        code: dto.type === STANDARD_CREDENTIAL_TYPE ? dto.code : null,
        name: dto.name ?? null,
        status: dto.status ?? 'vigente',
        issued_at: dto.issued_at ?? null,
        expires_at: dto.expires_at ?? null,
        certificate_url: dto.certificate_url ?? null,
        institution_id: user.institution_id,
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
  //  Helpers de elegibilidad (usados por CoursesService)
  // ════════════════════════════════════════════════════════════════════════════

  private isActive(cert: { status: string; expires_at: string | null }): boolean {
    if (cert.status !== 'vigente') return false;
    if (!cert.expires_at) return true;
    return new Date(cert.expires_at) >= new Date();
  }

  /** user_ids que cuentan con la credencial general de instructor vigente. */
  async getUsersWithInstructorCredential(): Promise<Set<string>> {
    const { data } = await this.supabase.admin
      .from('certifications')
      .select('user_id, status, expires_at')
      .eq('type', INSTRUCTOR_CREDENTIAL_TYPE);
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
}
