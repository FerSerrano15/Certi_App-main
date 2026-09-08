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
import { NotificationsService } from '../notifications/notifications.service';
import { SafeUser, DbUser } from '../auth/auth.service';

const AVATAR_BUCKET = 'avatars';
const AVATAR_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const AVATAR_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

type JwtUser = { id: string; role: string };

@Injectable()
export class UsersService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly auditLogs: AuditLogsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── Listar usuarios ──────────────────────────────────────────────────────

  async findAll(requester: JwtUser): Promise<SafeUser[]> {
    this.requireAdmin(requester);

    const { data, error } = await this.supabaseService.admin
      .from('users')
      .select('id, institution_name, email, full_name, role, phone, avatar_url, avatar_status, is_active, created_at, updated_at, ficha_registro_submitted_at')
      .order('created_at', { ascending: false })
      .returns<SafeUser[]>();

    if (error) throw new NotFoundException('Error al obtener usuarios: ' + error.message);

    // Un ADMIN (no SUPER_ADMIN) no tiene ninguna visibilidad de cuentas
    // SUPER_ADMIN: se filtran por completo de la lista, no solo se ocultan
    // acciones sobre ellas.
    const rows = data ?? [];
    if (requester.role !== 'SUPER_ADMIN') {
      return rows.filter((u) => u.role !== 'SUPER_ADMIN');
    }
    return rows;
  }

  // ─── Obtener un usuario ───────────────────────────────────────────────────

  async findOne(id: string, requester: JwtUser): Promise<SafeUser> {
    this.requireAdmin(requester);

    const { data, error } = await this.supabaseService.admin
      .from('users')
      .select('id, institution_name, email, full_name, role, phone, avatar_url, avatar_status, is_active, created_at, updated_at')
      .eq('id', id)
      .single<SafeUser>();

    if (error || !data) throw new NotFoundException('Usuario no encontrado.');
    // Invisibilidad total de SUPER_ADMIN para cualquiera que no lo sea.
    this.assertCanActOnTarget(data.role, requester);
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
      .select('full_name, role, ficha_registro_data, ficha_registro_submitted_at')
      .eq('id', id)
      .single<{
        full_name: string;
        role: string;
        ficha_registro_data: Record<string, unknown> | null;
        ficha_registro_submitted_at: string | null;
      }>();

    if (error || !data) throw new NotFoundException('Usuario no encontrado.');
    this.assertCanActOnTarget(data.role, requester);
    if (!data.ficha_registro_data) {
      throw new NotFoundException('Este usuario aún no ha llenado su Ficha de Registro.');
    }
    const { role: _role, ...rest } = data;
    return rest;
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

    // Un ADMIN no puede editar a otro ADMIN ni a un SUPER_ADMIN (y a este
    // último ni siquiera puede verlo). Esto no aplica a la edición del propio
    // perfil.
    if (!isSelf) {
      const targetRole = await this.getTargetRole(id);
      this.assertCanActOnTarget(targetRole, requester);
    }

    const { data, error } = await this.supabaseService.admin
      .from('users')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, institution_name, email, full_name, role, phone, avatar_url, avatar_status, is_active, created_at, updated_at')
      .single<SafeUser>();

    if (error || !data) throw new NotFoundException('Usuario no encontrado o no se pudo actualizar.');
    return data;
  }

  // ─── Foto de perfil ──────────────────────────────────────────────────────
  // Un usuario puede subir/cambiar su propia foto; un admin puede cambiar la
  // de cualquiera. El archivo vive en el bucket público `avatars` de Storage
  // (una foto de perfil no requiere URL firmada); solo se guarda la URL
  // pública final en users.avatar_url.

  async uploadAvatar(
    id: string,
    file: Express.Multer.File | undefined,
    requester: JwtUser,
    faceCheckRaw?: string,
  ): Promise<SafeUser> {
    const isSelf = requester.id === id;
    const isAdmin = this.isAdminRole(requester.role);
    if (!isSelf && !isAdmin) {
      throw new ForbiddenException('No tienes permisos para cambiar la foto de este usuario.');
    }
    if (!file) {
      throw new ConflictException('Archivo inválido, faltante o de un tipo no soportado (JPG, PNG, WEBP — máx. 5 MB).');
    }
    if (!AVATAR_ALLOWED_MIME.includes(file.mimetype)) {
      throw new ConflictException('Formato no soportado. Usa una imagen JPG, PNG o WEBP.');
    }

    const ext = AVATAR_MIME_EXT[file.mimetype];
    const storagePath = `${id}/avatar.${ext}`;

    // Si el usuario ya tenía una foto con otra extensión, la eliminamos para
    // no dejar archivos huérfanos en el bucket.
    const otherExts = Object.values(AVATAR_MIME_EXT).filter((e) => e !== ext);
    if (otherExts.length) {
      await this.supabaseService.admin.storage
        .from(AVATAR_BUCKET)
        .remove(otherExts.map((e) => `${id}/avatar.${e}`));
    }

    const { error: uploadErr } = await this.supabaseService.admin.storage
      .from(AVATAR_BUCKET)
      .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: true });
    if (uploadErr) {
      throw new ConflictException(
        `No se pudo subir la foto: ${uploadErr.message}. Verifica que el bucket "${AVATAR_BUCKET}" exista en Supabase Storage.`,
      );
    }

    const { data: pub } = this.supabaseService.admin.storage.from(AVATAR_BUCKET).getPublicUrl(storagePath);
    // Cache-busting: sin esto, el navegador podría seguir mostrando la foto
    // anterior porque la URL (misma ruta, `upsert: true`) no cambia.
    const avatarUrl = `${pub.publicUrl}?v=${Date.now()}`;

    const { data, error } = await this.supabaseService.admin
      .from('users')
      .update({ avatar_url: avatarUrl, avatar_status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, institution_name, email, full_name, role, phone, avatar_url, avatar_status, is_active, created_at, updated_at')
      .single<SafeUser>();

    if (error || !data) throw new NotFoundException('Usuario no encontrado o no se pudo actualizar.');

    // Resumen (opcional) del chequeo automático hecho en el navegador con
    // MediaPipe — solo informativo, nunca decide nada por sí solo.
    let faceCheckSummary: { apta?: boolean; motivo?: string } | undefined;
    if (faceCheckRaw) {
      try {
        const parsed = JSON.parse(faceCheckRaw);
        faceCheckSummary = { apta: parsed?.resultado?.apta, motivo: parsed?.resultado?.motivo };
      } catch {
        faceCheckSummary = undefined;
      }
    }

    await this.auditLogs.log({
      user_id: requester.id,
      action: 'USER_AVATAR_UPDATED',
      entity: 'users',
      entityid: id,
      metadata: faceCheckSummary,
    });

    // Aviso al admin: el chequeo automático solo filtra lo evidente (que no
    // sea un rostro, mal encuadrado, etc.) — la veracidad (que sea
    // realmente la persona) siempre la confirma un humano.
    await this.notifications.notifyAdmins({
      type: 'AVATAR_UPLOADED',
      title: 'Nueva foto de perfil para revisar',
      message: `${data.full_name} actualizó su foto de perfil.${
        faceCheckSummary?.apta === false ? ' (No pasó el chequeo automático — revisar con atención.)' : ''
      }`,
      payload: { user_id: id, full_name: data.full_name, face_check: faceCheckSummary ?? null },
    });

    return data;
  }

  // ─── Revisar foto de perfil (validar / rechazar) ──────────────────────────
  //
  // "Validar" solo confirma que un admin ya la revisó (queda en el
  // historial). "Rechazar" además QUITA la foto (limpia avatar_url y borra
  // el archivo del bucket) — el usuario vuelve a ver su inicial como avatar
  // y deberá subir una nueva; así no queda una foto rechazada visible en
  // ningún lado de la app sin tener que tocar cada sitio donde se muestra.

  async reviewAvatar(
    id: string,
    action: 'validated' | 'rejected',
    requester: JwtUser,
  ): Promise<SafeUser> {
    this.requireAdmin(requester);

    const { data: target } = await this.supabaseService.admin
      .from('users')
      .select('role, avatar_url')
      .eq('id', id)
      .single<{ role: string; avatar_url: string | null }>();
    if (!target) throw new NotFoundException('Usuario no encontrado.');
    this.assertCanActOnTarget(target.role, requester);

    const patch: Record<string, unknown> = { avatar_status: action, updated_at: new Date().toISOString() };
    if (action === 'rejected') {
      patch['avatar_url'] = null;
      if (target.avatar_url) {
        // Best-effort: si falla el borrado del archivo no bloqueamos el
        // rechazo (el usuario ya no lo ve de todos modos, vía avatar_url).
        const marker = target.avatar_url.split('?')[0];
        const path = marker.split(`/${AVATAR_BUCKET}/`)[1];
        if (path) await this.supabaseService.admin.storage.from(AVATAR_BUCKET).remove([path]);
      }
    }

    const { data, error } = await this.supabaseService.admin
      .from('users')
      .update(patch)
      .eq('id', id)
      .select('id, institution_name, email, full_name, role, phone, avatar_url, avatar_status, is_active, created_at, updated_at')
      .single<SafeUser>();
    if (error || !data) throw new NotFoundException('Usuario no encontrado o no se pudo actualizar.');

    await this.auditLogs.log({
      user_id: requester.id,
      action: action === 'validated' ? 'USER_AVATAR_VALIDATED' : 'USER_AVATAR_REJECTED',
      entity: 'users',
      entityid: id,
    });

    return data;
  }

  // ─── Desactivar/activar usuario ───────────────────────────────────────────

  async toggleActive(id: string, requester: JwtUser): Promise<SafeUser> {
    this.requireSuperAdminOrAdmin(requester);

    const { data: current } = await this.supabaseService.admin
      .from('users')
      .select('is_active, role')
      .eq('id', id)
      .single<{ is_active: boolean; role: string }>();

    if (!current) throw new NotFoundException('Usuario no encontrado.');
    this.assertCanActOnTarget(current.role, requester);

    const { data, error } = await this.supabaseService.admin
      .from('users')
      .update({ is_active: !current.is_active, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, institution_name, email, full_name, role, phone, avatar_url, avatar_status, is_active, created_at, updated_at')
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

    if (id === requester.id) {
      throw new ForbiddenException('No puedes cambiar tu propio rol.');
    }

    const validRoles = ['SUPER_ADMIN', 'ADMIN', 'EVALUADOR', 'CANDIDATO'];
    if (!validRoles.includes(role)) {
      throw new ForbiddenException('Rol inválido.');
    }

    // Solo SUPER_ADMIN puede asignar rol SUPER_ADMIN o ADMIN
    if ((role === 'SUPER_ADMIN' || role === 'ADMIN') && requester.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Solo un SUPER_ADMIN puede asignar ese rol.');
    }

    // Jerarquía sobre el usuario objetivo: un ADMIN no puede "bajar de nivel"
    // (ni tocar de ninguna forma el rol de) a otro ADMIN, y no tiene ninguna
    // visibilidad de cuentas SUPER_ADMIN.
    const targetRole = await this.getTargetRole(id);
    this.assertCanActOnTarget(targetRole, requester);

    const { data, error } = await this.supabaseService.admin
      .from('users')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, institution_name, email, full_name, role, phone, avatar_url, avatar_status, is_active, created_at, updated_at')
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

  // ─── Jerarquía de administración ────────────────────────────────────────
  //
  // SUPER_ADMIN: acceso y control totales, sin restricciones.
  // ADMIN: administra libremente candidatos y evaluadores, y PUEDE VER a
  //   otros ADMIN, pero no puede modificarlos, desactivarlos ni cambiar su
  //   rol — no puede "bajar de nivel" a ningún admin. Un ADMIN no tiene
  //   NINGUNA visibilidad de cuentas SUPER_ADMIN: para efectos prácticos no
  //   existen (se responde 404, no 403, para que ni siquiera pueda
  //   confirmar que existen).

  /** Solo el rol actual del usuario objetivo — para chequeos de jerarquía. */
  private async getTargetRole(id: string): Promise<string | null> {
    const { data } = await this.supabaseService.admin
      .from('users')
      .select('role')
      .eq('id', id)
      .single<{ role: string }>();
    return data?.role ?? null;
  }

  /**
   * Verifica que `requester` tenga permiso para ver/modificar a un usuario
   * cuyo rol actual es `targetRole`. Un SUPER_ADMIN siempre puede. Para
   * cualquier otro requester: si el objetivo es SUPER_ADMIN, se lanza
   * NotFoundException (invisibilidad total); si el objetivo es ADMIN, se
   * lanza ForbiddenException (visible pero intocable).
   */
  private assertCanActOnTarget(targetRole: string | null, requester: JwtUser): void {
    if (requester.role === 'SUPER_ADMIN') return;
    if (targetRole === 'SUPER_ADMIN') {
      throw new NotFoundException('Usuario no encontrado.');
    }
    if (targetRole === 'ADMIN') {
      throw new ForbiddenException('No tienes permisos para administrar a otro administrador.');
    }
  }
}
