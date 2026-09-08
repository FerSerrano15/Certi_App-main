import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export type FichaRegistroStatus = 'borrador' | 'enviada' | 'validada' | 'rechazada';

export interface FichaRegistro {
  id: string;
  user_id: string;
  estandar_id: string;
  estandar_codigo: string;
  estandar_nombre: string;
  form_data: Record<string, any>;
  status: FichaRegistroStatus;
  submitted_at: string;
  created_at: string;
}

/** Fila de la vista admin "Solicitudes" — incluye datos del candidato. */
export interface FichaRegistroWithUser {
  id: string;
  user_id: string;
  estandar_id: string;
  estandar_codigo: string;
  estandar_nombre: string;
  status: FichaRegistroStatus;
  submitted_at: string;
  created_at: string;
  users: { full_name: string; email: string } | null;
}

@Injectable({ providedIn: 'root' })
export class FichaRegistroService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private token() { return this.auth.getToken() ?? ''; }

  async listMine(): Promise<FichaRegistro[]> {
    try { return await firstValueFrom(this.api.get<FichaRegistro[]>('/ficha-registro/mine', this.token())); }
    catch { return []; }
  }

  async getOne(id: string): Promise<FichaRegistro | null> {
    try { return await firstValueFrom(this.api.get<FichaRegistro>(`/ficha-registro/${id}`, this.token())); }
    catch { return null; }
  }

  /** Vista admin "Solicitudes" — todas las fichas de todos los candidatos. */
  async listAll(): Promise<FichaRegistroWithUser[]> {
    try { return await firstValueFrom(this.api.get<FichaRegistroWithUser[]>('/ficha-registro/all', this.token())); }
    catch { return []; }
  }

  async updateStatus(id: string, status: 'validada' | 'rechazada'): Promise<boolean> {
    try { await firstValueFrom(this.api.patch(`/ficha-registro/${id}/status`, { status }, this.token())); return true; }
    catch { return false; }
  }

  /** Devuelve { ok, error } — error es el mensaje del backend (ej. ficha duplicada) cuando ok=false. */
  async create(estandarId: string, formData: Record<string, any>): Promise<{ ok: true; ficha: FichaRegistro } | { ok: false; error: string }> {
    try {
      const ficha = await firstValueFrom(
        this.api.post<FichaRegistro>('/ficha-registro', { estandar_id: estandarId, form_data: formData }, this.token())
      );
      return { ok: true, ficha };
    } catch (err: unknown) {
      return { ok: false, error: this.extractError(err) };
    }
  }

  private extractError(err: unknown): string {
    if (
      err !== null && typeof err === 'object' && 'error' in err &&
      (err as { error: unknown }).error !== null && typeof (err as { error: unknown }).error === 'object' &&
      'message' in (err as { error: Record<string, unknown> }).error
    ) {
      const msg = (err as { error: { message: unknown } }).error.message;
      return Array.isArray(msg) ? (msg as string[]).join(', ') : String(msg);
    }
    return 'Ocurrió un error. Intenta de nuevo.';
  }
}
