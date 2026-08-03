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

type JwtUser = { id: string; role: string; institution_id: string | null };

@Injectable()
export class CoursesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly certifications: CertificationsService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  // ─── Guard helper ─────────────────────────────────────────────────────────
  private requireAdmin(user: JwtUser) {
    if (!['SUPER_ADMIN', 'ADMIN_INSTITUCION', 'COORDINADOR'].includes(user.role)) {
      throw new ForbiddenException('No tienes permisos para esta acción.');
    }
  }

  private async resolveInstitutionId(user: JwtUser, dto: { institution_id?: string }): Promise<string> {
    if (dto?.institution_id) return dto.institution_id;
    if (user?.institution_id) return user.institution_id;

    // 1. Buscar si ya existe una institución activa en la base de datos
    const { data } = await this.supabase.admin
      .from('institutions')
      .select('id')
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (data?.id) return data.id;

    // 2. Si la base de datos no tiene ninguna institución, crear la institución por defecto automáticamente
    const { data: newInst, error } = await this.supabase.admin
      .from('institutions')
      .insert({
        name: 'Institución Principal',
        slug: `inst-principal-${Date.now()}`,
        is_active: true,
      })
      .select('id')
      .single<{ id: string }>();

    if (error || !newInst?.id) {
      throw new ConflictException('No existe ninguna institución en la base de datos y no se pudo crear la por defecto.');
    }
    return newInst.id;
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  PROGRAMS
  // ════════════════════════════════════════════════════════════════════════════

  async listPrograms(user: JwtUser) {
    let q = this.supabase.admin.from('programs').select('*').order('name');
    if (user.role === 'ADMIN_INSTITUCION' && user.institution_id) {
      q = q.eq('institution_id', user.institution_id);
    }
    const { data, error } = await q;
    if (error) throw new NotFoundException(error.message);
    return data ?? [];
  }

  async createProgram(dto: CreateProgramDto, user: JwtUser) {
    this.requireAdmin(user);
    const instId = await this.resolveInstitutionId(user, dto);
    const { data, error } = await this.supabase.admin
      .from('programs')
      .insert({
        name: dto.name,
        description: dto.description ?? null,
        institution_id: instId,
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
    let q = this.supabase.admin
      .from('courses')
      .select(`
        *,
        programs ( id, name )
      `)
      .order('name');
    if (user.role === 'ADMIN_INSTITUCION' && user.institution_id) {
      q = q.eq('institution_id', user.institution_id);
    }
    const { data, error } = await q;
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
    const instId = await this.resolveInstitutionId(user, dto);
    const { data, error } = await this.supabase.admin
      .from('courses')
      .insert({
        name:            dto.name,
        code:            dto.code,
        description:     dto.description ?? null,
        program_id:      dto.program_id ?? null,
        institution_id:  instId,
        duration_hours:  dto.duration_hours ?? 0,
        passing_grade:   dto.passing_grade ?? 70,
        min_attendance:  dto.min_attendance ?? 80,
        validity_months: dto.validity_months ?? null,
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
      user_id: user.id, institution_id: user.institution_id,
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
  //  INSTRUCTORES ELEGIBLES
  //  Un usuario puede ser asignado como instructor de un curso únicamente si:
  //   1) Tiene el rol INSTRUCTOR y está activo.
  //   2) Cuenta con la credencial general de instructor vigente.
  //   3) Cuenta con la certificación vigente del estándar/curso (code) que impartirá.
  // ════════════════════════════════════════════════════════════════════════════

  async getEligibleInstructors(courseId: string, user: JwtUser) {
    const { data: course, error: courseErr } = await this.supabase.admin
      .from('courses')
      .select('id, code, institution_id')
      .eq('id', courseId)
      .single<{ id: string; code: string; institution_id: string | null }>();
    if (courseErr || !course) throw new NotFoundException('Curso no encontrado.');

    let q = this.supabase.admin
      .from('users')
      .select('id, full_name, email, phone, institution_id')
      .eq('role', 'INSTRUCTOR')
      .eq('is_active', true);
    if (user.role === 'ADMIN_INSTITUCION' && user.institution_id) {
      q = q.eq('institution_id', user.institution_id);
    }
    const { data: instructors, error } = await q;
    if (error) throw new NotFoundException(error.message);

    const [instructorCredHolders, standardHolders] = await Promise.all([
      this.certifications.getUsersWithInstructorCredential(),
      this.certifications.getUsersWithStandardCode(course.code),
    ]);

    return (instructors ?? []).filter(
      (i: { id: string }) => instructorCredHolders.has(i.id) && standardHolders.has(i.id),
    );
  }

  private async assertInstructorEligible(courseId: string, instructorId: string, user: JwtUser) {
    const eligible = await this.getEligibleInstructors(courseId, user);
    if (!eligible.some((i: { id: string }) => i.id === instructorId)) {
      throw new ConflictException(
        'El instructor seleccionado no cuenta con las certificaciones requeridas (credencial de instructor + certificación del curso) para impartir este curso.',
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
    if (user.role === 'ADMIN_INSTITUCION' && user.institution_id) {
      q = q.eq('institution_id', user.institution_id);
    }
    const { data, error } = await q;
    if (error) throw new NotFoundException(error.message);
    return data ?? [];
  }

  async createGroup(dto: { course_id: string; name: string; instructor_id?: string; institution_id?: string; start_date?: string; end_date?: string; capacity?: number; status?: string }, user: JwtUser) {
    this.requireAdmin(user);
    if (dto.instructor_id) {
      await this.assertInstructorEligible(dto.course_id, dto.instructor_id, user);
    }
    const instId = await this.resolveInstitutionId(user, dto);
    const { data, error } = await this.supabase.admin
      .from('groups')
      .insert({
        course_id:      dto.course_id,
        name:           dto.name,
        instructor_id:  dto.instructor_id ?? null,
        institution_id: instId,
        start_date:     dto.start_date ?? null,
        end_date:       dto.end_date ?? null,
        capacity:       dto.capacity ?? null,
        status:         dto.status ?? 'PLANEADO',
      })
      .select('*').single();
    if (error) throw new ConflictException(error.message);
    return data;
  }

  async updateGroup(id: string, dto: Record<string, unknown>, user: JwtUser) {
    this.requireAdmin(user);
    if (dto['instructor_id']) {
      const { data: current } = await this.supabase.admin
        .from('groups').select('course_id').eq('id', id)
        .single<{ course_id: string }>();
      const courseId = (dto['course_id'] as string) ?? current?.course_id;
      if (courseId) {
        await this.assertInstructorEligible(courseId, dto['instructor_id'] as string, user);
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
      user_id: user.id, institution_id: user.institution_id,
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
