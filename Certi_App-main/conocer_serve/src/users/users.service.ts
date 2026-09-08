import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { SafeUser, DbUser } from '../auth/auth.service';

type JwtUser = { id: string; role: string };

@Injectable()
export class UsersService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  // ─── Listar usuarios ──────────────────────────────────────────────────────

  async findAll(requester: JwtUser): Promise<SafeUser[]> {
    this.requireAdmin(requester);

    const { data, error } = await this.supabaseService.admin
      .from('users')
      .select('id, institution_name, email, full_name, role, phone, is_active, created_at, updated_at, ficha_registro_submitted_at')
      .order('created_at', { ascending: false })
      .returns<SafeUser[]>();

    if (error) throw new NotFoundException('Error al obtener usuarios: ' + error.message);
    return data ?? [];
  }

  // ─── Obtener un usuario ───────────────────────────────────────────────────

  async findOne(id: string, requester: JwtUser): Promise<SafeUser> {
    this.requireAdmin(requester);

    const { data, error } = await this.supabaseService.admin
      .from('users')
      .select('id, institution_name, email, full_name, role, phone, is_active, created_at, updated_at')
      .eq('id', id)
      .single<SafeUser>();

    if (error || !data) throw new NotFoundException('Usuario no encontrado.');
    return data;
  }

  // ─── Ficha de Registro general de un usuario (para descarga en PDF) ───────

  async getFichaRegistro(
    id: string,
    requester: JwtUser,
  ): Promise<{
    full_name: string;
    ficha_registro_data: Record<string, unknown> | null;
    ficha_registro_submitted_at: string | null;
  }> {
    this.requireAdmin(requester);

    const { data, error } = await this.supabaseService.admin
      .from('users')
      .select('full_name, ficha_registro_data, ficha_registro_submitted_at')
      .eq('id', id)
      .single<{
        full_name: string;
        ficha_registro_data: Record<string, unknown> | null;
        ficha_registro_submitted_at: string | null;
      }>();

    if (error || !data) throw new NotFoundException('Usuario no encontrado.');
    if (!data.ficha_registro_data) {
      throw new NotFoundException('Este usuario aún no ha llenado su Ficha de Registro.');
    }
    return data;
  }

  // ─── Actualizar usuario ───────────────────────────────────────────────────

  async update(
    id: string,
    body: Partial<Pick<DbUser, 'full_name' | 'phone' | 'role' | 'is_active' | 'institution_name'>>,
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
      .select('id, institution_name, email, full_name, role, phone, is_active, created_at, updated_at')
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
      .select('id, institution_name, email, full_name, role, phone, is_active, created_at, updated_at')
      .single<SafeUser>();

    if (error || !data) throw new NotFoundException('Error al actualizar usuario.');
    await this.auditLogs.log({
      user_id: requester.id,
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
    if (requester.role !== 'SUPER_ADMIN' && requester.role !== 'ADMIN') {
      throw new ForbiddenException('No tienes permisos para cambiar roles.');
    }

    const validRoles = ['SUPER_ADMIN', 'ADMIN', 'EVALUADOR', 'CANDIDATO'];
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
      .select('id, institution_name, email, full_name, role, phone, is_active, created_at, updated_at')
      .single<SafeUser>();

    if (error || !data) throw new NotFoundException('Usuario no encontrado.');
    await this.auditLogs.log({
      user_id: requester.id,
      action: 'USER_ROLE_CHANGED',
      entity: 'users',
      entityid: id,
      metadata: { new_role: role },
    });
    return data;
  }

  // ─── Restablecer contraseña (solo SUPER_ADMIN) ─────────────────────────────
  //
  // Nota: las contraseñas se guardan como hash bcrypt (irreversible), así que
  // no es posible "recuperar" la contraseña original de nadie — lo que sí se
  // puede (y es la práctica estándar) es que un SUPER_ADMIN la RESTABLEZCA a
  // una nueva, forzando además el cierre de sesión del usuario afectado.

  private readonly SALT_ROUNDS = 12;

  async resetPassword(
    id: string,
    newPassword: string,
    requester: JwtUser,
  ): Promise<{ message: string }> {
    if (requester.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Solo un SUPER_ADMIN puede restablecer contraseñas.');
    }

    const password_hash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

    const { data, error } = await this.supabaseService.admin
      .from('users')
      .update({
        password_hash,
        refresh_token_hash: null, // fuerza a cerrar sesión en todos sus dispositivos
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id')
      .single();

    if (error || !data) throw new NotFoundException('Usuario no encontrado.');

    await this.auditLogs.log({
      user_id: requester.id,
      action: 'PASSWORD_RESET_BY_ADMIN',
      entity: 'users',
      entityid: id,
    });

    return { message: 'Contraseña restablecida correctamente.' };
  }

  // ─── Eliminar usuario (solo SUPER_ADMIN, requiere su propia contraseña) ───
  //
  // Requiere confirmación explícita en el frontend + la contraseña actual del
  // SUPER_ADMIN que solicita la eliminación (se verifica contra su hash).
  // No se permite auto-eliminarse. Si el usuario tiene actividad asociada
  // (cursos, certificados, documentos, auditoría, etc.) la base de datos
  // rechaza el borrado por integridad referencial y se informa con claridad
  // en vez de dejarlo a medias — en ese caso conviene desactivarlo en su lugar.

  async deleteUser(
    id: string,
    password: string,
    requester: JwtUser,
  ): Promise<{ message: string }> {
    if (requester.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Solo un SUPER_ADMIN puede eliminar usuarios.');
    }
    if (id === requester.id) {
      throw new ForbiddenException('No puedes eliminar tu propia cuenta.');
    }

    const { data: requesterRow } = await this.supabaseService.admin
      .from('users')
      .select('password_hash')
      .eq('id', requester.id)
      .single<{ password_hash: string }>();

    if (!requesterRow) throw new NotFoundException('No se pudo verificar tu cuenta.');

    const passwordValid = await bcrypt.compare(password, requesterRow.password_hash);
    if (!passwordValid) {
      throw new UnauthorizedException('Contraseña incorrecta.');
    }

    const { data: target } = await this.supabaseService.admin
      .from('users')
      .select('id, email, full_name, role')
      .eq('id', id)
      .single<{ id: string; email: string; full_name: string; role: string }>();

    if (!target) throw new NotFoundException('Usuario no encontrado.');

    const { error } = await this.supabaseService.admin
      .from('users')
      .delete()
      .eq('id', id);

    if (error) {
      if (error.code === '23503') {
        throw new ConflictException(
          `No se puede eliminar a "${target.full_name}" porque tiene actividad asociada en el sistema (cursos, certificados, documentos, auditoría u otros registros). Desactívalo en su lugar.`,
        );
      }
      throw new InternalServerErrorException('No se pudo eliminar el usuario: ' + error.message);
    }

    await this.auditLogs.log({
      user_id: requester.id,
      action: 'USER_DELETED',
      entity: 'users',
      entityid: id,
      metadata: { deleted_email: target.email, deleted_full_name: target.full_name, deleted_role: target.role },
    });

    return { message: `Usuario "${target.full_name}" eliminado correctamente.` };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private isAdminRole(role: string): boolean {
    return ['SUPER_ADMIN', 'ADMIN'].includes(role);
  }

  private requireAdmin(requester: JwtUser): void {
    if (!this.isAdminRole(requester.role)) {
      throw new ForbiddenException('No tienes permisos para esta acción.');
    }
  }

  private requireSuperAdminOrAdmin(requester: JwtUser): void {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(requester.role)) {
      throw new ForbiddenException('No tienes permisos para esta acción.');
    }
  }
}
