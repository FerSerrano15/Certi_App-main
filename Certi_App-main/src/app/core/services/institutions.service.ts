import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export interface Institution {
  id: string;
  name: string;
  slug: string;
  tax_id: string | null;
  logo_url: string | null;
  contact_email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  users?: { id: string; full_name: string; email: string; role: string; is_active: boolean }[];
}

export interface InstitutionStats {
  total: number;
  activas: number;
  inactivas: number;
  usuarios: number;
  sinAsignar: number;
}

@Injectable({ providedIn: 'root' })
export class InstitutionsService {
  private readonly api  = inject(ApiService);
  private readonly auth = inject(AuthService);

  private token() { return this.auth.getToken() ?? ''; }

  async getAll(): Promise<Institution[]> {
    try { return await firstValueFrom(this.api.get<Institution[]>('/institutions', this.token())); }
    catch { return []; }
  }

  async getOne(id: string): Promise<Institution | null> {
    try { return await firstValueFrom(this.api.get<Institution>(`/institutions/${id}`, this.token())); }
    catch { return null; }
  }

  async getStats(): Promise<InstitutionStats | null> {
    try { return await firstValueFrom(this.api.get<InstitutionStats>('/institutions/stats', this.token())); }
    catch { return null; }
  }

  async create(data: Partial<Institution>): Promise<Institution | null> {
    try { return await firstValueFrom(this.api.post<Institution>('/institutions', data, this.token())); }
    catch (err) { throw err; }
  }

  async update(id: string, data: Partial<Institution>): Promise<Institution | null> {
    try { return await firstValueFrom(this.api.patch<Institution>(`/institutions/${id}`, data, this.token())); }
    catch (err) { throw err; }
  }

  async toggle(id: string): Promise<Institution | null> {
    try { return await firstValueFrom(this.api.patch<Institution>(`/institutions/${id}/toggle-active`, {}, this.token())); }
    catch { return null; }
  }

  async delete(id: string): Promise<boolean> {
    try { await firstValueFrom(this.api.delete(`/institutions/${id}`, this.token())); return true; }
    catch { return false; }
  }
}
