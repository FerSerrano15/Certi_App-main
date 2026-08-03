import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export interface Program {
  id: string;
  institution_id: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Course {
  id: string;
  institution_id: string | null;
  program_id: string | null;
  name: string;
  code: string;
  description: string | null;
  duration_hours: number;
  passing_grade: number;
  min_attendance: number;
  validity_months: number | null;
  is_active: boolean;
  created_at: string;
  programs?: { id: string; name: string } | null;
  groups?: Group[];
}

export interface Group {
  id: string;
  course_id: string;
  institution_id: string | null;
  instructor_id: string | null;
  name: string;
  start_date: string | null;
  end_date: string | null;
  capacity: number | null;
  status: 'PLANEADO' | 'EN_CURSO' | 'FINALIZADO' | 'CANCELADO';
  created_at: string;
  courses?: { id: string; name: string; code: string } | null;
  users?: { id: string; full_name: string } | null;
}

export interface EligibleInstructor {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
}

export interface CourseSession {
  id: string;
  group_id: string;
  title: string;
  session_date: string;
  duration_hours: number;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class CoursesService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  private token() { return this.auth.getToken() ?? ''; }

  // ─── Programs ────────────────────────────────────────────────────────────
  async getPrograms(): Promise<Program[]> {
    try { return await firstValueFrom(this.api.get<Program[]>('/programs', this.token())); }
    catch { return []; }
  }

  async createProgram(data: { name: string; description?: string }): Promise<Program | null> {
    try { return await firstValueFrom(this.api.post<Program>('/programs', data, this.token())); }
    catch { return null; }
  }

  async updateProgram(id: string, data: Partial<Program>): Promise<Program | null> {
    try { return await firstValueFrom(this.api.patch<Program>(`/programs/${id}`, data, this.token())); }
    catch { return null; }
  }

  async deleteProgram(id: string): Promise<boolean> {
    try { await firstValueFrom(this.api.delete(`/programs/${id}`, this.token())); return true; }
    catch { return false; }
  }

  // ─── Courses ─────────────────────────────────────────────────────────────
  async getCourses(): Promise<Course[]> {
    try { return await firstValueFrom(this.api.get<Course[]>('/courses', this.token())); }
    catch { return []; }
  }

  async getCourse(id: string): Promise<Course | null> {
    try { return await firstValueFrom(this.api.get<Course>(`/courses/${id}`, this.token())); }
    catch { return null; }
  }

  async createCourse(data: Partial<Course>): Promise<Course | null> {
    try { return await firstValueFrom(this.api.post<Course>('/courses', data, this.token())); }
    catch { return null; }
  }

  async updateCourse(id: string, data: Partial<Course>): Promise<Course | null> {
    try { return await firstValueFrom(this.api.patch<Course>(`/courses/${id}`, data, this.token())); }
    catch { return null; }
  }

  async toggleCourse(id: string): Promise<Course | null> {
    try { return await firstValueFrom(this.api.patch<Course>(`/courses/${id}/toggle-active`, {}, this.token())); }
    catch { return null; }
  }

  async deleteCourse(id: string): Promise<boolean> {
    try { await firstValueFrom(this.api.delete(`/courses/${id}`, this.token())); return true; }
    catch { return false; }
  }

  // ─── Groups ──────────────────────────────────────────────────────────────
  async getGroups(courseId?: string): Promise<Group[]> {
    const qs = courseId ? `?course_id=${courseId}` : '';
    try { return await firstValueFrom(this.api.get<Group[]>(`/groups${qs}`, this.token())); }
    catch { return []; }
  }

  async createGroup(data: Partial<Group>): Promise<Group | null> {
    try { return await firstValueFrom(this.api.post<Group>('/groups', data, this.token())); }
    catch { return null; }
  }

  async updateGroup(id: string, data: Partial<Group>): Promise<Group | null> {
    try { return await firstValueFrom(this.api.patch<Group>(`/groups/${id}`, data, this.token())); }
    catch { return null; }
  }

  async deleteGroup(id: string): Promise<boolean> {
    try { await firstValueFrom(this.api.delete(`/groups/${id}`, this.token())); return true; }
    catch { return false; }
  }

  /** Instructores que cuentan con la credencial de instructor + la certificación del curso. */
  async getEligibleInstructors(courseId: string): Promise<EligibleInstructor[]> {
    try { return await firstValueFrom(this.api.get<EligibleInstructor[]>(`/courses/${courseId}/eligible-instructors`, this.token())); }
    catch { return []; }
  }

  // ─── Sessions ────────────────────────────────────────────────────────────
  async getSessions(groupId: string): Promise<CourseSession[]> {
    try { return await firstValueFrom(this.api.get<CourseSession[]>(`/sessions?group_id=${groupId}`, this.token())); }
    catch { return []; }
  }

  async createSession(data: { group_id: string; title: string; session_date: string; duration_hours?: number }): Promise<CourseSession | null> {
    try { return await firstValueFrom(this.api.post<CourseSession>('/sessions', data, this.token())); }
    catch { return null; }
  }

  async deleteSession(id: string): Promise<boolean> {
    try { await firstValueFrom(this.api.delete(`/sessions/${id}`, this.token())); return true; }
    catch { return false; }
  }
}
