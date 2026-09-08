import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import {
  CoursesService, Course, Program, Group, CourseSession, EligibleEvaluator
} from '../../core/services/courses.service';
import { ParticipantsService, Participant, Enrollment } from '../../core/services/participants.service';
import { AuthService } from '../../core/services/auth.service';
import { EstandaresService, Estandar, EvaluacionReactivo } from '../../core/services/estandares.service';

type View = 'courses' | 'course-detail' | 'group-detail';

@Component({
  selector: 'app-lms',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './lms.component.html',
  styleUrl: './lms.component.css',
})
export class LmsComponent implements OnInit {
  private readonly svc = inject(CoursesService);
  private readonly partSvc = inject(ParticipantsService);
  private readonly estandaresSvc = inject(EstandaresService);
  readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  // ─── State ───────────────────────────────────────────────────────────────
  view = signal<View>('courses');
  loading = signal(false);
  toast = signal('');

  courses    = signal<Course[]>([]);
  programs   = signal<Program[]>([]);
  groups     = signal<Group[]>([]);
  sessions   = signal<CourseSession[]>([]);
  estandares = signal<Estandar[]>([]);

  selectedCourse = signal<Course | null>(null);
  selectedGroup  = signal<Group | null>(null);

  // ─── Evaluadores / Participantes ─────────────────────────────────────────
  eligibleEvaluators = signal<EligibleEvaluator[]>([]);
  loadingEvaluators  = signal(false);

  groupEnrollments    = signal<Enrollment[]>([]);
  eligibleParticipants = signal<Participant[]>([]);
  showAddParticipantModal = signal(false);
  selectedParticipantId   = signal('');
  loadingParticipants = signal(false);

  // ─── Evaluación (aplicar Guía de Observación a un candidato) ───────────────
  showEvalModal = signal(false);
  evaluatingEnrollment = signal<Enrollment | null>(null);
  evalRows = signal<EvaluacionReactivo[]>([]);
  evalLoading = signal(false);
  evalSaving = signal(false);
  evalError = signal('');
  evalResult = signal<{ final_grade: number; competency_result: string } | null>(null);

  evalGrouped = computed(() => {
    const groups = new Map<string, { titulo: string; orden: number; rows: EvaluacionReactivo[] }>();
    for (const row of this.evalRows()) {
      const guia = row.reactivos?.guias_observacion;
      const key = guia?.id ?? 'sin-guia';
      if (!groups.has(key)) groups.set(key, { titulo: guia?.titulo ?? 'Sin guía', orden: guia?.orden ?? 0, rows: [] });
      groups.get(key)!.rows.push(row);
    }
    return Array.from(groups.values())
      .sort((a, b) => a.orden - b.orden)
      .map(g => ({ ...g, rows: g.rows.sort((a, b) => (a.reactivos?.orden ?? 0) - (b.reactivos?.orden ?? 0)) }));
  });

  evalPesoTotal = computed(() => this.evalRows().reduce((s, r) => s + (r.reactivos?.peso ?? 0), 0));
  evalPesoObtenido = computed(() => this.evalRows().reduce((s, r) => s + (r.respuesta ? (r.reactivos?.peso ?? 0) : 0), 0));
  evalPorcentaje = computed(() => {
    const total = this.evalPesoTotal();
    return total > 0 ? Math.round((this.evalPesoObtenido() / total) * 100) : 0;
  });

  // ─── Modal state ─────────────────────────────────────────────────────────
  showCourseModal   = signal(false);
  showProgramModal  = signal(false);
  showGroupModal    = signal(false);
  showSessionModal  = signal(false);
  editingCourse     = signal<Course | null>(null);
  editingGroup      = signal<Group | null>(null);
  editingProgram    = signal<Program | null>(null);

  // ─── Search / filter ─────────────────────────────────────────────────────
  search = signal('');
  filterProgram = signal('');
  filterStatus  = signal('');

