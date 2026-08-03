import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import {
  ParticipantsService, Participant, Enrollment, AttendanceRecord
} from '../../core/services/participants.service';
import { CoursesService, Group, CourseSession } from '../../core/services/courses.service';
import { AuthService } from '../../core/services/auth.service';
import { EnrollmentFormWizardComponent } from '../enrollment-form-wizard/enrollment-form-wizard.component';
import { DocumentsService, CandidateDocument, DOCUMENT_TYPES } from '../../core/services/documents.service';
import { CertificatesService } from '../../core/services/certificates.service';

type ParticipantView = 'list' | 'detail';

@Component({
  selector: 'app-participants',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, EnrollmentFormWizardComponent],
  templateUrl: './participants.component.html',
  styleUrl: './participants.component.css',
})
export class ParticipantsComponent implements OnInit {
  private readonly svc      = inject(ParticipantsService);
  private readonly coursesSvc = inject(CoursesService);
  private readonly docsSvc  = inject(DocumentsService);
  private readonly certSvc  = inject(CertificatesService);
  readonly auth             = inject(AuthService);
  private readonly fb       = inject(FormBuilder);

  // ─── State ───────────────────────────────────────────────────────────────
  view      = signal<ParticipantView>('list');
  loading   = signal(false);
  toast     = signal('');
  search    = signal('');

  participants    = signal<Participant[]>([]);
  selectedPartic  = signal<Participant | null>(null);
  enrollments     = signal<Enrollment[]>([]);
  allGroups       = signal<Group[]>([]);

  // ─── Documentos ──────────────────────────────────────────────────────────
  documentTypes   = DOCUMENT_TYPES;
  documents       = signal<CandidateDocument[]>([]);
  selectedDocType = signal(DOCUMENT_TYPES[0].value);
  pendingFile: File | null = null;
  uploadingDoc    = signal(false);

  // ─── Certificados ────────────────────────────────────────────────────────
  issuingCertFor  = signal<string | null>(null);

  // ─── Modal state ─────────────────────────────────────────────────────────
  showParticModal   = signal(false);
  showEnrollModal   = signal(false);
  editingPartic     = signal<Participant | null>(null);
  showFormWizard    = signal(false);
  wizardEnrollment  = signal<Enrollment | null>(null);

  // ─── Computed ─────────────────────────────────────────────────────────────
  filteredParticipants = computed(() => {
    const q = this.search().toLowerCase();
    return this.participants().filter(p =>
      !q ||
      p.full_name.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      (p.national_id ?? '').toLowerCase().includes(q)
    );
  });

  unenrolledGroups = computed(() => {
    const enrolledGroupIds = new Set(this.enrollments().map(e => e.group_id));
    return this.allGroups().filter(g => !enrolledGroupIds.has(g.id) && g.status !== 'CANCELADO');
  });

  // ─── Forms ───────────────────────────────────────────────────────────────
  particForm = this.fb.group({
    full_name:   ['', [Validators.required, Validators.minLength(3)]],
    email:       ['', [Validators.required, Validators.email]],
    phone:       [''],
    national_id: [''],
  });

  enrollForm = this.fb.group({
    group_id: ['', Validators.required],
  });

  // ─── Lifecycle ───────────────────────────────────────────────────────────
  async ngOnInit() {
    await this.loadParticipants();
    const groups = await this.coursesSvc.getGroups();
    this.allGroups.set(groups);
  }

  async loadParticipants() {
    this.loading.set(true);
    this.participants.set(await this.svc.getParticipants());
    this.loading.set(false);
  }

  // ─── Navigation ──────────────────────────────────────────────────────────
  async openDetail(p: Participant) {
    this.selectedPartic.set(p);
    this.view.set('detail');
    const [enrs, docs] = await Promise.all([
      this.svc.getEnrollments(undefined, p.id),
      this.docsSvc.list(p.id),
    ]);
    this.enrollments.set(enrs);
    this.documents.set(docs);
  }

  backToList() {
    this.view.set('list'); this.selectedPartic.set(null);
    this.enrollments.set([]); this.documents.set([]);
  }

  // ─── Participant CRUD ─────────────────────────────────────────────────────
  openNewPartic() {
    this.editingPartic.set(null);
    this.particForm.reset();
    this.showParticModal.set(true);
  }

  openEditPartic(p: Participant, e: Event) {
    e.stopPropagation();
    this.editingPartic.set(p);
    this.particForm.patchValue({
      full_name:   p.full_name,
      email:       p.email,
      phone:       p.phone ?? '',
      national_id: p.national_id ?? '',
    });
    this.showParticModal.set(true);
  }

  async savePartic() {
    if (this.particForm.invalid) { this.particForm.markAllAsTouched(); return; }
    this.loading.set(true);
    const val = this.particForm.value;
    const payload: Partial<Participant> = {
      full_name:   val.full_name!,
      email:       val.email!,
      phone:       val.phone || null,
      national_id: val.national_id || null,
    };
    const editing = this.editingPartic();
    const result = editing
      ? await this.svc.updateParticipant(editing.id, payload)
      : await this.svc.createParticipant(payload);
    if (result) {
      this.showToast(editing ? 'Participante actualizado.' : 'Participante registrado.');
      this.showParticModal.set(false);
      await this.loadParticipants();
    }
    this.loading.set(false);
  }

