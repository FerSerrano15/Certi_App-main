import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export interface Participant {
  id: string;
  institution_id: string | null;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  national_id: string | null;
  created_at: string;
}

export interface Enrollment {
  id: string;
  group_id: string;
  participant_id: string;
  final_grade: number | null;
  attendance_percentage: number | null;
  documents_validated: boolean;
  status: 'enrolled' | 'completed' | 'dropped';
  enrolled_at: string;
  participants?: { id: string; full_name: string; email: string; national_id: string | null } | null;
  groups?: { id: string; name: string; course_id: string; courses?: { id: string; name: string; code: string } | null } | null;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  enrollment_id: string;
  present: boolean;
  marked_at: string;
  enrollments?: {
    id: string;
    status: string;
    participants?: { id: string; full_name: string; email: string; national_id: string | null } | null;
  } | null;
}

export interface GroupStats {
  total: number;
  enrolled: number;
  completed: number;
  dropped: number;
  avg_grade: number | null;
  avg_attend: number | null;
  docs_ok: number;
}

@Injectable({ providedIn: 'root' })
export class ParticipantsService {
  private readonly api  = inject(ApiService);
  private readonly auth = inject(AuthService);
  private token() { return this.auth.getToken() ?? ''; }

  // ─── Participants ─────────────────────────────────────────────────────────
  async getParticipants(search?: string): Promise<Participant[]> {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    try { return await firstValueFrom(this.api.get<Participant[]>(`/participants${qs}`, this.token())); }
    catch { return []; }
  }

  async createParticipant(data: Partial<Participant>): Promise<Participant | null> {
    try { return await firstValueFrom(this.api.post<Participant>('/participants', data, this.token())); }
    catch { return null; }
  }

  async updateParticipant(id: string, data: Partial<Participant>): Promise<Participant | null> {
    try { return await firstValueFrom(this.api.patch<Participant>(`/participants/${id}`, data, this.token())); }
    catch { return null; }
  }

  async deleteParticipant(id: string): Promise<boolean> {
    try { await firstValueFrom(this.api.delete(`/participants/${id}`, this.token())); return true; }
    catch { return false; }
  }

  // ─── Enrollments ─────────────────────────────────────────────────────────
  async getEnrollments(groupId?: string, participantId?: string): Promise<Enrollment[]> {
    const params: string[] = [];
    if (groupId)       params.push(`group_id=${groupId}`);
    if (participantId) params.push(`participant_id=${participantId}`);
    const qs = params.length ? `?${params.join('&')}` : '';
    try { return await firstValueFrom(this.api.get<Enrollment[]>(`/enrollments${qs}`, this.token())); }
    catch { return []; }
  }

  async enrollParticipant(groupId: string, participantId: string): Promise<Enrollment | null> {
    try { return await firstValueFrom(this.api.post<Enrollment>('/enrollments', { group_id: groupId, participant_id: participantId }, this.token())); }
    catch { return null; }
  }

  /** El propio candidato (OPERADOR) solicita su inscripción a un grupo. */
  async selfEnroll(groupId: string): Promise<Enrollment | null> {
    try { return await firstValueFrom(this.api.post<Enrollment>('/enrollments/self', { group_id: groupId }, this.token())); }
    catch { return null; }
  }

  async updateEnrollment(id: string, data: Partial<Enrollment>): Promise<Enrollment | null> {
    try { return await firstValueFrom(this.api.patch<Enrollment>(`/enrollments/${id}`, data, this.token())); }
    catch { return null; }
  }

  async dropEnrollment(id: string): Promise<boolean> {
    try { await firstValueFrom(this.api.delete(`/enrollments/${id}`, this.token())); return true; }
    catch { return false; }
  }

  /** Candidatos que ya llenaron carta de solicitud + ficha de registro y no están en este grupo. */
  async getEligibleForGroup(groupId: string): Promise<Participant[]> {
    try { return await firstValueFrom(this.api.get<Participant[]>(`/participants/eligible-for-group?group_id=${groupId}`, this.token())); }
    catch { return []; }
  }

  async getGroupStats(groupId: string): Promise<GroupStats | null> {
    try { return await firstValueFrom(this.api.get<GroupStats>(`/enrollments/stats/${groupId}`, this.token())); }
    catch { return null; }
  }

  // ─── Attendance ───────────────────────────────────────────────────────────
  async getAttendance(sessionId: string): Promise<AttendanceRecord[]> {
    try { return await firstValueFrom(this.api.get<AttendanceRecord[]>(`/attendance?session_id=${sessionId}`, this.token())); }
    catch { return []; }
  }

  async initAttendance(sessionId: string): Promise<{ created: number } | null> {
    try { return await firstValueFrom(this.api.post<{ created: number }>(`/attendance/init/${sessionId}`, {}, this.token())); }
    catch { return null; }
  }

  async bulkSaveAttendance(sessionId: string, records: { enrollment_id: string; present: boolean }[]): Promise<AttendanceRecord[]> {
    try {
      return await firstValueFrom(
        this.api.post<AttendanceRecord[]>('/attendance/bulk', { session_id: sessionId, records }, this.token())
      );
    }
    catch { return []; }
  }

  async toggleAttendance(sessionId: string, enrollmentId: string): Promise<AttendanceRecord | null> {
    try { return await firstValueFrom(this.api.patch<AttendanceRecord>(`/attendance/toggle/${sessionId}/${enrollmentId}`, {}, this.token())); }
    catch { return null; }
  }

  async recalculateAttendance(groupId: string): Promise<{ updated: number } | null> {
    try { return await firstValueFrom(this.api.post<{ updated: number }>(`/attendance/recalculate/${groupId}`, {}, this.token())); }
    catch { return null; }
  }
}