  filteredCourses = computed(() => {
    const q = this.search().toLowerCase();
    const prog = this.filterProgram();
    return this.courses().filter(c =>
      (!q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)) &&
      (!prog || c.program_id === prog)
    );
  });

  filteredGroups = computed(() => {
    const st = this.filterStatus();
    return this.groups().filter(g => !st || g.status === st);
  });

  // ─── Forms ───────────────────────────────────────────────────────────────
  courseForm = this.fb.group({
    name:            ['', [Validators.required, Validators.minLength(3)]],
    code:            ['', [Validators.required, Validators.minLength(2)]],
    description:     [''],
    program_id:      [''],
    estandar_id:     [''],
    duration_hours:  [0, [Validators.min(0)]],
    passing_grade:   [70, [Validators.min(0), Validators.max(100)]],
    min_attendance:  [80, [Validators.min(0), Validators.max(100)]],
    validity_months: [null as number | null],
  });

  programForm = this.fb.group({
    name:        ['', [Validators.required, Validators.minLength(3)]],
    description: [''],
  });

  groupForm = this.fb.group({
    course_id:     ['', Validators.required],
    name:          ['', [Validators.required, Validators.minLength(3)]],
    evaluator_id:  [''],
    start_date:    [''],
    end_date:      [''],
    capacity:      [null as number | null],
    status:        ['PLANEADO'],
  });

  sessionForm = this.fb.group({
    title:          ['', [Validators.required, Validators.minLength(3)]],
    session_date:   ['', Validators.required],
    duration_hours: [0, Validators.min(0)],
  });

  // ─── Lifecycle ───────────────────────────────────────────────────────────
  async ngOnInit() {
    await this.loadAll();
  }

  async loadAll() {
    this.loading.set(true);
    const [courses, programs, estandares] = await Promise.all([
      this.svc.getCourses(),
      this.svc.getPrograms(),
      this.estandaresSvc.list(),
    ]);
    this.courses.set(courses);
    this.programs.set(programs);
    this.estandares.set(estandares);
    this.loading.set(false);
  }

  // ─── Navigation ──────────────────────────────────────────────────────────
  async openCourse(course: Course) {
    this.selectedCourse.set(course);
    const groups = await this.svc.getGroups(course.id);
    this.groups.set(groups);
    this.view.set('course-detail');
  }

  async openGroup(group: Group) {
    this.selectedGroup.set(group);
    const [sessions, enrollments] = await Promise.all([
      this.svc.getSessions(group.id),
      this.partSvc.getEnrollments(group.id),
    ]);
    this.sessions.set(sessions);
    this.groupEnrollments.set(enrollments);
    this.view.set('group-detail');
  }

  backToCourses() {
    this.view.set('courses'); this.selectedCourse.set(null); this.selectedGroup.set(null);
    this.groupEnrollments.set([]);
  }
  backToCourse() {
    this.view.set('course-detail'); this.selectedGroup.set(null);
    this.groupEnrollments.set([]);
  }

  // ─── Course CRUD ─────────────────────────────────────────────────────────
  openNewCourse() {
    this.editingCourse.set(null);
    this.courseForm.reset({ passing_grade: 70, min_attendance: 80, duration_hours: 0 });
    this.showCourseModal.set(true);
  }

  openEditCourse(course: Course, e: Event) {
    e.stopPropagation();
    this.editingCourse.set(course);
    this.courseForm.patchValue({
      name: course.name, code: course.code,
      description: course.description ?? '',
      program_id: course.program_id ?? '',
      estandar_id: course.estandar_id ?? '',
      duration_hours: course.duration_hours,
      passing_grade: course.passing_grade,
      min_attendance: course.min_attendance,
      validity_months: course.validity_months,
    });
    this.showCourseModal.set(true);
  }

  async saveCourse() {
    if (this.courseForm.invalid) { this.courseForm.markAllAsTouched(); return; }
    this.loading.set(true);
    const val = this.courseForm.value;
    const payload: Partial<Course> = {
      name:            val.name ?? undefined,
      code:            val.code ?? undefined,
      description:     val.description || undefined,
      program_id:      val.program_id || null,
      estandar_id:     val.estandar_id || null,
      duration_hours:  val.duration_hours ?? 0,
      passing_grade:   val.passing_grade ?? 70,
      min_attendance:  val.min_attendance ?? 80,
      validity_months: val.validity_months || null,
    };
    const editing = this.editingCourse();
    const result = editing
      ? await this.svc.updateCourse(editing.id, payload)
      : await this.svc.createCourse(payload);
    if (result) {
      this.showToast(editing ? 'Curso actualizado.' : 'Curso creado.');
      this.showCourseModal.set(false);
      await this.loadAll();
    }
    this.loading.set(false);
  }

  async toggleCourse(course: Course, e: Event) {
    e.stopPropagation();
    await this.svc.toggleCourse(course.id);
    await this.loadAll();
  }

  async deleteCourse(course: Course, e: Event) {
    e.stopPropagation();
    if (!confirm(`¿Eliminar "${course.name}"? Esta acción no se puede deshacer.`)) return;
    await this.svc.deleteCourse(course.id);
    this.showToast('Curso eliminado.');
    await this.loadAll();
  }

  // ─── Program CRUD ────────────────────────────────────────────────────────
  openNewProgram() {
    this.editingProgram.set(null);
    this.programForm.reset();
    this.showProgramModal.set(true);
  }

  openEditProgram(program: Program, e: Event) {
    e.stopPropagation();
    this.editingProgram.set(program);
    this.programForm.patchValue({
      name:        program.name,
      description: program.description ?? '',
    });
    this.showProgramModal.set(true);
  }

  async saveProgram() {
    if (this.programForm.invalid) { this.programForm.markAllAsTouched(); return; }
    const val = this.programForm.value;
    const editing = this.editingProgram();
    const result = editing
      ? await this.svc.updateProgram(editing.id, {
          name:        val.name!,
          description: val.description ?? undefined,
        })
      : await this.svc.createProgram({
          name:        val.name!,
          description: val.description ?? undefined,
        });
    if (result) {
      this.showToast(editing ? 'Programa actualizado.' : 'Programa creado.');
      this.showProgramModal.set(false);
      this.programs.set(await this.svc.getPrograms());
    }
  }

  async deleteProgram(program: Program, e: Event) {
    e.stopPropagation();
    if (!confirm(`¿Eliminar programa "${program.name}"? Los cursos asociados quedarán sin programa.`)) return;
    const ok = await this.svc.deleteProgram(program.id);
    if (ok) {
      this.showToast('Programa eliminado.');
      this.programs.set(await this.svc.getPrograms());
      // Refrescar cursos por si alguno tenía este programa
      this.courses.set(await this.svc.getCourses());
    }
  }

  // ─── Group CRUD ──────────────────────────────────────────────────────────
  async openNewGroup() {
    this.editingGroup.set(null);
    const courseId = this.selectedCourse()?.id ?? '';
    this.groupForm.reset({ status: 'PLANEADO', course_id: courseId, evaluator_id: '' });
    this.showGroupModal.set(true);
    await this.loadEligibleEvaluators(courseId);
  }

  async openEditGroup(group: Group, e: Event) {
    e.stopPropagation();
    this.editingGroup.set(group);
    this.groupForm.patchValue({
      course_id:     group.course_id,
      name:          group.name,
      evaluator_id:  group.evaluator_id ?? '',
      start_date:    group.start_date ?? '',
      end_date:      group.end_date ?? '',
      capacity:      group.capacity,
      status:        group.status,
    });
    this.showGroupModal.set(true);
    await this.loadEligibleEvaluators(group.course_id);
  }

  async loadEligibleEvaluators(courseId: string) {
    if (!courseId) { this.eligibleEvaluators.set([]); return; }
    this.loadingEvaluators.set(true);
    const evaluators = await this.svc.getEligibleEvaluators(courseId);
    this.eligibleEvaluators.set(evaluators);
    this.loadingEvaluators.set(false);
  }

  async saveGroup() {
    if (this.groupForm.invalid) { this.groupForm.markAllAsTouched(); return; }
    this.loading.set(true);
    const val = this.groupForm.value;
    const payload: Partial<Group> = {
      course_id:     val.course_id ?? undefined,
      name:          val.name ?? undefined,
      evaluator_id:  val.evaluator_id || null,
      start_date:    val.start_date || null,
      end_date:      val.end_date || null,
      capacity:      val.capacity || null,
      status:        (val.status as Group['status']) ?? 'PLANEADO',
    };
    const editing = this.editingGroup();
    const result = editing
      ? await this.svc.updateGroup(editing.id, payload)
      : await this.svc.createGroup(payload);
    if (result) {
      this.showToast(editing ? 'Grupo actualizado.' : 'Grupo creado.');
      this.showGroupModal.set(false);
      const groups = await this.svc.getGroups(this.selectedCourse()!.id);
      this.groups.set(groups);
      const current = this.selectedGroup();
      if (current && current.id === result.id) this.selectedGroup.set(result);
    } else {
      this.showToast('No se pudo guardar el grupo. Si asignaste un evaluador, verifica que cuente con la credencial de evaluador y la certificación de este curso.');
    }
    this.loading.set(false);
  }

  async deleteGroup(group: Group, e: Event) {
    e.stopPropagation();
    if (!confirm(`¿Eliminar grupo "${group.name}"?`)) return;
    await this.svc.deleteGroup(group.id);
    this.showToast('Grupo eliminado.');
    const groups = await this.svc.getGroups(this.selectedCourse()!.id);
    this.groups.set(groups);
  }

  // ─── Participantes del grupo ─────────────────────────────────────────────
  async openAddParticipantModal() {
    const group = this.selectedGroup();
    if (!group) return;
    this.selectedParticipantId.set('');
    this.showAddParticipantModal.set(true);
    this.loadingParticipants.set(true);
    this.eligibleParticipants.set(await this.partSvc.getEligibleForGroup(group.id));
    this.loadingParticipants.set(false);
  }

  closeAddParticipantModal() {
    this.showAddParticipantModal.set(false);
    this.selectedParticipantId.set('');
  }

  async confirmAddParticipant() {
    const group = this.selectedGroup();
    const participantId = this.selectedParticipantId();
    if (!group || !participantId) return;
    this.loadingParticipants.set(true);
    const result = await this.partSvc.enrollParticipant(group.id, participantId);
    if (result) {
      this.showToast('Participante inscrito en el grupo.');
      this.closeAddParticipantModal();
      this.groupEnrollments.set(await this.partSvc.getEnrollments(group.id));
    } else {
      this.showToast('No se pudo inscribir al participante.');
    }
    this.loadingParticipants.set(false);
  }

  async removeParticipant(enrollment: Enrollment) {
    if (!confirm(`¿Quitar a "${enrollment.participants?.full_name}" de este grupo?`)) return;
    const ok = await this.partSvc.dropEnrollment(enrollment.id);
    if (ok) {
      this.showToast('Participante removido del grupo.');
      const group = this.selectedGroup();
      if (group) this.groupEnrollments.set(await this.partSvc.getEnrollments(group.id));
    }
  }

  // ─── Evaluación (aplicar Guía de Observación a un candidato) ───────────────
  async openEvaluacion(enrollment: Enrollment) {
    this.evaluatingEnrollment.set(enrollment);
    this.evalRows.set([]);
    this.evalResult.set(null);
    this.evalError.set('');
    this.showEvalModal.set(true);
    this.evalLoading.set(true);

    await this.estandaresSvc.initEvaluacion(enrollment.id);
    const rows = await this.estandaresSvc.getEvaluacion(enrollment.id);
    this.evalRows.set(rows);
    if (rows.length === 0) {
      this.evalError.set('No se encontraron reactivos. Verifica que el curso de este grupo tenga un estándar de competencia vinculado (desde "Editar curso") y que ese estándar tenga guías y reactivos cargados.');
    }
    this.evalLoading.set(false);
  }

  closeEvalModal() {
    this.showEvalModal.set(false);
    this.evaluatingEnrollment.set(null);
    this.evalRows.set([]);
    this.evalResult.set(null);
  }

  setRespuesta(rowId: string, value: boolean) {
    this.evalRows.update(rows => rows.map(r => r.id === rowId ? { ...r, respuesta: value } : r));
  }

  setObservacion(rowId: string, value: string) {
    this.evalRows.update(rows => rows.map(r => r.id === rowId ? { ...r, observaciones: value } : r));
  }

  async guardarEvaluacion() {
    const enrollment = this.evaluatingEnrollment();
    if (!enrollment) return;
    this.evalSaving.set(true);
    const records = this.evalRows().map(r => ({
      reactivo_id: r.reactivo_id,
      respuesta: r.respuesta,
      observaciones: r.observaciones ?? undefined,
    }));
    await this.estandaresSvc.bulkSaveEvaluacion(enrollment.id, records);
    const result = await this.estandaresSvc.recalculateEvaluacion(enrollment.id);
    this.evalSaving.set(false);
    if (result) {
      this.evalResult.set(result);
      this.showToast('Evaluación guardada y calificación calculada.');
      const group = this.selectedGroup();
      if (group) this.groupEnrollments.set(await this.partSvc.getEnrollments(group.id));
    } else {
      this.showToast('Se guardaron las respuestas, pero no se pudo calcular la calificación final.');
    }
  }

  // ─── Session CRUD ────────────────────────────────────────────────────────
  openNewSession() { this.sessionForm.reset({ duration_hours: 0 }); this.showSessionModal.set(true); }

  async saveSession() {
    if (this.sessionForm.invalid) { this.sessionForm.markAllAsTouched(); return; }
    const val = this.sessionForm.value;
    const result = await this.svc.createSession({
      group_id:       this.selectedGroup()!.id,
      title:          val.title!,
      session_date:   val.session_date!,
      duration_hours: val.duration_hours ?? 0,
    });
    if (result) {
      this.showToast('Sesión creada.');
      this.showSessionModal.set(false);
      this.sessions.set(await this.svc.getSessions(this.selectedGroup()!.id));
    }
  }

  async deleteSession(id: string) {
    if (!confirm('¿Eliminar esta sesión?')) return;
    await this.svc.deleteSession(id);
    this.sessions.set(await this.svc.getSessions(this.selectedGroup()!.id));
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  getProgramName(programId: string | null): string {
    return this.programs().find(p => p.id === programId)?.name ?? '—';
  }

  getStatusColor(status: string): string {
    const map: Record<string, string> = {
      PLANEADO: 'status-planned', EN_CURSO: 'status-active',
      FINALIZADO: 'status-done', CANCELADO: 'status-cancelled',
    };
    return map[status] ?? '';
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      PLANEADO: 'Planeado', EN_CURSO: 'En curso',
      FINALIZADO: 'Finalizado', CANCELADO: 'Cancelado',
    };
    return map[status] ?? status;
  }

  private showToast(msg: string) {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(''), 3000);
  }

  totalGroupHours(group: Group): number {
    return this.sessions()
      .filter(s => s.group_id === group.id)
      .reduce((sum, s) => sum + (s.duration_hours ?? 0), 0);
  }

  closeCourseModal()  { this.showCourseModal.set(false); }
  closeProgramModal() { this.showProgramModal.set(false); }
  closeGroupModal()   { this.showGroupModal.set(false); }
  closeSessionModal() { this.showSessionModal.set(false); }
}
