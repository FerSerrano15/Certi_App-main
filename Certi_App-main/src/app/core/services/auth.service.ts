import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

// Roles que coinciden con public.users en Supabase
export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN_INSTITUCION'
  | 'COORDINADOR'
  | 'INSTRUCTOR'
  | 'OPERADOR';

// Tipo que coincide con la respuesta del backend (SafeUser)
export interface User {
  id: string;
  institution_id: string | null;
  email: string;
  full_name: string;
  role: UserRole;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
  isAdminInstitucion = computed(() => this.currentUser()?.role === 'ADMIN_INSTITUCION');
  isCoordinador = computed(() => this.currentUser()?.role === 'COORDINADOR');
  isInstructor = computed(() => this.currentUser()?.role === 'INSTRUCTOR');
  isOperador = computed(() => this.currentUser()?.role === 'OPERADOR');

  /** Puede gestionar usuarios (admin o superior) */
  canManageUsers = computed(() =>
    ['SUPER_ADMIN', 'ADMIN_INSTITUCION'].includes(this.currentUser()?.role ?? '')
  );

  /** Puede ver reportes y gestión de grupos */
  canManageGroups = computed(() =>
    ['SUPER_ADMIN', 'ADMIN_INSTITUCION', 'COORDINADOR'].includes(this.currentUser()?.role ?? '')
  );

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
    institution_id?: string;
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

  async getAllUsers(): Promise<User[]> {
    const token = this.getToken();
    if (!token || !this.canManageUsers()) return [];
    try {
      return await firstValueFrom(this.api.get<User[]>('/users', token));
    } catch {
      return [];
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
