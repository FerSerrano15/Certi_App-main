import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export interface Reactivo {
  id: string;
  guia_id: string;
  codigo_reactivo: string;
  descripcion: string;
  peso: number;
  es_actitud_valor: boolean;
  orden: number;
  created_at: string;
}

export interface GuiaObservacion {
  id: string;
  estandar_id: string;
  titulo: string;
  instrucciones: string | null;
  orden: number;
  reactivos?: Reactivo[];
  created_at: string;
}

export interface Estandar {
  id: string;
  codigo: string;
  nombre: string;
  categoria: string | null;
  version: number;
  vigente: boolean;
  guias?: GuiaObservacion[];
  created_at: string;
}

export interface EvaluacionReactivo {
  id: string;
  enrollment_id: string;
  reactivo_id: string;
  respuesta: boolean | null;
  observaciones: string | null;
  evaluated_at: string | null;
  reactivos?: Reactivo & { guias_observacion?: { id: string; titulo: string; orden: number; instrucciones: string | null } };
}

@Injectable({ providedIn: 'root' })
export class EstandaresService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private token() { return this.auth.getToken() ?? ''; }

  // ─── Estándares ───────────────────────────────────────────────────────────
  async list(search?: string): Promise<Estandar[]> {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    try { return await firstValueFrom(this.api.get<Estandar[]>(`/estandares${qs}`, this.token())); }
    catch { return []; }
  }

  async getOne(id: string): Promise<Estandar | null> {
    try { return await firstValueFrom(this.api.get<Estandar>(`/estandares/${id}`, this.token())); }
    catch { return null; }
  }

  async create(data: { codigo: string; nombre: string; categoria?: string; version?: number; vigente?: boolean }): Promise<Estandar | null> {
    try { return await firstValueFrom(this.api.post<Estandar>('/estandares', data, this.token())); }
    catch { return null; }
  }

  async update(id: string, data: Partial<Estandar>): Promise<Estandar | null> {
    try { return await firstValueFrom(this.api.patch<Estandar>(`/estandares/${id}`, data, this.token())); }
    catch { return null; }
  }

  async remove(id: string): Promise<boolean> {
    try { await firstValueFrom(this.api.delete(`/estandares/${id}`, this.token())); return true; }
    catch { return false; }
  }

  // ─── Guías de Observación ─────────────────────────────────────────────────
  async createGuia(estandarId: string, data: { titulo: string; instrucciones?: string; orden?: number }): Promise<GuiaObservacion | null> {
    try { return await firstValueFrom(this.api.post<GuiaObservacion>(`/estandares/${estandarId}/guias`, data, this.token())); }
    catch { return null; }
  }

  async updateGuia(id: string, data: Partial<GuiaObservacion>): Promise<GuiaObservacion | null> {
    try { return await firstValueFrom(this.api.patch<GuiaObservacion>(`/guias/${id}`, data, this.token())); }
    catch { return null; }
  }

  async removeGuia(id: string): Promise<boolean> {
    try { await firstValueFrom(this.api.delete(`/guias/${id}`, this.token())); return true; }
    catch { return false; }
  }

  // ─── Reactivos ────────────────────────────────────────────────────────────
  async createReactivo(guiaId: string, data: { codigo_reactivo: string; descripcion: string; peso: number; es_actitud_valor?: boolean; orden?: number }): Promise<Reactivo | null> {
    try { return await firstValueFrom(this.api.post<Reactivo>(`/guias/${guiaId}/reactivos`, data, this.token())); }
    catch { return null; }
  }

  async updateReactivo(id: string, data: Partial<Reactivo>): Promise<Reactivo | null> {
    try { return await firstValueFrom(this.api.patch<Reactivo>(`/reactivos/${id}`, data, this.token())); }
    catch { return null; }
  }

  async removeReactivo(id: string): Promise<boolean> {
    try { await firstValueFrom(this.api.delete(`/reactivos/${id}`, this.token())); return true; }
    catch { return false; }
  }

  // ─── Evaluación (aplicar una guía a un candidato inscrito) ────────────────
  async getEvaluacion(enrollmentId: string): Promise<EvaluacionReactivo[]> {
    try { return await firstValueFrom(this.api.get<EvaluacionReactivo[]>(`/evaluaciones?enrollment_id=${enrollmentId}`, this.token())); }
    catch { return []; }
  }

  async initEvaluacion(enrollmentId: string): Promise<{ created: number } | null> {
    try { return await firstValueFrom(this.api.post<{ created: number }>(`/evaluaciones/init/${enrollmentId}`, {}, this.token())); }
    catch { return null; }
  }

  async bulkSaveEvaluacion(enrollmentId: string, records: { reactivo_id: string; respuesta: boolean | null; observaciones?: string }[]): Promise<EvaluacionReactivo[]> {
    try {
      return await firstValueFrom(
        this.api.post<EvaluacionReactivo[]>('/evaluaciones/bulk', { enrollment_id: enrollmentId, records }, this.token())
      );
    } catch { return []; }
  }

  async recalculateEvaluacion(enrollmentId: string): Promise<{ final_grade: number; competency_result: string; peso_obtenido: number; peso_total: number } | null> {
    try {
      return await firstValueFrom(
        this.api.post<{ final_grade: number; competency_result: string; peso_obtenido: number; peso_total: number }>(
          `/evaluaciones/recalculate/${enrollmentId}`, {}, this.token(),
        )
      );
    } catch { return null; }
  }
}
