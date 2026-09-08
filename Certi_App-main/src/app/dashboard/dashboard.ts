import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService, User, UserRole } from '../core/services/auth.service';
import { LmsComponent } from './lms/lms.component';
import { EstandaresComponent } from './estandares/estandares.component';
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
import { MisFichasComponent } from './mis-fichas/mis-fichas.component';
import { NotificationsBellComponent } from './notifications-bell/notifications-bell.component';
import { FichaRegistroAdminComponent } from './ficha-registro-admin/ficha-registro-admin.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    DatePipe,
    LmsComponent,
    EstandaresComponent,
    ParticipantsComponent,
    AttendanceComponent,
    EnrollmentFormsAdminComponent,
    EnrollmentFormWizardComponent,
    LandingEditorComponent,
    MisFichasComponent,
    NotificationsBellComponent,
    FichaRegistroAdminComponent,
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

  // ─── Certificaciones de evaluadores ───────────────────────────────────────
  showCertModal = signal(false);
  managingEvaluator = signal<User | null>(null);
  evaluatorCerts = signal<Certification[]>([]);
  loadingCerts = signal(false);

  newCertType = signal<CertificationType>('EVALUATOR_CREDENTIAL');
  newCertCode = signal('');
  newCertName = signal('');
  newCertExpires = signal('');

  hasEvaluatorCredential = computed(() =>
    this.evaluatorCerts().some(c => c.type === 'EVALUATOR_CREDENTIAL' && c.status === 'vigente')
  );

  // ─── Eliminar usuario (Super Admin) ───────────────────────────────────────
  showDeleteUserModal = signal(false);
  deletingUser = signal<User | null>(null);
  deleteUserPassword = signal('');
  deleteUserLoading = signal(false);
  deleteUserError = signal('');

  // ─── Modal vista previa PDF ───────────────────────────────────────────────
  showPdfModal = signal(false);
  pdfModalUrl = signal<string | null>(null);
  pdfModalLoading = signal(false);
  pdfModalUser = signal<User | null>(null);
  pdfModalData = signal<Record<string, any> | null>(null);

  // ─── Tarjetas de perfil (acordeón) ───────────────────────────────────────
  activeProfileCard = signal<string | null>(null);

  toggleProfileCard(card: string): void {
    this.activeProfileCard.update(current => current === card ? null : card);
  }

  // ─── Cambio de contraseña ─────────────────────────────────────────────────
  changePwdCurrentPassword = signal('');
  changePwdNew = signal('');
  changePwdConfirm = signal('');
  changePwdLoading = signal(false);
  changePwdError = signal('');
  changePwdSuccess = signal('');
  showChangePwdForm = signal(false);
  showCurrentPwd = signal(false);
  showNewPwd = signal(false);
  showConfirmPwd = signal(false);

  ngOnInit() {
    // Refrescar perfil al iniciar para tener ficha_registro_submitted_at actualizado
    this.auth.refreshProfile();
    this.loadUsers();
    this.loadMyEnrollments();
    if (this.role === 'CANDIDATO') {
      this.loadAvailableGroups();
      this.loadMyDocuments();
      this.loadMyCertificates();
    }
    if (['ADMIN', 'SUPER_ADMIN'].includes(this.role ?? '')) {
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

  closeMyWizard() {
    this.showMyWizard.set(false);
    this.selectedMyEnrollment.set(null);
  }

  onFichaGuardada() {
    this.actionSuccess.set('✅ Ficha de Registro enviada exitosamente.');
    setTimeout(() => this.actionSuccess.set(''), 3000);
  }

  async onMyWizardSaved() {
    this.closeMyWizard();
    this.actionSuccess.set('✅ Formularios de inscripción enviados exitosamente.');
    setTimeout(() => this.actionSuccess.set(''), 4000);
    await this.loadMyEnrollments();
  }

  // ─── Certificaciones de evaluadores ───────────────────────────────────────
  async openCertModal(evaluator: User) {
    this.managingEvaluator.set(evaluator);
    this.newCertType.set('EVALUATOR_CREDENTIAL');
    this.newCertCode.set('');
    this.newCertName.set('');
    this.newCertExpires.set('');
    this.showCertModal.set(true);
    await this.loadEvaluatorCerts(evaluator.id);
  }

  closeCertModal() {
    this.showCertModal.set(false);
    this.managingEvaluator.set(null);
    this.evaluatorCerts.set([]);
  }

  async loadEvaluatorCerts(userId: string) {
    this.loadingCerts.set(true);
    this.evaluatorCerts.set(await this.certSvc.getByUser(userId));
    this.loadingCerts.set(false);
  }

  async addCertification() {
    const evaluator = this.managingEvaluator();
    if (!evaluator) return;
    const type = this.newCertType();
    if (type === 'STANDARD' && !this.newCertCode().trim()) {
      this.actionSuccess.set('Ingresa el código del estándar/curso (ej: EC0217).');
      setTimeout(() => this.actionSuccess.set(''), 3000);
      return;
    }
    this.loadingCerts.set(true);
    const result = await this.certSvc.create({
      user_id: evaluator.id,
      type,
      code: type === 'STANDARD' ? this.newCertCode().trim() : undefined,
      name: this.newCertName().trim() || undefined,
      expires_at: this.newCertExpires() || undefined,
    });
    if (result) {
      this.newCertCode.set('');
      this.newCertName.set('');
      this.newCertExpires.set('');
      await this.loadEvaluatorCerts(evaluator.id);
    } else {
      this.loadingCerts.set(false);
    }
  }

  async removeCertification(id: string) {
    if (!confirm('¿Eliminar esta certificación?')) return;
    const ok = await this.certSvc.remove(id);
    if (ok) {
      const evaluator = this.managingEvaluator();
      if (evaluator) await this.loadEvaluatorCerts(evaluator.id);
    }
  }

  certTypeLabel(type: string): string {
    return type === 'EVALUATOR_CREDENTIAL' ? 'Credencial de evaluador' : 'Estándar';
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
  candidatos = computed(() => this.allUsers().filter(u => u.role === 'CANDIDATO'));
  evaluadores = computed(() => this.allUsers().filter(u => u.role === 'EVALUADOR'));
  admins = computed(() => this.allUsers().filter(u => u.role === 'ADMIN'));
  inactivos = computed(() => this.allUsers().filter(u => !u.is_active));

  // ─── Vista unificada "Usuarios": búsqueda + filtro por rol ────────────────
  userSearchQuery = signal('');
  userRoleFilter = signal<UserRole | 'TODOS'>('TODOS');

  readonly userRoleFilterOptions: { value: UserRole | 'TODOS'; label: string }[] = [
    { value: 'TODOS', label: 'Todos los roles' },
    { value: 'CANDIDATO', label: 'Candidato' },
    { value: 'EVALUADOR', label: 'Evaluador' },
    { value: 'ADMIN', label: 'Admin' },
    { value: 'SUPER_ADMIN', label: 'Super Admin' },
  ];

  filteredUsers = computed(() => {
    const query = this.userSearchQuery().trim().toLowerCase();
    const roleFilter = this.userRoleFilter();
    return this.allUsers().filter(u => {
      const matchesRole = roleFilter === 'TODOS' || u.role === roleFilter;
      const matchesQuery = !query
        || u.full_name.toLowerCase().includes(query)
        || u.email.toLowerCase().includes(query);
      return matchesRole && matchesQuery;
    });
  });

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

  async updateInstitutionName(userId: string, value: string) {
    const ok = await this.auth.updateUser(userId, { institution_name: value.trim() || null });
    if (ok) await this.loadUsers();
  }

  // ─── Eliminar usuario (solo SUPER_ADMIN) ─────────────────────────────────

  openDeleteUserModal(u: User) {
    this.deletingUser.set(u);
    this.deleteUserPassword.set('');
    this.deleteUserError.set('');
    this.showDeleteUserModal.set(true);
  }

  closeDeleteUserModal() {
    if (this.deleteUserLoading()) return;
    this.showDeleteUserModal.set(false);
    this.deletingUser.set(null);
    this.deleteUserPassword.set('');
    this.deleteUserError.set('');
  }

  async confirmDeleteUser() {
    const target = this.deletingUser();
    if (!target) return;

    const password = this.deleteUserPassword().trim();
    if (!password) {
      this.deleteUserError.set('Ingresa tu contraseña para confirmar.');
      return;
    }

    this.deleteUserLoading.set(true);
    this.deleteUserError.set('');
    const result = await this.auth.deleteUser(target.id, password);
    this.deleteUserLoading.set(false);

    if (result.success) {
      this.showDeleteUserModal.set(false);
      this.deletingUser.set(null);
      this.deleteUserPassword.set('');
      this.actionSuccess.set(result.message);
      setTimeout(() => this.actionSuccess.set(''), 4000);
      await this.loadUsers();
    } else {
      this.deleteUserError.set(result.message);
    }
  }

  // ─── Restablecer contraseña (solo SUPER_ADMIN) ───────────────────────────
  // Nota: las contraseñas se guardan como hash (bcrypt) y no se pueden
  // "recuperar" — esto genera una nueva contraseña temporal y cierra la
  // sesión activa del usuario en todos sus dispositivos.

  private generateTempPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let pwd = '';
    for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
    return pwd;
  }

  async resetPassword(userId: string, fullName: string) {
    const confirmed = confirm(
      `Se generará una nueva contraseña temporal para "${fullName}" y se cerrará su sesión activa en todos sus dispositivos. ¿Continuar?`
    );
    if (!confirmed) return;

    const newPassword = this.generateTempPassword();
    const ok = await this.auth.resetUserPassword(userId, newPassword);
    if (ok) {
      alert(`Nueva contraseña temporal para ${fullName}:\n\n${newPassword}\n\nCompártela de forma segura — no se volverá a mostrar.`);
      this.actionSuccess.set(`Contraseña restablecida para ${fullName}.`);
      setTimeout(() => this.actionSuccess.set(''), 3000);
    } else {
      alert('No se pudo restablecer la contraseña. Intenta de nuevo.');
    }
  }

  // ─── Cambio de contraseña propia ─────────────────────────────────────────

  toggleChangePwdForm() {
    this.showChangePwdForm.update(v => !v);
    // Limpiar al cerrar
    if (!this.showChangePwdForm()) {
      this.resetChangePwdForm();
    }
  }

  private resetChangePwdForm() {
    this.changePwdCurrentPassword.set('');
    this.changePwdNew.set('');
    this.changePwdConfirm.set('');
    this.changePwdError.set('');
    this.changePwdSuccess.set('');
    this.showCurrentPwd.set(false);
    this.showNewPwd.set(false);
    this.showConfirmPwd.set(false);
  }

  async submitChangePassword() {
    const current = this.changePwdCurrentPassword().trim();
    const newPwd = this.changePwdNew().trim();
    const confirm = this.changePwdConfirm().trim();

    this.changePwdError.set('');
    this.changePwdSuccess.set('');

    // Validaciones en frontend
    if (!current) {
      this.changePwdError.set('Ingresa tu contraseña actual.');
      return;
    }
    if (newPwd.length < 8) {
      this.changePwdError.set('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPwd !== confirm) {
      this.changePwdError.set('La nueva contraseña y su confirmación no coinciden.');
      return;
    }
    if (current === newPwd) {
      this.changePwdError.set('La nueva contraseña debe ser diferente a la actual.');
      return;
    }

    this.changePwdLoading.set(true);
    const result = await this.auth.changeMyPassword(current, newPwd, confirm);
    this.changePwdLoading.set(false);

    if (result.success) {
      this.changePwdSuccess.set('✅ ' + result.message);
      setTimeout(() => {
        this.changePwdSuccess.set('');
        this.showChangePwdForm.set(false);
        this.resetChangePwdForm();
      }, 3500);
    } else {
      this.changePwdError.set(result.message);
    }
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
      SUPER_ADMIN: 'Super Admin',
      ADMIN: 'Admin',
      EVALUADOR: 'Evaluador',
      CANDIDATO: 'Candidato',
    };
    return labels[role] ?? role;
  }

  getRoleBadgeClass(role: string): string {
    const classes: Record<string, string> = {
      SUPER_ADMIN: 'badge-superadmin',
      ADMIN: 'badge-admin',
      EVALUADOR: 'badge-evaluador',
      CANDIDATO: 'badge-candidato',
    };
    return classes[role] ?? 'badge-default';
  }

  get navItems() {
    const role = this.role;
    const base = [{ id: 'inicio', label: 'Inicio' }];

    if (role === 'CANDIDATO') return [...base,
    { id: 'ficha-registro', label: 'Ficha de Registro' },
    { id: 'perfil', label: 'Mi perfil' },
    ];
    if (role === 'EVALUADOR') return [...base,
    { id: 'perfil', label: 'Mi perfil' },
    { id: 'asistencia', label: 'Asistencia' },
    ];
    if (role === 'ADMIN') return [...base,
    { id: 'usuarios', label: 'Usuarios' },
    { id: 'estandares', label: 'Estándares' },
    { id: 'solicitudes', label: 'Solicitudes de Ficha' },
    { id: 'certificados', label: 'Certificados' },
    { id: 'formularios', label: 'Formularios' },
    { id: 'reportes', label: 'Reportes' },
    ];
    if (role === 'SUPER_ADMIN') return [...base,
    { id: 'usuarios', label: 'Todos los usuarios' },
    { id: 'estandares', label: 'Estándares' },
    { id: 'solicitudes', label: 'Solicitudes de Ficha' },
    { id: 'certificados', label: 'Certificados' },
    { id: 'formularios', label: 'Formularios' },
    { id: 'reportes', label: 'Reportes' },
    { id: 'landing', label: 'Landing Page' },
    { id: 'auditoria', label: 'Auditoría' },
    ];
    return base;
  }
}
