import { Component, inject, signal, computed, viewChild, ElementRef, OnInit, OnDestroy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService, User, UserRole } from '../core/services/auth.service';
import { EstandaresComponent } from './estandares/estandares.component';
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
import { EstandarPickerComponent } from '../shared/estandar-picker/estandar-picker.component';
import { Estandar } from '../core/services/estandares.service';
import { MiCertificacionComponent } from './mi-certificacion/mi-certificacion.component';
import { SolicitudesAdminComponent } from './solicitudes-admin/solicitudes-admin.component';
import { EvaluadorProcesosComponent } from './evaluador-procesos/evaluador-procesos.component';
import { ConfirmDialogService } from '../shared/confirm-dialog/confirm-dialog.service';
import { FaceAnalysisService, FaceCheckResult } from '../core/services/face-analysis.service';
import { UserDetailModalComponent } from './user-detail-modal/user-detail-modal.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    DatePipe,
    EstandaresComponent,
    AttendanceComponent,
    EnrollmentFormsAdminComponent,
    EnrollmentFormWizardComponent,
    LandingEditorComponent,
    MisFichasComponent,
    NotificationsBellComponent,
    FichaRegistroAdminComponent,
    EstandarPickerComponent,
    MiCertificacionComponent,
    SolicitudesAdminComponent,
    EvaluadorProcesosComponent,
    UserDetailModalComponent,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class DashboardComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  private readonly partSvc = inject(ParticipantsService);
  private readonly certSvc = inject(CertificationsService);
  private readonly coursesSvc = inject(CoursesService);
  private readonly docsSvc = inject(DocumentsService);
  private readonly certificatesSvc = inject(CertificatesService);
  private readonly auditSvc = inject(AuditLogsService);
  private router = inject(Router);
  private readonly confirmSvc = inject(ConfirmDialogService);
  private readonly faceAnalysis = inject(FaceAnalysisService);

  activeTab = signal('inicio');
  highlightFichaId = signal<string | null>(null);
  /** Usuario abierto en el modal de detalle (foto + documentos), desde la tabla de Usuarios o una notificación. */
  selectedUserForDetail = signal<User | null>(null);
  allUsers = signal<User[]>([]);
  /** Mensaje de error si la última carga de usuarios falló (null = sin error). */
  usersLoadError = signal<string | null>(null);
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
      !enrolledIds.has(g.id) && g.status !== 'cancelado' && g.status !== 'finalizado'
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
  newCertEstandar = signal<Estandar | null>(null);
  showEstandarPicker = signal(false);

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

  // ─── Foto de perfil (archivo o cámara) ────────────────────────────────────
  avatarBusy = signal(false);
  avatarFeedback = signal('');
  avatarFeedbackIsError = signal(false);

  // Resultado del análisis automático de la foto (MediaPipe, en el propio
  // navegador) — se muestra como checklist antes de permitir la subida.
  faceCheckBusy = signal(false);
  faceCheckResult = signal<FaceCheckResult | null>(null);

  showCameraModal = signal(false);
  cameraReady = signal(false);
  cameraError = signal('');
  capturedPhoto = signal<string | null>(null);
  private cameraStream: MediaStream | null = null;
  private capturedBlob: Blob | null = null;

  cameraVideoRef = viewChild<ElementRef<HTMLVideoElement>>('cameraVideo');
  cameraCanvasRef = viewChild<ElementRef<HTMLCanvasElement>>('cameraCanvas');

  async onAvatarFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = ''; // permite volver a elegir el mismo archivo después
    if (!file) return;
    await this.uploadAvatarFile(file);
  }

  private async uploadAvatarFile(file: File) {
    if (!file.type.startsWith('image/')) {
      this.avatarFeedback.set('Selecciona un archivo de imagen (JPG, PNG o WEBP).');
      this.avatarFeedbackIsError.set(true);
      this.faceCheckResult.set(null);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.avatarFeedback.set('La imagen no debe superar 5 MB.');
      this.avatarFeedbackIsError.set(true);
      this.faceCheckResult.set(null);
      return;
    }

    // Análisis automático (en el navegador) antes de subir: evita que se
    // cuelen fotos que claramente no son un rostro (capturas de
    // videojuegos, memes, paisajes, etc.) o que tengan problemas obvios de
    // encuadre. No sustituye la revisión humana — solo filtra lo evidente.
    this.faceCheckBusy.set(true);
    this.avatarFeedback.set('');
    let check: FaceCheckResult | null = null;
    try {
      check = await this.faceAnalysis.analyzeFile(file);
    } catch {
      // Si el análisis falla (p.ej. sin conexión para descargar el modelo
      // la primera vez), no bloqueamos al usuario — dejamos que el admin
      // revise la foto manualmente como respaldo.
      check = null;
    }
    this.faceCheckBusy.set(false);
    this.faceCheckResult.set(check);

    if (check && !check.resultado.apta) {
      this.avatarFeedback.set('La foto no pasó la verificación automática. Revisa los puntos marcados abajo.');
      this.avatarFeedbackIsError.set(true);
      return;
    }

    this.avatarBusy.set(true);
    const res = await this.auth.uploadAvatar(file, check);
    this.avatarBusy.set(false);
    if (res.ok) {
      this.avatarFeedback.set('✅ Foto de perfil actualizada. Un administrador la revisará en breve.');
      this.avatarFeedbackIsError.set(false);
      this.faceCheckResult.set(null);
      this.closeCamera();
    } else {
      this.avatarFeedback.set(res.error ?? 'No se pudo actualizar la foto.');
      this.avatarFeedbackIsError.set(true);
    }
  }

  async openCamera() {
    this.showCameraModal.set(true);
    this.cameraError.set('');
    this.capturedPhoto.set(null);
    this.capturedBlob = null;
    this.cameraReady.set(false);
    this.faceCheckResult.set(null);
    this.avatarFeedback.set('');
    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      queueMicrotask(() => {
        const video = this.cameraVideoRef()?.nativeElement;
        if (video) {
          video.srcObject = this.cameraStream;
          video.onloadedmetadata = () => this.cameraReady.set(true);
        }
      });
    } catch {
      this.cameraError.set('No se pudo acceder a la cámara. Verifica los permisos del navegador.');
    }
  }

  closeCamera() {
    this.showCameraModal.set(false);
    this.cameraStream?.getTracks().forEach(t => t.stop());
    this.cameraStream = null;
    this.cameraReady.set(false);
    this.capturedPhoto.set(null);
    this.capturedBlob = null;
    this.faceCheckResult.set(null);
  }

  capturePhoto() {
    const video = this.cameraVideoRef()?.nativeElement;
    const canvas = this.cameraCanvasRef()?.nativeElement;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // Detiene el stream en vivo en cuanto tenemos la foto (evita dejar la
    // cámara encendida mientras se muestra la previsualización).
    this.cameraStream?.getTracks().forEach(t => t.stop());
    canvas.toBlob(blob => {
      if (!blob) return;
      this.capturedBlob = blob;
      this.capturedPhoto.set(canvas.toDataURL('image/jpeg', 0.92));
    }, 'image/jpeg', 0.92);
  }

  retakePhoto() {
    this.capturedPhoto.set(null);
    this.capturedBlob = null;
    this.faceCheckResult.set(null);
    this.avatarFeedback.set('');
    this.openCamera();
  }

  async confirmCapturedPhoto() {
    if (!this.capturedBlob) return;
    const file = new File([this.capturedBlob], 'foto-perfil.jpg', { type: 'image/jpeg' });
    await this.uploadAvatarFile(file);
  }

  ngOnDestroy() {
    this.cameraStream?.getTracks().forEach(t => t.stop());
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
  /** Mensaje de error si la última carga de "mis documentos" falló (null = sin error). */
  myDocumentsLoadError = signal<string | null>(null);

  async loadMyDocuments() {
    try {
      this.myDocuments.set(await this.docsSvc.list());
      this.myDocumentsLoadError.set(null);
    } catch (err: any) {
      this.myDocuments.set([]);
      this.myDocumentsLoadError.set(err?.message || 'No se pudo cargar tu lista de documentos.');
    }
  }

  onMyDocFileSelected(e: Event) {
    this.myPendingFile = (e.target as HTMLInputElement).files?.[0] ?? null;
  }

  async uploadMyDocument() {
    if (!this.myPendingFile) return;
    this.uploadingMyDoc.set(true);
    try {
      await this.docsSvc.uploadSelf(this.selectedMyDocType(), this.myPendingFile);
      this.actionSuccess.set('✅ Documento subido correctamente.');
      setTimeout(() => this.actionSuccess.set(''), 3000);
      this.myPendingFile = null;
      await this.loadMyDocuments();
    } catch (err: any) {
      this.actionSuccess.set(`❌ No se pudo subir el documento: ${err?.message || 'error desconocido'}`);
      setTimeout(() => this.actionSuccess.set(''), 8000);
    }
    this.uploadingMyDoc.set(false);
  }

  /**
   * Checklist de "Mis documentos": para cada tipo (INE, CURP, etc.) dice si
   * ya se subió algo y en qué estado. INE es obligatorio y comprobante de
   * estudios es opcional — el resto (comprobante de domicilio, CURP,
   * fotografía, otro) no tiene una exigencia definida todavía, así que no
   * llevan etiqueta de "Obligatorio"/"Opcional".
   */
  docTypeUploadStatus(type: string): 'validated' | 'pending' | 'rejected' | 'missing' {
    const docs = this.myDocuments().filter(d => d.type === type);
    if (!docs.length) return 'missing';
    if (docs.some(d => d.status === 'validated')) return 'validated';
    if (docs.some(d => d.status === 'pending')) return 'pending';
    return 'rejected';
  }

  docTypeUploadStatusLabel(type: string): string {
    const map: Record<string, string> = {
      validated: 'Validado', pending: 'Pendiente de revisión', rejected: 'Rechazado — vuelve a subirlo', missing: 'No subido',
    };
    return map[this.docTypeUploadStatus(type)];
  }

  /** Documentos marcados como obligatorios que el candidato aún no ha subido (o le fueron rechazados). */
  missingRequiredDocTypes = computed(() =>
    this.documentTypes.filter(t => t.requirement === 'required' &&
      this.docTypeUploadStatus(t.value) !== 'validated' && this.docTypeUploadStatus(t.value) !== 'pending')
  );

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
    this.newCertEstandar.set(null);
    this.showEstandarPicker.set(false);
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

  onEstandarPicked(e: Estandar) {
    this.newCertEstandar.set(e);
    this.newCertCode.set(e.codigo);
    this.showEstandarPicker.set(false);
  }

  async addCertification() {
    const evaluator = this.managingEvaluator();
    if (!evaluator) return;
    const type = this.newCertType();
    const estandar = this.newCertEstandar();
    if (type === 'STANDARD' && !estandar) {
      this.actionSuccess.set('Selecciona el estándar de competencia (ej: EC0217).');
      setTimeout(() => this.actionSuccess.set(''), 3000);
      return;
    }
    this.loadingCerts.set(true);
    const result = await this.certSvc.create({
      user_id: evaluator.id,
      type,
      estandar_id: type === 'STANDARD' ? estandar!.id : undefined,
      code: type === 'STANDARD' ? estandar!.codigo : undefined,
      name: this.newCertName().trim() || (type === 'STANDARD' ? estandar!.nombre : undefined),
      expires_at: this.newCertExpires() || undefined,
    });
    if (result) {
      this.newCertCode.set('');
      this.newCertName.set('');
      this.newCertExpires.set('');
      this.newCertEstandar.set(null);
      this.showEstandarPicker.set(false);
      await this.loadEvaluatorCerts(evaluator.id);
    } else {
      this.loadingCerts.set(false);
    }
  }

  async removeCertification(id: string) {
    const ok1 = await this.confirmSvc.ask({
      title: 'Eliminar certificación',
      message: '¿Eliminar esta certificación?',
      detail: 'El evaluador dejará de contar con esta credencial/certificación de inmediato. Esta acción no se puede deshacer.',
    });
    if (!ok1) return;
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
    try {
      const users = await this.auth.getAllUsers();
      this.allUsers.set(users);
      this.usersLoadError.set(null);
    } catch (err: any) {
      this.allUsers.set([]);
      this.usersLoadError.set(err?.message || 'No se pudo cargar la lista de usuarios.');
    }
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

  // La opción "Super Admin" solo tiene sentido para quien ya es SUPER_ADMIN:
  // un ADMIN nunca recibe cuentas SUPER_ADMIN en `allUsers` (el backend las
  // filtra por completo), así que mostrar el filtro sería confuso.
  userRoleFilterOptions = computed<{ value: UserRole | 'TODOS'; label: string }[]>(() => {
    const base: { value: UserRole | 'TODOS'; label: string }[] = [
      { value: 'TODOS', label: 'Todos los roles' },
      { value: 'CANDIDATO', label: 'Candidato' },
      { value: 'EVALUADOR', label: 'Evaluador' },
      { value: 'ADMIN', label: 'Admin' },
    ];
    if (this.auth.isSuperAdmin()) {
      base.push({ value: 'SUPER_ADMIN', label: 'Super Admin' });
    }
    return base;
  });

  /**
   * Jerarquía de administración: un ADMIN puede VER a otros ADMIN en esta
   * tabla, pero no puede modificarlos de ninguna forma (ni desactivarlos, ni
   * cambiarles el rol, ni sus datos) — no puede "bajar de nivel" a ningún
   * admin. Las cuentas SUPER_ADMIN ni siquiera llegan a `allUsers` para un
   * ADMIN (el backend las filtra), así que no necesitan chequeo aquí.
   */
  isPeerAdminLocked(u: User): boolean {
    return u.role === 'ADMIN' && !this.auth.isSuperAdmin() && u.id !== this.user?.id;
  }

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

  /** "Ver solicitud" desde la campanita de notificaciones — navega a Solicitudes de Ficha y resalta la ficha concreta. */
  onOpenSolicitudFromNotification(fichaId: string | null) {
    this.highlightFichaId.set(fichaId);
    this.setTab('solicitudes');
  }

  /** Notificación de foto de perfil — abre el detalle de ese usuario (foto + documentos). */
  async onOpenUsuarioFromNotification(ev: { user_id: string; full_name: string | null }) {
    this.setTab('usuarios');
    await this.openUserDetailById(ev.user_id);
  }

  /** Notificación de documento subido — abre el detalle de ese usuario (foto + documentos). */
  async onOpenParticipantDocsFromNotification(ev: { participant_id: string; full_name: string | null; user_id?: string | null }) {
    this.setTab('usuarios');
    if (ev.user_id) await this.openUserDetailById(ev.user_id);
  }

  /** Abre el modal de detalle de un usuario, buscándolo primero en la lista ya cargada. */
  async openUserDetailById(userId: string) {
    if (!this.allUsers().length) await this.loadUsers();
    let u = this.allUsers().find(x => x.id === userId) ?? null;
    if (!u) {
      // No estaba en la lista cargada (p.ej. quedó desactualizada) — recarga una vez más.
      await this.loadUsers();
      u = this.allUsers().find(x => x.id === userId) ?? null;
    }
    if (u) this.selectedUserForDetail.set(u);
  }

  openUserDetail(u: User) {
    this.selectedUserForDetail.set(u);
  }

  closeUserDetail() {
    this.selectedUserForDetail.set(null);
  }

  /** El modal de detalle validó/rechazó la foto de perfil — recarga la lista y refresca el usuario mostrado. */
  async onUserDetailChanged() {
    const id = this.selectedUserForDetail()?.id;
    await this.loadUsers();
    if (id) this.selectedUserForDetail.set(this.allUsers().find(u => u.id === id) ?? null);
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
    { id: 'mi-certificacion', label: 'Mi Certificación' },
    { id: 'perfil', label: 'Mi perfil' },
    ];
    if (role === 'EVALUADOR') return [...base,
    { id: 'mis-procesos', label: 'Mis Procesos' },
    { id: 'perfil', label: 'Mi perfil' },
    { id: 'asistencia', label: 'Asistencia' },
    ];
    if (role === 'ADMIN') return [...base,
    { id: 'usuarios', label: 'Usuarios' },
    { id: 'estandares', label: 'Estándares' },
    { id: 'solicitudes', label: 'Solicitudes de Ficha' },
    { id: 'solicitudes-certificacion', label: 'Solicitudes de Certificación' },
    { id: 'certificados', label: 'Certificados' },
    { id: 'formularios', label: 'Formularios' },
    { id: 'reportes', label: 'Reportes' },
    ];
    if (role === 'SUPER_ADMIN') return [...base,
    { id: 'usuarios', label: 'Todos los usuarios' },
    { id: 'estandares', label: 'Estándares' },
    { id: 'solicitudes', label: 'Solicitudes de Ficha' },
    { id: 'solicitudes-certificacion', label: 'Solicitudes de Certificación' },
    { id: 'certificados', label: 'Certificados' },
    { id: 'formularios', label: 'Formularios' },
    { id: 'reportes', label: 'Reportes' },
    { id: 'landing', label: 'Landing Page' },
    { id: 'auditoria', label: 'Auditoría' },
    ];
    return base;
  }
}
