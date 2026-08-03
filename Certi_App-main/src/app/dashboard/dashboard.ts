import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService, User, UserRole } from '../core/services/auth.service';
import { LmsComponent } from './lms/lms.component';
import { InstitutionsComponent } from './institutions/institutions.component';
import { ParticipantsComponent } from './participants/participants.component';
import { AttendanceComponent } from './attendance/attendance.component';
import { EnrollmentFormsAdminComponent } from './enrollment-forms-admin/enrollment-forms-admin.component';
import { ParticipantsService, Participant, Enrollment } from '../core/services/participants.service';
import { EnrollmentFormWizardComponent } from './enrollment-form-wizard/enrollment-form-wizard.component';
import { CertificationsService, Certification, CertificationType } from '../core/services/certifications.service';
import { CoursesService, Group } from '../core/services/courses.service';
import { DocumentsService, CandidateDocument, DOCUMENT_TYPES } from '../core/services/documents.service';
import { CertificatesService, Certificate } from '../core/services/certificates.service';
import { AuditLogsService, AuditLogEntry } from '../core/services/audit-logs.service';
import { LandingEditorComponent } from './landing-editor/landing-editor.component';
import { FichaRegistroPageComponent } from './ficha-registro-page/ficha-registro-page.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    DatePipe,
    LmsComponent,
    InstitutionsComponent,
    ParticipantsComponent,
    AttendanceComponent,
    EnrollmentFormsAdminComponent,
    EnrollmentFormWizardComponent,
    LandingEditorComponent,
    FichaRegistroPageComponent,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class DashboardComponent implements OnInit {
  auth = inject(AuthService);
  private readonly partSvc = inject(ParticipantsService);
  private readonly certSvc = inject(CertificationsService);
  private readonly coursesSvc = inject(CoursesService);
  private readonly docsSvc = inject(DocumentsService);
  private readonly certificatesSvc = inject(CertificatesService);
  private readonly auditSvc = inject(AuditLogsService);
  private router = inject(Router);

  activeTab = signal('inicio');
  allUsers = signal<User[]>([]);
  actionSuccess = signal('');
  mobileMenuOpen = signal(false);

  myParticipantRecord = signal<Participant | null>(null);
  myEnrollments = signal<Enrollment[]>([]);
  showMyWizard = signal(false);
  loadingParticipant = signal(true);
  wizardInitialStep = signal<1 | 2>(1);
  selectedMyEnrollment = signal<Enrollment | null>(null);

  // ─── Cursos disponibles (autoservicio del candidato) ─────────────────────
  availableGroups = signal<Group[]>([]);
  requestingEnrollment = signal(false);

  availableGroupsFiltered = computed(() => {
    const enrolledIds = new Set(this.myEnrollments().map(e => e.group_id));
    return this.availableGroups().filter(g =>
      !enrolledIds.has(g.id) && g.status !== 'CANCELADO' && g.status !== 'FINALIZADO'
    );
  });

  // ─── Mis documentos (candidato) ───────────────────────────────────────────
  documentTypes = DOCUMENT_TYPES;
  myDocuments = signal<CandidateDocument[]>([]);
  selectedMyDocType = signal(DOCUMENT_TYPES[0].value);
  myPendingFile: File | null = null;
  uploadingMyDoc = signal(false);

  // ─── Mis certificados (candidato) ─────────────────────────────────────────
  myCertificates = signal<Certificate[]>([]);

  // ─── Certificaciones de instructores ─────────────────────────────────────
  showCertModal = signal(false);
  managingInstructor = signal<User | null>(null);
  instructorCerts = signal<Certification[]>([]);
  loadingCerts = signal(false);

  newCertType = signal<CertificationType>('INSTRUCTOR_CREDENTIAL');
  newCertCode = signal('');
  newCertName = signal('');
  newCertExpires = signal('');

  hasInstructorCredential = computed(() =>
    this.instructorCerts().some(c => c.type === 'INSTRUCTOR_CREDENTIAL' && c.status === 'vigente')
  );

  ngOnInit() {
    this.loadUsers();
    this.loadMyEnrollments();
    if (this.role === 'OPERADOR') {
      this.loadAvailableGroups();
      this.loadMyDocuments();
      this.loadMyCertificates();
    }
    if (['COORDINADOR', 'ADMIN_INSTITUCION', 'SUPER_ADMIN'].includes(this.role ?? '')) {
      this.loadAllCertificates();
    }
    if (this.role === 'SUPER_ADMIN') this.loadAuditLogs();
  }

  async loadMyEnrollments() {
    const user = this.user;
    if (!user?.email) { this.loadingParticipant.set(false); return; }
    this.loadingParticipant.set(true);
    const parts = await this.partSvc.getParticipants(user.email);
    const me = parts.find(p => p.email === user.email || p.user_id === user.id) ?? parts[0];
    if (me) {
      this.myParticipantRecord.set(me);
      const enrs = await this.partSvc.getEnrollments(undefined, me.id);
      this.myEnrollments.set(enrs);
    }
    this.loadingParticipant.set(false);
  }

  async loadAvailableGroups() {
    this.availableGroups.set(await this.coursesSvc.getGroups());
  }

  async requestEnrollment(groupId: string) {
    this.requestingEnrollment.set(true);
    const result = await this.partSvc.selfEnroll(groupId);
    if (result) {
      this.actionSuccess.set('✅ Solicitud de inscripción enviada. Ya puedes llenar tu carta y tu ficha de registro.');
      setTimeout(() => this.actionSuccess.set(''), 4000);
      await this.loadMyEnrollments();
    } else {
      this.actionSuccess.set('No se pudo completar la inscripción. Intenta de nuevo.');
      setTimeout(() => this.actionSuccess.set(''), 4000);
    }
    this.requestingEnrollment.set(false);
  }

  // ─── Mis documentos ────────────────────────────────────────────────────────
  async loadMyDocuments() {
    this.myDocuments.set(await this.docsSvc.list());
  }

  onMyDocFileSelected(e: Event) {
    this.myPendingFile = (e.target as HTMLInputElement).files?.[0] ?? null;
  }

  async uploadMyDocument() {
    if (!this.myPendingFile) return;
    this.uploadingMyDoc.set(true);
    const result = await this.docsSvc.uploadSelf(this.selectedMyDocType(), this.myPendingFile);
    if (result) {
      this.actionSuccess.set('✅ Documento subido correctamente.');
      setTimeout(() => this.actionSuccess.set(''), 3000);
      this.myPendingFile = null;
      await this.loadMyDocuments();
    } else {
      this.actionSuccess.set('No se pudo subir el documento (PDF/JPG/PNG, máx. 10 MB).');
      setTimeout(() => this.actionSuccess.set(''), 4000);
    }
    this.uploadingMyDoc.set(false);
  }

  docStatusLabel(status: string): string {
    const map: Record<string, string> = { pending: 'Pendiente', validated: 'Validado', rejected: 'Rechazado' };
    return map[status] ?? status;
  }

  docTypeLabel(type: string): string {
    return this.docsSvc.typeLabel(type);
  }

  // ─── Mis certificados ──────────────────────────────────────────────────────
  async loadMyCertificates() {
    this.myCertificates.set(await this.certificatesSvc.listMine());
  }

  // ─── Certificados emitidos (admin) ────────────────────────────────────────
  allCertificates = signal<Certificate[]>([]);
  revokingCertId = signal<string | null>(null);

  async loadAllCertificates() {
    this.allCertificates.set(await this.certificatesSvc.list());
  }

  async revokeCertificate(cert: Certificate) {
    const reason = prompt(`¿Motivo de revocación del certificado ${cert.folio}?`);
    if (reason === null) return;
    this.revokingCertId.set(cert.id);
    const ok = await this.certificatesSvc.revoke(cert.id, reason || undefined);
    if (ok) {
      this.actionSuccess.set('Certificado revocado.');
      setTimeout(() => this.actionSuccess.set(''), 3000);
      await this.loadAllCertificates();
    }
    this.revokingCertId.set(null);
  }

  // ─── Auditoría (Super Admin) ──────────────────────────────────────────────
  auditLogs = signal<AuditLogEntry[]>([]);

  async loadAuditLogs() {
    this.auditLogs.set(await this.auditSvc.list(150));
  }

  auditMetadataPreview(entry: AuditLogEntry): string {
    if (!entry.metadata) return '—';
    try { return JSON.stringify(entry.metadata); } catch { return '—'; }
  }

  openMyWizard(e: Enrollment) {
    this.selectedMyEnrollment.set(e);
    this.wizardInitialStep.set(1);
    this.showMyWizard.set(true);
  }

  /** Abre el wizard directo en la Ficha de Registro (Step 2) usando la primera inscripción disponible */
  openFichaDirectly() {
    // Navegar directamente a la pestaña de Ficha de Registro
    this.setTab('ficha-registro');
  }

  closeMyWizard() {
    this.showMyWizard.set(false);
    this.selectedMyEnrollment.set(null);
  }

  onFichaRegistroSaved() {
    this.actionSuccess.set('✅ Ficha de Registro enviada exitosamente.');
    setTimeout(() => {
      this.actionSuccess.set('');
      this.setTab('inicio');
    }, 3000);
  }

  async onMyWizardSaved() {
    this.closeMyWizard();
    this.actionSuccess.set('✅ Formularios de inscripción enviados exitosamente.');
    setTimeout(() => this.actionSuccess.set(''), 4000);
    await this.loadMyEnrollments();
  }

  // ─── Certificaciones de instructores ─────────────────────────────────────
  async openCertModal(instructor: User) {
    this.managingInstructor.set(instructor);
    this.newCertType.set('INSTRUCTOR_CREDENTIAL');
    this.newCertCode.set('');
    this.newCertName.set('');
    this.newCertExpires.set('');
    this.showCertModal.set(true);
    await this.loadInstructorCerts(instructor.id);
  }

  closeCertModal() {
    this.showCertModal.set(false);
    this.managingInstructor.set(null);
    this.instructorCerts.set([]);
  }

  async loadInstructorCerts(userId: string) {
    this.loadingCerts.set(true);
    this.instructorCerts.set(await this.certSvc.getByUser(userId));
    this.loadingCerts.set(false);
  }

  async addCertification() {
    const instructor = this.managingInstructor();
    if (!instructor) return;
    const type = this.newCertType();
    if (type === 'STANDARD' && !this.newCertCode().trim()) {
      this.actionSuccess.set('Ingresa el código del estándar/curso (ej: EC0217).');
      setTimeout(() => this.actionSuccess.set(''), 3000);
      return;
    }
    this.loadingCerts.set(true);
    const result = await this.certSvc.create({
      user_id: instructor.id,
      type,
      code: type === 'STANDARD' ? this.newCertCode().trim() : undefined,
      name: this.newCertName().trim() || undefined,
      expires_at: this.newCertExpires() || undefined,
    });
    if (result) {
      this.newCertCode.set('');
      this.newCertName.set('');
      this.newCertExpires.set('');
      await this.loadInstructorCerts(instructor.id);
    } else {
      this.loadingCerts.set(false);
    }
  }

  async removeCertification(id: string) {
    if (!confirm('¿Eliminar esta certificación?')) return;
    const ok = await this.certSvc.remove(id);
    if (ok) {
      const instructor = this.managingInstructor();
      if (instructor) await this.loadInstructorCerts(instructor.id);
    }
  }

  certTypeLabel(type: string): string {
    return type === 'INSTRUCTOR_CREDENTIAL' ? 'Credencial de instructor' : 'Estándar';
  }

  toggleMobileMenu() { this.mobileMenuOpen.update(v => !v); }
  closeMobileMenu() { this.mobileMenuOpen.set(false); }

  async loadUsers() {
    const users = await this.auth.getAllUsers();
    this.allUsers.set(users);
  }

  get user() { return this.auth.currentUser(); }
  get role() { return this.auth.userRole(); }

  // Filtros por rol (nuevos nombres del esquema)
  operadores   = computed(() => this.allUsers().filter(u => u.role === 'OPERADOR'));
  instructores = computed(() => this.allUsers().filter(u => u.role === 'INSTRUCTOR'));
  coordinadores = computed(() => this.allUsers().filter(u => u.role === 'COORDINADOR'));
  admins       = computed(() => this.allUsers().filter(u => u.role === 'ADMIN_INSTITUCION'));
  inactivos    = computed(() => this.allUsers().filter(u => !u.is_active));

  // ─── Gestión de roles ────────────────────────────────────────────────────

  async changeRole(userId: string, role: UserRole) {
    const ok = await this.auth.changeUserRole(userId, role);
    if (ok) {
      await this.loadUsers();
      this.actionSuccess.set(`Rol cambiado a ${this.getRoleLabel(role)} exitosamente.`);
      setTimeout(() => this.actionSuccess.set(''), 3000);
    }
  }

  async toggleActive(userId: string) {
    const ok = await this.auth.toggleUserActive(userId);
    if (ok) await this.loadUsers();
  }

  setTab(tab: string) {
    this.activeTab.set(tab);
    this.mobileMenuOpen.set(false);
  }

  async logout() { await this.auth.logout(); }

  /** Primer nombre del usuario actual */
  firstNombre(): string {
    return this.auth.currentUser()?.full_name?.split(' ')?.[0] ?? '';
  }

  /** Inicial del avatar */
  getInitial(): string {
    return this.auth.currentUser()?.full_name?.charAt(0)?.toUpperCase() ?? '?';
  }

  getRoleLabel(role: string): string {
    const labels: Record<string, string> = {
      SUPER_ADMIN:      'Super Admin',
      ADMIN_INSTITUCION:'Admin Institución',
      COORDINADOR:      'Coordinador',
      INSTRUCTOR:       'Instructor',
      OPERADOR:         'Operador',
    };
    return labels[role] ?? role;
  }

  getRoleBadgeClass(role: string): string {
    const classes: Record<string, string> = {
      SUPER_ADMIN:       'badge-superadmin',
      ADMIN_INSTITUCION: 'badge-admin',
      COORDINADOR:       'badge-coordinador',
      INSTRUCTOR:        'badge-instructor',
      OPERADOR:          'badge-operador',
    };
    return classes[role] ?? 'badge-default';
  }

  get navItems() {
    const role = this.role;
    const base = [{ id: 'inicio', icon: '🏠', label: 'Inicio' }];

    if (role === 'OPERADOR') return [...base,
      { id: 'ficha-registro', icon: '📋', label: 'Ficha de Registro' },
      { id: 'perfil',         icon: '👤', label: 'Mi perfil' },
    ];
    if (role === 'INSTRUCTOR') return [...base,
      { id: 'perfil',       icon: '👤', label: 'Mi perfil' },
      { id: 'asistencia',   icon: '✅', label: 'Asistencia' },
    ];
    if (role === 'COORDINADOR') return [...base,
      { id: 'usuarios',     icon: '👥', label: 'Usuarios' },
      { id: 'cursos',       icon: '📚', label: 'Cursos' },
      { id: 'participantes',icon: '👤', label: 'Participantes' },
      { id: 'asistencia',   icon: '✅', label: 'Asistencia' },
      { id: 'instructores', icon: '🎓', label: 'Instructores' },
      { id: 'certificados', icon: '🏅', label: 'Certificados' },
    ];
    if (role === 'ADMIN_INSTITUCION') return [...base,
      { id: 'usuarios',     icon: '👥', label: 'Usuarios' },
      { id: 'cursos',       icon: '📚', label: 'Cursos' },
      { id: 'participantes',icon: '👤', label: 'Participantes' },
      { id: 'instructores', icon: '🎓', label: 'Instructores' },
      { id: 'certificados', icon: '🏅', label: 'Certificados' },
      { id: 'asistencia',   icon: '✅', label: 'Asistencia' },
      { id: 'formularios',  icon: '📝', label: 'Formularios' },
      { id: 'reportes',     icon: '📊', label: 'Reportes' },
    ];
    if (role === 'SUPER_ADMIN') return [...base,
      { id: 'instituciones', icon: '🏛️', label: 'Instituciones' },
      { id: 'usuarios',      icon: '👥', label: 'Todos los usuarios' },
      { id: 'cursos',        icon: '📚', label: 'Cursos' },
      { id: 'participantes', icon: '👤', label: 'Participantes' },
      { id: 'instructores',  icon: '🎓', label: 'Instructores' },
      { id: 'certificados',  icon: '🏅', label: 'Certificados' },
      { id: 'asistencia',    icon: '✅', label: 'Asistencia' },
      { id: 'formularios',   icon: '📝', label: 'Formularios' },
      { id: 'admins',        icon: '🛡️', label: 'Administradores' },
      { id: 'reportes',      icon: '📊', label: 'Reportes' },
      { id: 'landing',       icon: '🖥️', label: 'Landing Page' },
      { id: 'auditoria',     icon: '🕵️', label: 'Auditoría' },
    ];
    return base;
  }
}
