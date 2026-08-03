import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ParticipantsService, AttendanceRecord, Enrollment } from '../../core/services/participants.service';
import { CoursesService, Group, CourseSession } from '../../core/services/courses.service';
import { AuthService } from '../../core/services/auth.service';

type AttView = 'groups' | 'sessions' | 'attendance';

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './attendance.component.html',
  styleUrl: './attendance.component.css',
})
export class AttendanceComponent implements OnInit {
  private readonly svc    = inject(ParticipantsService);
  private readonly cSvc   = inject(CoursesService);
  readonly auth           = inject(AuthService);

  view            = signal<AttView>('groups');
  loading         = signal(false);
  toast           = signal('');
  saving          = signal(false);

  groups          = signal<Group[]>([]);
  sessions        = signal<CourseSession[]>([]);
  attendanceRows  = signal<AttendanceRecord[]>([]);
  // local draft: enrollment_id → present
  draft           = signal<Record<string, boolean>>({});

  selectedGroup   = signal<Group | null>(null);
  selectedSession = signal<CourseSession | null>(null);

  // ─── Lifecycle ───────────────────────────────────────────────────────────
  async ngOnInit() {
    this.loading.set(true);
    const groups = await this.cSvc.getGroups();
    // Instructores solo ven sus grupos; admins ven todo
    this.groups.set(groups.filter(g => g.status !== 'CANCELADO'));
    this.loading.set(false);
  }

  // ─── Navigation ──────────────────────────────────────────────────────────
  async openGroup(group: Group) {
    this.selectedGroup.set(group);
    this.loading.set(true);
    const sessions = await this.cSvc.getSessions(group.id);
    this.sessions.set(sessions);
    this.loading.set(false);
    this.view.set('sessions');
  }

  async openSession(session: CourseSession) {
    this.selectedSession.set(session);
    this.loading.set(true);

    // Inicializar registros si no existen
    await this.svc.initAttendance(session.id);

    const rows = await this.svc.getAttendance(session.id);
    this.attendanceRows.set(rows);

    // Armar draft con estado actual
    const d: Record<string, boolean> = {};
    for (const r of rows) { d[r.enrollment_id] = r.present; }
    this.draft.set(d);

    this.loading.set(false);
    this.view.set('attendance');
  }

  backToGroups()   { this.view.set('groups'); this.selectedGroup.set(null); this.selectedSession.set(null); }
  backToSessions() { this.view.set('sessions'); this.selectedSession.set(null); }

  // ─── Attendance actions ───────────────────────────────────────────────────
  toggle(enrollmentId: string) {
    const d = { ...this.draft() };
    d[enrollmentId] = !d[enrollmentId];
    this.draft.set(d);
  }

  markAll(present: boolean) {
    const d: Record<string, boolean> = {};
    for (const r of this.attendanceRows()) { d[r.enrollment_id] = present; }
    this.draft.set(d);
  }

  async saveAttendance() {
    this.saving.set(true);
    const records = Object.entries(this.draft()).map(([enrollment_id, present]) => ({ enrollment_id, present }));
    await this.svc.bulkSaveAttendance(this.selectedSession()!.id, records);
    // Recalcular % en backend
    await this.svc.recalculateAttendance(this.selectedGroup()!.id);
    this.showToast('Asistencia guardada y porcentajes actualizados.');
    this.saving.set(false);
  }

  // ─── Computed ─────────────────────────────────────────────────────────────
  presentCount = computed(() => Object.values(this.draft()).filter(Boolean).length);
  totalCount   = computed(() => this.attendanceRows().length);

  // ─── Helpers ─────────────────────────────────────────────────────────────
  getStatusColor(status: string): string {
    const m: Record<string, string> = {
      PLANEADO: 'att-planned', EN_CURSO: 'att-active', FINALIZADO: 'att-done', CANCELADO: 'att-cancelled',
    };
    return m[status] ?? '';
  }
  getStatusLabel(status: string): string {
    const m: Record<string, string> = {
      PLANEADO: 'Planeado', EN_CURSO: 'En curso', FINALIZADO: 'Finalizado', CANCELADO: 'Cancelado',
    };
    return m[status] ?? status;
  }

  private showToast(msg: string) {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(''), 3500);
  }
}
