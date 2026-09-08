import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

// Roles que coinciden con public.users en Supabase
export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'EVALUADOR'
  | 'CANDIDATO';

// Tipo que coincide con la respuesta del backend (SafeUser)
export interface User {
  id: string;
  institution_name: string | null;
  email: string;
  full_name: string;
  role: UserRole;
  phone: string | null;
  avatar_url: string | null;
  avatar_status: 'pending' | 'validated' | 'rejected' | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Ficha de Registro general de la cuenta (no ligada a una certificación en
  // particular) — se llena una sola vez, justo después de crear la cuenta.
  ficha_registro_submitted_at?: string | null;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'app_access_token';
  private readonly REFRESH_KEY = 'app_refresh_token';
  private readonly SESSION_KEY = 'app_session';
  private readonly isBrowser: boolean;

  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  currentUser = signal<User | null>(null);
  isLoading = signal(false);

  // ─── Computed: estados derivados del rol ──────────────────────────────────

  isAuthenticated = computed(() => this.currentUser() !== null);
  userRole = computed(() => this.currentUser()?.role ?? null);

  isSuperAdmin = computed(() => this.currentUser()?.role === 'SUPER_ADMIN');
  isAdmin      = computed(() => this.currentUser()?.role === 'ADMIN');
  isEvaluador  = computed(() => this.currentUser()?.role === 'EVALUADOR');
  isCandidato  = computed(() => this.currentUser()?.role === 'CANDIDATO');

  /** Puede gestionar usuarios (admin o superior) */
  canManageUsers = computed(() =>
    ['SUPER_ADMIN', 'ADMIN'].includes(this.currentUser()?.role ?? '')
  );

  /** Puede ver reportes y gestión de grupos */
  canManageGroups = computed(() =>
    ['SUPER_ADMIN', 'ADMIN'].includes(this.currentUser()?.role ?? '')
  );

  /** La ficha de registro general ya fue completada */
  fichaRegistroCompletada = computed(() => !!this.currentUser()?.ficha_registro_submitted_at);

  constructor() {
    this.isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    if (this.isBrowser) {
      this.loadSession();
    }
  }

  // ─── Token ────────────────────────────────────────────────────────────────

  getToken(): string | null {
    return this.isBrowser ? localStorage.getItem(this.TOKEN_KEY) : null;
  }

  getRefreshToken(): string | null {
    return this.isBrowser ? localStorage.getItem(this.REFRESH_KEY) : null;
  }

  private saveTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem(this.TOKEN_KEY, accessToken);
    localStorage.setItem(this.REFRESH_KEY, refreshToken);
  }