  async deletePartic(p: Participant, e: Event) {
    e.stopPropagation();
    if (!confirm(`¿Eliminar a "${p.full_name}"?`)) return;
    const ok = await this.svc.deleteParticipant(p.id);
    if (ok) { this.showToast('Participante eliminado.'); await this.loadParticipants(); }
  }

  // ─── Enrollment ──────────────────────────────────────────────────────────
  openEnrollModal() {
    this.enrollForm.reset();
    this.showEnrollModal.set(true);
  }

  async enroll() {
    if (this.enrollForm.invalid) { this.enrollForm.markAllAsTouched(); return; }
    const groupId = this.enrollForm.value.group_id!;
    const result = await this.svc.enrollParticipant(groupId, this.selectedPartic()!.id);
    if (result) {
      this.showToast('Inscripción realizada.');
      this.showEnrollModal.set(false);
      this.enrollments.set(await this.svc.getEnrollments(undefined, this.selectedPartic()!.id));
    }
  }

  async dropEnrollment(enrollment: Enrollment) {
    if (!confirm('¿Eliminar esta inscripción?')) return;
    const ok = await this.svc.dropEnrollment(enrollment.id);
    if (ok) {
      this.showToast('Inscripción eliminada.');
      this.enrollments.set(await this.svc.getEnrollments(undefined, this.selectedPartic()!.id));
    }
  }

  // ─── Enrollment Forms Wizard ─────────────────────────────────────────────
  openFormWizard(enrollment: Enrollment, e: Event) {
    e.stopPropagation();
    this.wizardEnrollment.set(enrollment);
    this.showFormWizard.set(true);
  }

  closeFormWizard() {
    this.showFormWizard.set(false);
    this.wizardEnrollment.set(null);
  }

  async onWizardSaved() {
    this.closeFormWizard();
    this.showToast('✅ Formularios de inscripción enviados correctamente');
  }

  // ─── Documentos ──────────────────────────────────────────────────────────
  async loadDocuments() {
    const p = this.selectedPartic();
    if (!p) return;
    this.documents.set(await this.docsSvc.list(p.id));
  }

  onDocFileSelected(e: Event) {
    this.pendingFile = (e.target as HTMLInputElement).files?.[0] ?? null;
  }

  async uploadDocument() {
    const p = this.selectedPartic();
    if (!p || !this.pendingFile) return;
    this.uploadingDoc.set(true);
    const result = await this.docsSvc.uploadForParticipant(p.id, this.selectedDocType(), this.pendingFile);
    if (result) {
      this.showToast('Documento subido.');
      this.pendingFile = null;
      await this.loadDocuments();
    } else {
      this.showToast('No se pudo subir el documento (revisa formato/tamaño: PDF/JPG/PNG, máx. 10 MB).');
    }
    this.uploadingDoc.set(false);
  }

  async viewDocument(doc: CandidateDocument) {
    const url = await this.docsSvc.getUrl(doc.id);
    if (url) window.open(url, '_blank');
    else this.showToast('No se pudo abrir el documento.');
  }

  async validateDocument(doc: CandidateDocument) {
    const result = await this.docsSvc.updateStatus(doc.id, 'validated');
    if (result) { this.showToast('Documento validado.'); await this.loadDocuments(); }
  }

  async rejectDocument(doc: CandidateDocument) {
    if (!confirm('¿Rechazar este documento?')) return;
    const result = await this.docsSvc.updateStatus(doc.id, 'rejected');
    if (result) { this.showToast('Documento rechazado.'); await this.loadDocuments(); }
  }

  async deleteDocument(doc: CandidateDocument) {
    if (!confirm('¿Eliminar este documento?')) return;
    const ok = await this.docsSvc.remove(doc.id);
    if (ok) { this.showToast('Documento eliminado.'); await this.loadDocuments(); }
  }

  docStatusLabel(status: string): string {
    const map: Record<string, string> = { pending: 'Pendiente', validated: 'Validado', rejected: 'Rechazado' };
    return map[status] ?? status;
  }

  docTypeLabel(type: string): string {
    return this.docsSvc.typeLabel(type);
  }

  // ─── Certificados ────────────────────────────────────────────────────────
  async issueCertificate(enrollment: Enrollment) {
    this.issuingCertFor.set(enrollment.id);
    const res = await this.certSvc.issue(enrollment.id);
    if (res.ok) {
      this.showToast(`✅ Certificado emitido — folio ${res.data?.folio}`);
    } else {
      this.showToast(res.error ?? 'No se pudo emitir el certificado.');
    }
    this.issuingCertFor.set(null);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      enrolled: 'Inscrito', completed: 'Completado', dropped: 'Baja',
    };
    return map[status] ?? status;
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      enrolled: 'chip-enrolled', completed: 'chip-completed', dropped: 'chip-dropped',
    };
    return map[status] ?? '';
  }

  getGroupStatusLabel(status: string): string {
    const map: Record<string, string> = {
      PLANEADO: 'Planeado', EN_CURSO: 'En curso', FINALIZADO: 'Finalizado', CANCELADO: 'Cancelado',
    };
    return map[status] ?? status;
  }

  private showToast(msg: string) {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(''), 3000);
  }

  closeParticModal()  { this.showParticModal.set(false); }
  closeEnrollModal()  { this.showEnrollModal.set(false); }
}
