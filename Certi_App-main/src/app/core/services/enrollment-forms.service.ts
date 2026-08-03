import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export interface EnrollmentForm {
  id: string;
  enrollment_id: string;
  form_type: 'carta_solicitud' | 'ficha_registro';
  form_data: Record<string, any>;
  status: 'draft' | 'submitted';
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FormStatus {
  enrollment_id: string;
  carta_solicitud: { form_type: string; status: string; submitted_at: string | null } | null;
  ficha_registro: { form_type: string; status: string; submitted_at: string | null } | null;
}

export interface EnrollmentFormWithParticipant extends EnrollmentForm {
  enrollments?: {
    id: string;
    status: string;
    participants?: { id: string; full_name: string; email: string; national_id: string | null; institution_id: string | null } | null;
    groups?: { id: string; name: string; courses?: { id: string; name: string; code: string } | null } | null;
  } | null;
}

@Injectable({ providedIn: 'root' })
export class EnrollmentFormsService {
  private readonly api  = inject(ApiService);
  private readonly auth = inject(AuthService);
  private token() { return this.auth.getToken() ?? ''; }

  /** Crear o actualizar un formulario (participante o admin) */
  async upsert(
    enrollmentId: string,
    formType: 'carta_solicitud' | 'ficha_registro',
    formData: Record<string, any>,
  ): Promise<EnrollmentForm | null> {
    try {
      return await firstValueFrom(
        this.api.post<EnrollmentForm>(
          '/enrollment-forms',
          { enrollment_id: enrollmentId, form_type: formType, form_data: formData },
          this.token(),
        ),
      );
    } catch {
      return null;
    }
  }

  /** Ver estado de formularios de una inscripción */
  async getStatus(enrollmentId: string): Promise<FormStatus | null> {
    try {
      return await firstValueFrom(
        this.api.get<FormStatus>(`/enrollment-forms/status/${enrollmentId}`, this.token()),
      );
    } catch {
      return null;
    }
  }

  /** Obtener todos los formularios de una inscripción (admin) */
  async getByEnrollment(enrollmentId: string): Promise<EnrollmentForm[]> {
    try {
      return await firstValueFrom(
        this.api.get<EnrollmentForm[]>(`/enrollment-forms/${enrollmentId}`, this.token()),
      );
    } catch {
      return [];
    }
  }

  /** Obtener formulario específico de una inscripción (admin) */
  async getOne(enrollmentId: string, formType: string): Promise<EnrollmentForm | null> {
    try {
      return await firstValueFrom(
        this.api.get<EnrollmentForm>(`/enrollment-forms/${enrollmentId}/${formType}`, this.token()),
      );
    } catch {
      return null;
    }
  }

  /** Obtener todos los formularios enviados con datos de participante (admin) */
  async getAllWithParticipant(): Promise<EnrollmentFormWithParticipant[]> {
    try {
      return await firstValueFrom(
        this.api.get<EnrollmentFormWithParticipant[]>('/enrollment-forms/all', this.token()),
      );
    } catch {
      return [];
    }
  }

  /** Eliminar un formulario (solo SUPER_ADMIN) */
  async remove(id: string): Promise<boolean> {
    try {
      await firstValueFrom(this.api.delete(`/enrollment-forms/${id}`, this.token()));
      return true;
    } catch {
      return false;
    }
  }
}
