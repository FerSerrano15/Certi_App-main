import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CertificationsService } from '../certifications/certifications.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateProgramDto } from './dto/create-program.dto';
import { CreateCourseDto } from './dto/create-course.dto';

type JwtUser = { id: string; role: string };

@Injectable()
export class CoursesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly certifications: CertificationsService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  // ─── Guard helper ─────────────────────────────────────────────────────────
  private requireAdmin(user: JwtUser) {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(user.role)) {
      throw new ForbiddenException('No tienes permisos para esta acción.');
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  PROGRAMS
  // ════════════════════════════════════════════════════════════════════════════

  async listPrograms(user: JwtUser) {
    const { data, error } = await this.supabase.admin.from('programs').select('*').order('name');
    if (error) throw new NotFoundException(error.message);
    return data ?? [];
  }

  async createProgram(dto: CreateProgramDto, user: JwtUser) {
    this.requireAdmin(user);
    const { data, error } = await this.supabase.admin
      .from('programs')
      .insert({
        name: dto.name,
        description: dto.description ?? null,
      })
      .select('*').single();
    if (error) {
      console.error('Error creating program:', error);
      throw new ConflictException(`Error al crear programa: ${error.message}`);
    }
    return data;
  }

  async updateProgram(id: string, dto: Partial<CreateProgramDto>, user: JwtUser) {
    this.requireAdmin(user);
    const { data, error } = await this.supabase.admin
      .from('programs').update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id).select('*').single();
    if (error || !data) throw new NotFoundException('Programa no encontrado.');
    return data;
  }

  async deleteProgram(id: string, user: JwtUser) {
    this.requireAdmin(user);
    const { error } = await this.supabase.admin.from('programs').delete().eq('id', id);
    if (error) throw new NotFoundException(error.message);
    return { message: 'Programa eliminado.' };
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  COURSES
  // ════════════════════════════════════════════════════════════════════════════

  async listCourses(user: JwtUser) {
    const { data, error } = await this.supabase.admin
      .from('courses')
      .select(`
        *,
        programs ( id, name )
      `)
      .order('name');
    if (error) throw new NotFoundException(error.message);
    return data ?? [];
  }

  async getCourse(id: string) {
    const { data, error } = await this.supabase.admin
      .from('courses')
      .select(`*, programs ( id, name ), groups ( *, users ( id, full_name ) )`)
      .eq('id', id).single();
    if (error || !data) throw new NotFoundException('Curso no encontrado.');
    return data;
  }

  async createCourse(dto: CreateCourseDto, user: JwtUser) {
    this.requireAdmin(user);
    const { data, error } = await this.supabase.admin
      .from('courses')
      .insert({
        name:            dto.name,
        code:            dto.code,
        description:     dto.description ?? null,
        program_id:      dto.program_id ?? null,
        estandar_id:     dto.estandar_id,
        // `courses_duration_hours_check` exige > 0; si no se especifica
        // (p.ej. alta rápida desde "Preparación del curso"), usamos 1 como
        // valor mínimo válido — el admin puede editarlo después desde Cursos.
        duration_hours:  dto.duration_hours ?? 1,
        modality:        dto.modality ?? null,
        is_active:       true,
      })
      .select('*').single();
    if (error) throw new ConflictException(error.message);
    return data;
  }

  async updateCourse(id: string, dto: Partial<CreateCourseDto>, user: JwtUser) {
    this.requireAdmin(user);
    const { data, error } = await this.supabase.admin
      .from('courses').update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id).select('*').single();
    if (error || !data) throw new NotFoundException('Curso no encontrado.');
    return data;
  }

  async deleteCourse(id: string, user: JwtUser) {
    this.requireAdmin(user);
    const { error } = await this.supabase.admin.from('courses').delete().eq('id', id);
    if (error) throw new NotFoundException(error.message);
    await this.auditLogs.log({
      user_id: user.id,
      action: 'COURSE_DELETED', entity: 'courses', entityid: id,
    });
    return { message: 'Curso eliminado.' };
  }

  async toggleCourseActive(id: string, user: JwtUser) {
    this.requireAdmin(user);
    const { data: current } = await this.supabase.admin
      .from('courses').select('is_active').eq('id', id).single<{ is_active: boolean }>();
    if (!current) throw new NotFoundException('Curso no encontrado.');
    const { data, error } = await this.supabase.admin
      .from('courses').update({ is_active: !current.is_active, updated_at: new Date().toISOString() })
      .eq('id', id).select('*').single();
    if (error || !data) throw new NotFoundException('Error al actualizar curso.');
    return data;
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  EVALUADORES ELEGIBLES
  //  Un usuario puede ser asignado como evaluador de un curso únicamente si:
  //   1) Tiene el rol EVALUADOR y está activo.
  //   2) Cuenta con la credencial general de evaluador vigente.
  //   3) Cuenta con la certificación vigente del estándar/curso (code) que evaluará.
  // ════════════════════════════════════════════════════════════════════════════

  async getEligibleEvaluators(courseId: string, user: JwtUser) {
    const { data: course, error: courseErr } = await this.supabase.admin
      .from('courses')
      .select('id, code')
      .eq('id', courseId)
      .single<{ id: string; code: string }>();
    if (courseErr || !course) throw new NotFoundException('Curso no encontrado.');

    const { data: evaluators, error } = await this.supabase.admin
      .from('users')
      .select('id, full_name, email, phone')
      .eq('role', 'EVALUADOR')
      .eq('is_active', true);
    if (error) throw new NotFoundException(error.message);

    const [credentialHolders, standardHolders] = await Promise.all([
      this.certifications.getUsersWithEvaluatorCredential(),
      this.certifications.getUsersWithStandardCode(course.code),
    ]);

    return (evaluators ?? []).filter(
      (i: { id: string }) => credentialHolders.has(i.id) && standardHolders.has(i.id),
    );
  }

  private async assertEvaluatorEligible(courseId: string, evaluatorId: string, user: JwtUser) {
    const eligible = await this.getEligibleEvaluators(courseId, user);
    if (!eligible.some((i: { id: string }) => i.id === evaluatorId)) {
      throw new ConflictException(
        'El evaluador seleccionado no cuenta con las certificaciones requeridas (credencial de evaluador + certificación del curso) para este grupo.',
      );
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  GROUPS
  // ════════════════════════════════════════════════════════════════════════════

  async listGroups(courseId: string | null, user: JwtUser) {
    let q = this.supabase.admin
      .from('groups')
      .select(`
        *,
        courses ( id, name, code ),
        users ( id, full_name )
      `)
      .order('created_at', { ascending: false });
    if (courseId) q = q.eq('course_id', courseId);
    const { data, error } = await q;
    if (error) throw new NotFoundException(error.message);
    return data ?? [];
  }

  async createGroup(dto: { course_id: string; name: string; code?: string; evaluator_id?: string; start_date?: string; end_date?: string; capacity?: number; status?: string }, user: JwtUser) {
    this.requireAdmin(user);
    if (dto.evaluator_id) {
      await this.assertEvaluatorEligible(dto.course_id, dto.evaluator_id, user);
    }
    const { data, error } = await this.supabase.admin
      .from('groups')
      .insert({
        course_id:     dto.course_id,
        name:          dto.name,
        evaluator_id:  dto.evaluator_id ?? null,
        start_date:    dto.start_date ?? null,
        end_date:      dto.end_date ?? null,
        capacity:      dto.capacity ?? null,
        code:          dto.code ?? null,
        status:        dto.status ?? 'abierto',
      })
      .select('*').single();
    if (error) throw new ConflictException(error.message);
    return data;
  }

  async updateGroup(id: string, dto: Record<string, unknown>, user: JwtUser) {
    this.requireAdmin(user);
    if (dto['evaluator_id']) {
      const { data: current } = await this.supabase.admin
        .from('groups').select('course_id').eq('id', id)
        .single<{ course_id: string }>();
      const courseId = (dto['course_id'] as string) ?? current?.course_id;
      if (courseId) {
        await this.assertEvaluatorEligible(courseId, dto['evaluator_id'] as string, user);
      }
    }
    const { data, error } = await this.supabase.admin
      .from('groups').update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id).select('*').single();
    if (error || !data) throw new NotFoundException('Grupo no encontrado.');
    return data;
  }

  async deleteGroup(id: string, user: JwtUser) {
    this.requireAdmin(user);
    const { error } = await this.supabase.admin.from('groups').delete().eq('id', id);
    if (error) throw new NotFoundException(error.message);
    await this.auditLogs.log({
      user_id: user.id,
      action: 'GROUP_DELETED', entity: 'groups', entityid: id,
    });
    return { message: 'Grupo eliminado.' };
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  SESSIONS
  // ════════════════════════════════════════════════════════════════════════════

  async listSessions(groupId: string) {
    const { data, error } = await this.supabase.admin
      .from('sessions').select('*').eq('group_id', groupId).order('session_date');
    if (error) throw new NotFoundException(error.message);
    return data ?? [];
  }

  async createSession(dto: { group_id: string; title: string; session_date: string; duration_hours?: number }, user: JwtUser) {
    this.requireAdmin(user);
    const { data, error } = await this.supabase.admin
      .from('sessions')
      .insert({ ...dto, duration_hours: dto.duration_hours ?? 0 })
      .select('*').single();
    if (error) throw new ConflictException(error.message);
    return data;
  }

  async deleteSession(id: string, user: JwtUser) {
    this.requireAdmin(user);
    const { error } = await this.supabase.admin.from('sessions').delete().eq('id', id);
    if (error) throw new NotFoundException(error.message);
    return { message: 'Sesión eliminada.' };
  }
}
