import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateEnrollmentFormDto } from './dto/create-enrollment-form.dto';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];

@Injectable()
export class EnrollmentFormsService {
  constructor(private readonly supabase: SupabaseService) {}

  // ──────────────────────────────────────────────────────────────────────────
  // UPSERT — participante crea o actualiza su propio formulario
  // El admin también puede hacerlo (edición posterior)
  // ──────────────────────────────────────────────────────────────────────────
  async upsert(dto: CreateEnrollmentFormDto, requestingUserId: string) {
    const client = this.supabase.admin;

    // 1. Verificar que la inscripción existe
    const { data: enrollment, error: enrollErr } = await client
      .from('enrollments')
      .select('id, participant_id')
      .eq('id', dto.enrollment_id)
      .single();

    if (enrollErr || !enrollment) {
      throw new NotFoundException('Inscripción no encontrada');
    }

    // 2. Obtener el rol del usuario solicitante
    const { data: requestingUser } = await client
      .from('users')
      .select('role')
      .eq('id', requestingUserId)
      .single();

    const isAdmin = ADMIN_ROLES.includes(requestingUser?.role);

    // 3. Si no es admin, verificar que el participante es el usuario en sesión
    if (!isAdmin) {
      const { data: participant } = await client
        .from('participants')
        .select('user_id')
        .eq('id', enrollment.participant_id)
        .single();

      if (!participant || participant.user_id !== requestingUserId) {
        throw new ForbiddenException(
          'Solo puedes llenar tus propios formularios',
        );
      }
    }

    // 4. Upsert (insert or update) del formulario
    const { data, error } = await client
      .from('enrollment_forms')
      .upsert(
        {
          enrollment_id: dto.enrollment_id,
          form_type: dto.form_type,
          form_data: dto.form_data,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'enrollment_id,form_type', ignoreDuplicates: false },
      )
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET by enrollment — solo ADMIN / SUPER_ADMIN
  // ──────────────────────────────────────────────────────────────────────────
  async getByEnrollment(enrollmentId: string, requestingUserId: string) {
    await this.requireAdmin(requestingUserId);

    const { data, error } = await this.supabase.admin
      .from('enrollment_forms')
      .select('*')
      .eq('enrollment_id', enrollmentId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET single form by enrollment + type — solo ADMIN / SUPER_ADMIN
  // ──────────────────────────────────────────────────────────────────────────
  async getOne(
    enrollmentId: string,
    formType: string,
    requestingUserId: string,
  ) {
    await this.requireAdmin(requestingUserId);

    const { data, error } = await this.supabase.admin
      .from('enrollment_forms')
      .select('*')
      .eq('enrollment_id', enrollmentId)
      .eq('form_type', formType)
      .single();

    if (error || !data) throw new NotFoundException('Formulario no encontrado');
    return data;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE — solo SUPER_ADMIN
  // ──────────────────────────────────────────────────────────────────────────
  async remove(id: string, requestingUserId: string) {
    await this.requireSuperAdmin(requestingUserId);

    const { error } = await this.supabase.admin
      .from('enrollment_forms')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
    return { deleted: true };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET all forms with participant info — para la vista de admin
  // ──────────────────────────────────────────────────────────────────────────
  async getAllWithParticipant(requestingUserId: string) {
    await this.requireAdmin(requestingUserId);

    const { data, error } = await this.supabase.admin
      .from('enrollment_forms')
      .select(`
        id,
        form_type,
        status,
        submitted_at,
        created_at,
        updated_at,
        enrollment_id,
        enrollments (
          id,
          status,
          participants (
            id,
            full_name,
            email,
            national_id
          ),
          groups (
            id,
            name,
            courses ( id, name, code )
          )
        )
      `)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CHECK STATUS — el participante puede ver el estado de sus propios forms
  // ──────────────────────────────────────────────────────────────────────────
  async getMyFormStatus(enrollmentId: string, requestingUserId: string) {
    const client = this.supabase.admin;

    // Verificar que la inscripción pertenece al participante
    const { data: enrollment } = await client
      .from('enrollments')
      .select('id, participant_id')
      .eq('id', enrollmentId)
      .single();

    if (!enrollment) throw new NotFoundException('Inscripción no encontrada');

    const { data: participant } = await client
      .from('participants')
      .select('user_id')
      .eq('id', enrollment.participant_id)
      .single();

    const { data: requestingUser } = await client
      .from('users')
      .select('role')
      .eq('id', requestingUserId)
      .single();

    const isAdmin = ADMIN_ROLES.includes(requestingUser?.role);

    if (!isAdmin && participant?.user_id !== requestingUserId) {
      throw new ForbiddenException('No tienes acceso a esta inscripción');
    }

    const { data: forms } = await client
      .from('enrollment_forms')
      .select('form_type, status, submitted_at')
      .eq('enrollment_id', enrollmentId);

    return {
      enrollment_id: enrollmentId,
      carta_solicitud: forms?.find((f) => f.form_type === 'carta_solicitud') ?? null,
      ficha_registro: forms?.find((f) => f.form_type === 'ficha_registro') ?? null,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers de autorización
  // ──────────────────────────────────────────────────────────────────────────
  private async requireAdmin(userId: string) {
    const { data } = await this.supabase.admin
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (!ADMIN_ROLES.includes(data?.role)) {
      throw new ForbiddenException('Se requiere rol de administrador');
    }
  }

  private async requireSuperAdmin(userId: string) {
    const { data } = await this.supabase.admin
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (data?.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Se requiere rol Super Admin');
    }
  }
}
