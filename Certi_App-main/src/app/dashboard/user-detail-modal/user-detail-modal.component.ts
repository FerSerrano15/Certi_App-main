import { Component, inject, input, output, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService, User } from '../../core/services/auth.service';
import { ParticipantsService, Participant } from '../../core/services/participants.service';
import { DocumentsService, CandidateDocument } from '../../core/services/documents.service';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';

/**
 * Detalle de un usuario, abierto desde la tabla de "Usuarios" (o desde una
 * notificación). Reúne en un solo lugar todo lo que un admin necesita para
 * confirmar la veracidad de la información de un candidato/evaluador:
 *  - Sus datos básicos.
 *  - Su foto de perfil, con Validar/Rechazar (el chequeo de MediaPipe al
 *    subirla solo filtra lo evidente — esto es la revisión humana real).
 *  - Sus documentos (INE, comprobante de domicilio, CURP, etc.), con
 *    Ver/Validar/Rechazar.
 *
 * Antes esto vivía repartido en dos lugares (una pestaña dentro de cada
 * solicitud de certificación, y nada para la foto) — ahora es un solo sitio
 * por usuario, sin importar cuántas solicitudes tenga o si tiene alguna.
 */
@Component({
  selector: 'app-user-detail-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './user-detail-modal.component.html',
  styleUrl: './user-detail-modal.component.css',
})
export class UserDetailModalComponent implements OnInit {
  private readonly participantsSvc = inject(ParticipantsService);
  private readonly docsSvc = inject(DocumentsService);
  private readonly confirmSvc = inject(ConfirmDialogService);
  readonly auth = inject(AuthService);

  user = input.required<User>();
  closed = output<void>();
  /** Se emite cuando algo del usuario cambió (foto revisada) — el padre debe recargar la lista. */
  changed = output<void>();

  participant = signal<Participant | null>(null);
  participantLoading = signal(true);
  documents = signal<CandidateDocument[]>([]);
  documentsLoading = signal(false);

  avatarActionBusy = signal(false);
  docActionBusyId = signal<string | null>(null);

  /** Igual que en la tabla de Usuarios: un ADMIN no puede tocar a otro ADMIN ni a un SUPER_ADMIN. */
  locked = computed(() => {
    const u = this.user();
    const isProtectedRole = u.role === 'ADMIN' || u.role === 'SUPER_ADMIN';
    return isProtectedRole && !this.auth.isSuperAdmin() && u.id !== this.auth.currentUser()?.id;
  });

  async ngOnInit() {
    this.participantLoading.set(true);
    const p = await this.participantsSvc.getByUserId(this.user().id);
    this.participant.set(p);
    this.participantLoading.set(false);
    if (p) await this.loadDocuments();
  }

  async loadDocuments() {
    const p = this.participant();
    if (!p) return;
    this.documentsLoading.set(true);
    this.documents.set(await this.docsSvc.list(p.id));
    this.documentsLoading.set(false);
  }

  avatarStatusLabel(): string {
    const map: Record<string, string> = { pending: 'Pendiente de revisión', validated: 'Validada', rejected: 'Rechazada' };
    return map[this.user().avatar_status ?? 'pending'] ?? 'Pendiente de revisión';
  }

  async validateAvatar() {
    this.avatarActionBusy.set(true);
    const ok = await this.auth.reviewAvatar(this.user().id, 'validated');
    this.avatarActionBusy.set(false);
    if (ok) this.changed.emit();
  }

  async rejectAvatar() {
    const ok1 = await this.confirmSvc.ask({
      title: 'Rechazar foto de perfil',
      message: `¿Rechazar la foto de perfil de "${this.user().full_name}"? Se eliminará y el usuario deberá subir una nueva.`,
      confirmText: 'Sí, rechazar',
    });
    if (!ok1) return;
    this.avatarActionBusy.set(true);
    const ok = await this.auth.reviewAvatar(this.user().id, 'rejected');
    this.avatarActionBusy.set(false);
    if (ok) this.changed.emit();
  }

  docTypeLabel(type: string): string { return this.docsSvc.typeLabel(type); }

  docStatusLabel(status: string): string {
    const map: Record<string, string> = { pending: 'Pendiente', validated: 'Validado', rejected: 'Rechazado' };
    return map[status] ?? status;
  }

  async viewDocument(d: CandidateDocument) {
    const url = await this.docsSvc.getUrl(d.id);
    if (url) window.open(url, '_blank', 'noopener');
  }

  async validateDocument(d: CandidateDocument) {
    this.docActionBusyId.set(d.id);
    await this.docsSvc.updateStatus(d.id, 'validated');
    await this.loadDocuments();
    this.docActionBusyId.set(null);
  }

  async rejectDocument(d: CandidateDocument) {
    const ok = await this.confirmSvc.ask({
      title: 'Rechazar documento',
      message: `¿Rechazar "${this.docTypeLabel(d.type)}" (${d.file_name})? El usuario deberá volver a subirlo.`,
      confirmText: 'Sí, rechazar',
    });
    if (!ok) return;
    this.docActionBusyId.set(d.id);
    await this.docsSvc.updateStatus(d.id, 'rejected');
    await this.loadDocuments();
    this.docActionBusyId.set(null);
  }
}