  private clearStorage(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_KEY);
    localStorage.removeItem(this.SESSION_KEY);
  }

  // ─── Sesión ───────────────────────────────────────────────────────────────

  private loadSession(): void {
    try {
      const s = localStorage.getItem(this.SESSION_KEY);
      if (s) this.currentUser.set(JSON.parse(s));
    } catch {
      localStorage.removeItem(this.SESSION_KEY);
    }
  }

  private saveSession(user: User): void {
    localStorage.setItem(this.SESSION_KEY, JSON.stringify(user));
    this.currentUser.set(user);
  }

  // ─── Login ────────────────────────────────────────────────────────────────

  async login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isBrowser) return { success: false, error: 'No disponible en servidor.' };
    this.isLoading.set(true);
    try {
      const res = await firstValueFrom(
        this.api.post<AuthResponse>('/auth/login', { email, password })
      );
      this.saveTokens(res.accessToken, res.refreshToken);
      this.saveSession(res.user);
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: this.extractError(err) };
    } finally {
      this.isLoading.set(false);
    }
  }

  // ─── Registro ─────────────────────────────────────────────────────────────

  async register(data: {
    full_name: string;
    email: string;
    password: string;
    phone?: string;
    role?: UserRole;
    institution_name?: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (!this.isBrowser) return { success: false, error: 'No disponible en servidor.' };
    this.isLoading.set(true);
    try {
      const res = await firstValueFrom(
        this.api.post<AuthResponse>('/auth/register', data)
      );
      this.saveTokens(res.accessToken, res.refreshToken);
      this.saveSession(res.user);
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: this.extractError(err) };
    } finally {
      this.isLoading.set(false);
    }
  }

  // ─── Obtener perfil actual ────────────────────────────────────────────────

  async refreshProfile(): Promise<void> {
    const token = this.getToken();
    if (!token) return;
    try {
      const user = await firstValueFrom(this.api.get<User>('/auth/me', token));
      this.saveSession(user);
    } catch {
      await this.logout();
    }
  }

  // ─── Gestión de usuarios (solo admin) ────────────────────────────────────

  /**
   * @throws Error con un mensaje legible si la carga falla (por ejemplo, un
   *   error real del backend). A propósito NO se traga el error y devuelve
   *   `[]` en ese caso — un [] silencioso se ve exactamente igual en la UI
   *   que "no hay usuarios" y esconde el problema real. El llamador decide
   *   cómo mostrarlo.
   */
  async getAllUsers(): Promise<User[]> {
    const token = this.getToken();
    if (!token || !this.canManageUsers()) return [];
    try {
      return await firstValueFrom(this.api.get<User[]>('/users', token));
    } catch (err: any) {
      const backendMsg = err?.error?.message;
      const msg = Array.isArray(backendMsg) ? backendMsg.join(', ') : (backendMsg || err?.message || 'Error desconocido');
      throw new Error(msg);
    }
  }

  async updateUser(userId: string, data: Partial<User>): Promise<boolean> {
    const token = this.getToken();
    if (!token) return false;
    try {
      await firstValueFrom(this.api.patch(`/users/${userId}`, data, token));
      return true;
    } catch {
      return false;
    }
  }

  /** Sube (o reemplaza) la foto de perfil del usuario actual y refresca la sesión. */
  /**
   * `faceCheck`, si se pasa, es el resultado (ya calculado en el navegador
   * con MediaPipe) del análisis automático de la foto — se envía solo como
   * referencia informativa para el aviso que recibe el admin; el backend no
   * depende de él para nada de seguridad.
   */
  async uploadAvatar(file: File, faceCheck?: unknown | null): Promise<{ ok: boolean; avatar_url?: string; error?: string }> {
    const token = this.getToken();
    const me = this.currentUser();
    if (!token || !me) return { ok: false, error: 'No hay sesión activa.' };

    const fd = new FormData();
    fd.append('file', file);
    if (faceCheck) fd.append('face_check', JSON.stringify(faceCheck));
    try {
      const updated = await firstValueFrom(
        this.api.postFormData<User>(`/users/${me.id}/avatar`, fd, token),
      );
      this.saveSession({ ...me, avatar_url: updated.avatar_url });
      return { ok: true, avatar_url: updated.avatar_url ?? undefined };
    } catch (err: unknown) {
      return { ok: false, error: this.extractError(err) };
    }
  }

  /** Un admin valida o rechaza la foto de perfil de un usuario (revisión humana). */
  async reviewAvatar(userId: string, action: 'validated' | 'rejected'): Promise<boolean> {
    const token = this.getToken();
    if (!token || !this.canManageUsers()) return false;
    try {
      await firstValueFrom(this.api.patch(`/users/${userId}/avatar-review`, { action }, token));
      return true;
    } catch {
      return false;
    }
  }

  async toggleUserActive(userId: string): Promise<boolean> {
    const token = this.getToken();
    if (!token || !this.canManageUsers()) return false;
    try {
      await firstValueFrom(this.api.patch(`/users/${userId}/toggle-active`, {}, token));
      return true;
    } catch {
      return false;
    }
  }

  async changeUserRole(userId: string, role: UserRole): Promise<boolean> {
    const token = this.getToken();
    if (!token || !this.canManageUsers()) return false;
    try {
      await firstValueFrom(this.api.patch(`/users/${userId}/role`, { role }, token));
      return true;
    } catch {
      return false;
    }
  }

  // ─── Ficha de Registro general (una sola vez por cuenta) ──────────────────

  /** Obtiene la propia Ficha de Registro del usuario autenticado (cualquier rol). */
  async getMyFichaRegistro(): Promise<{
    full_name: string;
    ficha_registro_data: Record<string, any> | null;
    ficha_registro_submitted_at: string | null;
  } | null> {
    const token = this.getToken();
    if (!token) return null;
    try {
      return await firstValueFrom(
        this.api.get<{
          full_name: string;
          ficha_registro_data: Record<string, any> | null;
          ficha_registro_submitted_at: string | null;
        }>('/auth/me/ficha-registro', token)
      );
    } catch {
      return null;
    }
  }

  /** Obtiene la Ficha de Registro completa de un usuario (solo admin). */
  async getFichaRegistro(userId: string): Promise<{
    full_name: string;
    ficha_registro_data: Record<string, any> | null;
    ficha_registro_submitted_at: string | null;
  } | null> {
    const token = this.getToken();
    if (!token || !this.canManageUsers()) return null;
    try {
      return await firstValueFrom(
        this.api.get<{
          full_name: string;
          ficha_registro_data: Record<string, any> | null;
          ficha_registro_submitted_at: string | null;
        }>(`/users/${userId}/ficha-registro`, token)
      );
    } catch {
      return null;
    }
  }

  async submitFichaRegistro(formData: Record<string, any>): Promise<boolean> {
    const token = this.getToken();
    if (!token) return false;
    try {
      const user = await firstValueFrom(
        this.api.patch<User>('/auth/me/ficha-registro', { form_data: formData }, token)
      );
      this.saveSession(user);
      return true;
    } catch {
      return false;
    }
  }

  // ─── Cambio de contraseña propia ───────────────────────────────────────────────

  async changeMyPassword(
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ): Promise<{ success: boolean; message: string }> {
    const token = this.getToken();
    if (!token) return { success: false, message: 'No autenticado.' };
    try {
      const res = await firstValueFrom(
        this.api.post<{ message: string }>(
          '/auth/me/change-password',
          { current_password: currentPassword, new_password: newPassword, confirm_password: confirmPassword },
          token,
        )
      );
      return { success: true, message: res.message ?? 'Contraseña actualizada correctamente.' };
    } catch (err: unknown) {
      return { success: false, message: this.extractError(err) };
    }
  }

  // ─── Restablecer contraseña de otro usuario (solo SUPER_ADMIN) ──────────────────────

  async resetUserPassword(userId: string, newPassword: string): Promise<boolean> {
    const token = this.getToken();
    if (!token || !this.isSuperAdmin()) return false;
    try {
      await firstValueFrom(
        this.api.patch(`/users/${userId}/reset-password`, { new_password: newPassword }, token)
      );
      return true;
    } catch {
      return false;
    }
  }

  // ─── Eliminar usuario (solo SUPER_ADMIN, requiere su propia contraseña) ────

  async deleteUser(userId: string, password: string): Promise<{ success: boolean; message: string }> {
    const token = this.getToken();
    if (!token) return { success: false, message: 'No autenticado.' };
    if (!this.isSuperAdmin()) return { success: false, message: 'No tienes permisos para esta acción.' };
    try {
      const res = await firstValueFrom(
        this.api.delete<{ message: string }>(`/users/${userId}`, token, { password })
      );
      return { success: true, message: res.message ?? 'Usuario eliminado correctamente.' };
    } catch (err: unknown) {
      return { success: false, message: this.extractError(err) };
    }
  }

  // ─── Logout ───────────────────────────────────────────────────────────────

  async logout(): Promise<void> {
    const token = this.getToken();
    this.currentUser.set(null);
    if (this.isBrowser) {
      this.clearStorage();
      if (token) {
        this.api.post('/auth/logout', {}, token).subscribe({ error: () => {} });
      }
    }
    this.router.navigate(['/']);
  }

  // ─── Helper: extraer mensaje de error HTTP ────────────────────────────────

  private extractError(err: unknown): string {
    if (
      err !== null &&
      typeof err === 'object' &&
      'error' in err &&
      (err as { error: unknown }).error !== null &&
      typeof (err as { error: unknown }).error === 'object' &&
      'message' in (err as { error: Record<string, unknown> }).error
    ) {
      const msg = (err as { error: { message: unknown } }).error.message;
      return Array.isArray(msg) ? (msg as string[]).join(', ') : String(msg);
    }
    return 'Ocurrió un error. Intenta de nuevo.';
  }
}
