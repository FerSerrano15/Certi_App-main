import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EnrollmentFormsService, EnrollmentFormWithParticipant, EnrollmentForm } from '../../core/services/enrollment-forms.service';
import { PdfService } from '../../core/services/pdf.service';
import { AuthService } from '../../core/services/auth.service';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';

interface FormGroup {
  participantName: string;
  participantEmail: string;
  courseName: string;
  groupName: string;
  enrollmentId: string;
  cartaSolicitud: EnrollmentFormWithParticipant | null;
  fichaRegistro: EnrollmentFormWithParticipant | null;
}

@Component({
  selector: 'app-enrollment-forms-admin',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './enrollment-forms-admin.component.html',
  styleUrl: './enrollment-forms-admin.component.css',
})
export class EnrollmentFormsAdminComponent implements OnInit {
  private readonly svc  = inject(EnrollmentFormsService);
  private readonly confirmSvc = inject(ConfirmDialogService);
  private readonly pdf  = inject(PdfService);
  readonly auth         = inject(AuthService);

  // ─── State ───────────────────────────────────────────────────────────────
  loading    = signal(true);
  toast      = signal('');
  search     = signal('');
  rawForms   = signal<EnrollmentFormWithParticipant[]>([]);
  selectedGroup = signal<FormGroup | null>(null);
  viewingForm   = signal<EnrollmentForm | null>(null);
  downloadingId = signal<string | null>(null);

  // ─── Group forms by enrollment ───────────────────────────────────────────
  formGroups = computed<FormGroup[]>(() => {
    const forms = this.rawForms();
    const map = new Map<string, FormGroup>();

    for (const f of forms) {
      const enId = f.enrollment_id;
      if (!map.has(enId)) {
        map.set(enId, {
          enrollmentId:  enId,
          participantName:  f.enrollments?.participants?.full_name ?? 'Participante',
          participantEmail: f.enrollments?.participants?.email ?? '',
          courseName:    f.enrollments?.groups?.courses?.name ?? '—',
          groupName:     f.enrollments?.groups?.name ?? '—',
          cartaSolicitud: null,
          fichaRegistro:  null,
        });
      }
      const g = map.get(enId)!;
      if (f.form_type === 'carta_solicitud') g.cartaSolicitud = f;
      else g.fichaRegistro = f;
    }

    return Array.from(map.values());
  });

  filtered = computed(() => {
    const q = this.search().toLowerCase();
    if (!q) return this.formGroups();
    return this.formGroups().filter(
      (g) =>
        g.participantName.toLowerCase().includes(q) ||
        g.participantEmail.toLowerCase().includes(q) ||
        g.courseName.toLowerCase().includes(q) ||
        g.groupName.toLowerCase().includes(q),
    );
  });

  // ─── Lifecycle ───────────────────────────────────────────────────────────
  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    const data = await this.svc.getAllWithParticipant();
    this.rawForms.set(data);
    this.loading.set(false);
  }

  // ─── Navigation ──────────────────────────────────────────────────────────
  openGroup(g: FormGroup) { this.selectedGroup.set(g); }
  closeGroup() { this.selectedGroup.set(null); this.viewingForm.set(null); }

  viewFormData(form: EnrollmentForm | null) {
    this.viewingForm.set(form);
  }
  closeFormView() { this.viewingForm.set(null); }

  // ─── Downloads ───────────────────────────────────────────────────────────
  async downloadCarta(form: EnrollmentFormWithParticipant) {
    this.downloadingId.set(form.id);
    try {
      const name = form.enrollments?.participants?.full_name ?? 'participante';
      await this.pdf.downloadCartaSolicitud(
        form.form_data,
        `carta-solicitud_${name.replace(/\s+/g, '-').toLowerCase()}`,
      );
    } catch (e) {
      this.showToast('❌ Error al generar el PDF');
    } finally {
      this.downloadingId.set(null);
    }
  }

  async downloadFicha(form: EnrollmentFormWithParticipant) {
    this.downloadingId.set(form.id);
    try {
      const name = form.enrollments?.participants?.full_name ?? 'participante';
      await this.pdf.downloadFichaRegistro(
        form.form_data,
        `ficha-registro_${name.replace(/\s+/g, '-').toLowerCase()}`,
      );
    } catch (e) {
      this.showToast('❌ Error al generar el PDF');
    } finally {
      this.downloadingId.set(null);
    }
  }

  // ─── Delete (SUPER_ADMIN) ─────────────────────────────────────────────────
  async deleteForm(id: string) {
    const ok1 = await this.confirmSvc.ask({
      title: 'Eliminar formulario',
      message: '¿Eliminar este formulario? Esta acción no se puede deshacer.',
    });
    if (!ok1) return;
    const ok = await this.svc.remove(id);
    if (ok) { this.showToast('✅ Formulario eliminado'); await this.load(); }
    else this.showToast('❌ Error al eliminar');
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  private showToast(msg: string) {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(''), 3500);
  }

  formatDate(date: string | null): string {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  getFormDataEntries(form: EnrollmentForm): Array<{ key: string; value: any }> {
    const skip = ['firma']; // no mostrar base64 de firma en el visor
    return Object.entries(form.form_data)
      .filter(([k, v]) => !skip.includes(k) && v !== null && v !== undefined && v !== '')
      .map(([key, value]) => ({ key, value }));
  }

  readonly isSuperAdmin = computed(() => this.auth.userRole() === 'SUPER_ADMIN');
}
