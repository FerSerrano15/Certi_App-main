import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateEstandarDto } from './dto/create-estandar.dto';
import { CreateGuiaDto } from './dto/create-guia.dto';
import { CreateReactivoDto } from './dto/create-reactivo.dto';

type JwtUser = { id: string; role: string };

@Injectable()
export class EstandaresService {
  constructor(private readonly supabase: SupabaseService) {}

  private requireAdmin(user: JwtUser) {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(user.role)) {
      throw new ForbiddenException('No tienes permisos para esta acción.');
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  ESTÁNDARES
  // ════════════════════════════════════════════════════════════════════════════

  async list(search?: string) {
    let q = this.supabase.admin
      .from('estandares')
      .select('*')
      .order('codigo');
    if (search) q = q.or(`codigo.ilike.%${search}%,nombre.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) throw new NotFoundException(error.message);
    return data ?? [];
  }

  async getOne(id: string) {
    const { data: estandar, error } = await this.supabase.admin
      .from('estandares')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !estandar) throw new NotFoundException('Estándar no encontrado.');

    const { data: guias } = await this.supabase.admin
      .from('guias_observacion')
      .select('*, reactivos ( * )')
      .eq('estandar_id', id)
      .order('orden');

    // Ordenar reactivos de cada guía por su campo `orden`
    const guiasOrdenadas = (guias ?? []).map((g: any) => ({
      ...g,
      reactivos: (g.reactivos ?? []).sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0)),
    }));

    return { ...estandar, guias: guiasOrdenadas };
  }

  async create(dto: CreateEstandarDto, user: JwtUser) {
    this.requireAdmin(user);
    const { data, error } = await this.supabase.admin
      .from('estandares')
      .insert({
        codigo: dto.codigo.trim(),
        nombre: dto.nombre.trim(),
        categoria: dto.categoria ?? null,
        version: dto.version ?? 1,
        vigente: dto.vigente ?? true,
      })
      .select('*')
      .single();
    if (error) {
      if (error.code === '23505') throw new ConflictException('Ya existe un estándar con ese código.');
      throw new ConflictException(error.message);
    }
    return data;
  }

  async update(id: string, dto: Partial<CreateEstandarDto>, user: JwtUser) {
    this.requireAdmin(user);
    const { data, error } = await this.supabase.admin
      .from('estandares')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error || !data) throw new NotFoundException('Estándar no encontrado.');
    return data;
  }

  async remove(id: string, user: JwtUser) {
    this.requireAdmin(user);
    const { error } = await this.supabase.admin.from('estandares').delete().eq('id', id);
    if (error) throw new NotFoundException(error.message);
    return { message: 'Estándar eliminado.' };
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  GUÍAS DE OBSERVACIÓN
  // ════════════════════════════════════════════════════════════════════════════

  async createGuia(estandarId: string, dto: CreateGuiaDto, user: JwtUser) {
    this.requireAdmin(user);
    const { data, error } = await this.supabase.admin
      .from('guias_observacion')
      .insert({
        estandar_id: estandarId,
        titulo: dto.titulo.trim(),
        instrucciones: dto.instrucciones ?? null,
        orden: dto.orden ?? 1,
      })
      .select('*')
      .single();
    if (error) throw new ConflictException(error.message);
    return data;
  }

  async updateGuia(id: string, dto: Partial<CreateGuiaDto>, user: JwtUser) {
    this.requireAdmin(user);
    const { data, error } = await this.supabase.admin
      .from('guias_observacion')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error || !data) throw new NotFoundException('Guía no encontrada.');
    return data;
  }

  async removeGuia(id: string, user: JwtUser) {
    this.requireAdmin(user);
    const { error } = await this.supabase.admin.from('guias_observacion').delete().eq('id', id);
    if (error) throw new NotFoundException(error.message);
    return { message: 'Guía eliminada.' };
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  REACTIVOS
  // ════════════════════════════════════════════════════════════════════════════

  async createReactivo(guiaId: string, dto: CreateReactivoDto, user: JwtUser) {
    this.requireAdmin(user);
    const { data, error } = await this.supabase.admin
      .from('reactivos')
      .insert({
        guia_id: guiaId,
        codigo_reactivo: dto.codigo_reactivo.trim(),
        descripcion: dto.descripcion.trim(),
        peso: dto.peso,
        es_actitud_valor: dto.es_actitud_valor ?? false,
        orden: dto.orden ?? 1,
      })
      .select('*')
      .single();
    if (error) throw new ConflictException(error.message);
    return data;
  }

  async updateReactivo(id: string, dto: Partial<CreateReactivoDto>, user: JwtUser) {
    this.requireAdmin(user);
    const { data, error } = await this.supabase.admin
      .from('reactivos')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error || !data) throw new NotFoundException('Reactivo no encontrado.');
    return data;
  }

  async removeReactivo(id: string, user: JwtUser) {
    this.requireAdmin(user);
    const { error } = await this.supabase.admin.from('reactivos').delete().eq('id', id);
    if (error) throw new NotFoundException(error.message);
    return { message: 'Reactivo eliminado.' };
  }
}
