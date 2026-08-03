import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateInstitutionDto } from './dto/create-institution.dto';

type JwtUser = { id: string; role: string; institution_id: string | null };

@Injectable()
export class InstitutionsService {
  constructor(private readonly supabase: SupabaseService) {}

  // ─── Permisos: permite a cualquier usuario autenticado gestionar instituciones
  private requireAdmin(user: JwtUser) {
    if (!user || !user.id) {
      throw new ForbiddenException('Usuario no autenticado.');
    }
  }

  // ─── Generar slug limpio desde texto ─────────────────────────────────────
  private toSlug(name: string): string {
    if (!name) return `inst-${Date.now()}`;
    const clean = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // elimina acentos
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 60);
    return clean || `inst-${Date.now()}`;
  }

  // ─── Listar ──────────────────────────────────────────────────────────────
  async listInstitutions(user: JwtUser) {
    const { data, error } = await this.supabase.admin
      .from('institutions')
      .select('*')
      .order('name');

    if (error) throw new NotFoundException(error.message);
    return data ?? [];
  }

  // ─── Obtener una ─────────────────────────────────────────────────────────
  async getInstitution(id: string) {
    const { data, error } = await this.supabase.admin
      .from('institutions')
      .select(`
        *,
        users ( id, full_name, email, role, is_active )
      `)
      .eq('id', id)
      .single();
    if (error || !data) throw new NotFoundException('Institución no encontrada.');
    return data;
  }

  // ─── Crear ───────────────────────────────────────────────────────────────
  async createInstitution(dto: CreateInstitutionDto, user: JwtUser) {
    this.requireAdmin(user);

    let slug = (dto.slug && dto.slug.trim().length > 0)
      ? this.toSlug(dto.slug)
      : this.toSlug(dto.name);

    let { data, error } = await this.supabase.admin
      .from('institutions')
      .insert({
        name:          dto.name.trim(),
        slug,
        tax_id:        dto.tax_id        ?? null,
        logo_url:      dto.logo_url      ?? null,
        contact_email: dto.contact_email ?? null,
        phone:         dto.phone         ?? null,
        is_active:     dto.is_active     ?? true,
      })
      .select('*')
      .single();

    // Si el slug ya existe, reintenta agregando un sufijo único
    if (error && error.code === '23505') {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
      const retry = await this.supabase.admin
        .from('institutions')
        .insert({
          name:          dto.name.trim(),
          slug,
          tax_id:        dto.tax_id        ?? null,
          logo_url:      dto.logo_url      ?? null,
          contact_email: dto.contact_email ?? null,
          phone:         dto.phone         ?? null,
          is_active:     dto.is_active     ?? true,
        })
        .select('*')
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      throw new ConflictException(`Error al crear institución: ${error.message}`);
    }
    return data;
  }

  // ─── Actualizar ──────────────────────────────────────────────────────────
  async updateInstitution(id: string, dto: Partial<CreateInstitutionDto>, user: JwtUser) {
    this.requireAdmin(user);

    const payload: Record<string, unknown> = { ...dto, updated_at: new Date().toISOString() };
    if (dto.name && !dto.slug) {
      payload['slug'] = this.toSlug(dto.name);
    } else if (dto.slug) {
      payload['slug'] = this.toSlug(dto.slug);
    }

    const { data, error } = await this.supabase.admin
      .from('institutions')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') throw new ConflictException('Slug ya en uso por otra institución.');
      throw new NotFoundException(error.message);
    }
    if (!data) throw new NotFoundException('Institución no encontrada.');
    return data;
  }

  // ─── Activar / desactivar ────────────────────────────────────────────────
  async toggleInstitution(id: string, user: JwtUser) {
    this.requireAdmin(user);

    const { data: current } = await this.supabase.admin
      .from('institutions')
      .select('is_active')
      .eq('id', id)
      .single<{ is_active: boolean }>();

    if (!current) throw new NotFoundException('Institución no encontrada.');

    const { data, error } = await this.supabase.admin
      .from('institutions')
      .update({ is_active: !current.is_active, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) throw new NotFoundException('Error al actualizar institución.');
    return data;
  }

  // ─── Eliminar ────────────────────────────────────────────────────────────
  async deleteInstitution(id: string, user: JwtUser) {
    this.requireAdmin(user);

    const { error } = await this.supabase.admin
      .from('institutions')
      .delete()
      .eq('id', id);

    if (error) throw new NotFoundException(error.message);
    return { message: 'Institución eliminada.' };
  }

  // ─── Stats ───────────────────────────────────────────────────────────────
  async getStats(user: JwtUser) {
    const [institutions, users] = await Promise.all([
      this.supabase.admin.from('institutions').select('id, is_active'),
      this.supabase.admin.from('users').select('id, institution_id, role, is_active'),
    ]);

    const instData = institutions.data ?? [];
    const userData = users.data ?? [];

    return {
      total:      instData.length,
      activas:    instData.filter(i => i.is_active).length,
      inactivas:  instData.filter(i => !i.is_active).length,
      usuarios:   userData.length,
      sinAsignar: userData.filter(u => !u.institution_id).length,
    };
  }
}
