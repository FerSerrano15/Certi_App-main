import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { SafeUser, DbUser } from '../auth/auth.service';

type JwtUser = { id: string; role: string; institution_id: string | null };

@Injectable()
export class UsersService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  // ─── Listar usuarios ──────────────────────────────────────────────────────

  async findAll(requester: JwtUser): Promise<SafeUser[]> {
    this.requireAdmin(requester);

    let query = this.supabaseService.admin
      .from('users')
      .select('id, institution_id, email, full_name, role, phone, is_active, created_at, updated_at')
      .order('created_at', { ascending: false });

    // ADMIN_INSTITUCION solo ve usuarios de su institución
    if (requester.role === 'ADMIN_INSTITUCION' && requester.institution_id) {
      query = query.eq('institution_id', requester.institution_id);
    }

    const { data, error } = await query.returns<SafeUser[]>();
    if (error) throw new NotFoundException('Error al obtener usuarios: ' + error.message);
    return data ?? [];
  }

  // ─── Obtener un usuario ───────────────────────────────────────────────────

  async findOne(id: string, requester: JwtUser): Promise<SafeUser> {
    this.requireAdmin(requester);

    const { data, error } = await this.supabaseService.admin
      .from('users')
      .select('id, institution_id, email, full_name, role, phone, is_active, created_at, updated_at')
      .eq('id', id)
      .single<SafeUser>();

    if (error || !data) throw new NotFoundException('Usuario no encontrado.');
    return data;
  }

  // ─── Actualizar usuario ───────────────────────────────────────────────────

  async update(
    id: string,
    body: Partial<Pick<DbUser, 'full_name' | 'phone' | 'role' | 'is_active' | 'institution_id'>>,
    requester: JwtUser,
  ): Promise<SafeUser> {
    // Un usuario puede editar su propio perfil (solo datos básicos)
    // Un admin puede editar cualquier usuario
    const isSelf = requester.id === id;
    const isAdmin = this.isAdminRole(requester.role);

    if (!isSelf && !isAdmin) {
      throw new ForbiddenException('No tienes permisos para editar este usuario.');
    }

    // Solo SUPER_ADMIN puede cambiar roles
    if (body.role && requester.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Solo el SUPER_ADMIN puede cambiar roles.');
    }

    const { data, error } = await this.supabaseService.admin
      .from('users')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, institution_id, email, full_name, role, phone, is_active, created_at, updated_at')
      .single<SafeUser>();

    if (error || !data) throw new NotFoundException('Usuario no encontrado o no se pudo actualizar.');
    return data;
  }

  // ─── Desactivar/activar usuario ───────────────────────────────────────────

  async toggleActive(id: string, requester: JwtUser): Promise<SafeUser> {
    this.requireSuperAdminOrAdmin(requester);

    const { data: current } = await this.supabaseService.admin
      .from('users')
      .select('is_active')
      .eq('id', id)
      .single<{ is_active: boolean }>();

    if (!current) throw new NotFoundException('Usuario no encontrado.');

    const { data, error } = await this.supabaseService.admin
      .from('users')
      .update({ is_active: !current.is_active, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, institution_id, email, full_name, role, phone, is_active, created_at, updated_at')
      .single<SafeUser>();

    if (error || !data) throw new NotFoundException('Error al actualizar usuario.');
    await this.auditLogs.log({
      user_id: requester.id,
      institution_id: requester.institution_id,
      action: current.is_active ? 'USER_DEACTIVATED' : 'USER_ACTIVATED',
      entity: 'users',
      entityid: id,
    });
    return data;
  }

  // ─── Cambiar rol ──────────────────────────────────────────────────────────

  async changeRole(
    id: string,
    role: string,
    requester: JwtUser,
  ): Promise<SafeUser> {
    if (requester.role !== 'SUPER_ADMIN' && requester.role !== 'ADMIN_INSTITUCION') {
      throw new ForbiddenException('No tienes permisos para cambiar roles.');
    }

    const validRoles = ['SUPER_ADMIN', 'ADMIN_INSTITUCION', 'COORDINADOR', 'INSTRUCTOR', 'OPERADOR'];
    if (!validRoles.includes(role)) {
      throw new ForbiddenException('Rol inválido.');
    }

    // Solo SUPER_ADMIN puede asignar rol SUPER_ADMIN
    if (role === 'SUPER_ADMIN' && requester.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Solo un SUPER_ADMIN puede asignar ese rol.');
    }

    const { data, error } = await this.supabaseService.admin
      .from('users')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, institution_id, email, full_name, role, phone, is_active, created_at, updated_at')
      .single<SafeUser>();

    if (error || !data) throw new NotFoundException('Usuario no encontrado.');
    await this.auditLogs.log({
      user_id: requester.id,
      institution_id: requester.institution_id,
      action: 'USER_ROLE_CHANGED',
      entity: 'users',
      entityid: id,
      metadata: { new_role: role },
    });
    return data;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private isAdminRole(role: string): boolean {
    return ['SUPER_ADMIN', 'ADMIN_INSTITUCION', 'COORDINADOR'].includes(role);
  }

  private requireAdmin(requester: JwtUser): void {
    if (!this.isAdminRole(requester.role)) {
      throw new ForbiddenException('No tienes permisos para esta acción.');
    }
  }

  private requireSuperAdminOrAdmin(requester: JwtUser): void {
    if (!['SUPER_ADMIN', 'ADMIN_INSTITUCION'].includes(requester.role)) {
      throw new ForbiddenException('No tienes permisos para esta acción.');
    }
  }
}
