import { Component, inject, signal, OnInit, OnDestroy, ElementRef, ViewChild, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationsService, AppNotification } from '../../core/services/notifications.service';

const POLL_INTERVAL_MS = 30_000;

/** Campanita de notificaciones in-app, visible solo para ADMIN/SUPER_ADMIN. */
@Component({
  selector: 'app-notifications-bell',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notifications-bell.component.html',
  styleUrl: './notifications-bell.component.css',
})
export class NotificationsBellComponent implements OnInit, OnDestroy {
  private readonly notifSvc = inject(NotificationsService);

  @ViewChild('bellBtn') bellBtn!: ElementRef<HTMLButtonElement>;

  /** Emite cuando el admin quiere ver el detalle de una solicitud (navega a la vista de Solicitudes y resalta la ficha, si la notificación trae ficha_id). */
  openSolicitudes = output<string | null>();
  /** Notificación de foto de perfil: navega a Usuarios y filtra por el nombre del candidato. */
  openUsuario = output<{ user_id: string; full_name: string | null }>();
  /** Notificación de documento subido: navega a Solicitudes de Certificación → Documentos del candidato. */
  openParticipantDocs = output<{ participant_id: string; full_name: string | null; user_id?: string | null }>();

  open = signal(false);
  unreadCount = signal(0);
  notifications = signal<AppNotification[]>([]);
  loading = signal(false);
  dropdownPos = signal({ top: 0, left: 0 });

  private pollHandle: ReturnType<typeof setInterval> | null = null;

  async ngOnInit() {
    await this.refreshUnreadCount();
    this.pollHandle = setInterval(() => this.refreshUnreadCount(), POLL_INTERVAL_MS);
  }

  ngOnDestroy() {
    if (this.pollHandle) clearInterval(this.pollHandle);
  }

  async refreshUnreadCount() {
    this.unreadCount.set(await this.notifSvc.unreadCount());
  }

  async toggle() {
    const willOpen = !this.open();
    if (willOpen) {
      const rect = this.bellBtn.nativeElement.getBoundingClientRect();
      this.dropdownPos.set({ top: rect.bottom + 8, left: rect.left });
    }
    this.open.set(willOpen);
    if (willOpen) await this.loadList();
  }

  close() {
    this.open.set(false);
  }

  private async loadList() {
    this.loading.set(true);
    this.notifications.set(await this.notifSvc.list());
    this.loading.set(false);
  }

  async markRead(n: AppNotification, ev: Event) {
    ev.stopPropagation();
    const ok = await this.notifSvc.markRead(n.id);
    if (ok) {
      this.notifications.update(list => list.map(x => x.id === n.id ? { ...x, read: true } : x));
      await this.refreshUnreadCount();
    }
  }

  /** Texto del botón de acción, según el tipo de notificación. */
  actionLabel(n: AppNotification): string {
    if (n.type === 'AVATAR_UPLOADED') return 'Ver usuario';
    if (n.type === 'DOCUMENT_UPLOADED') return 'Ver documentos';
    return 'Ver solicitud';
  }

  /**
   * Acción principal de cada notificación — a dónde navega depende del
   * tipo, porque cada una vive en una parte distinta del dashboard:
   *  - AVATAR_UPLOADED   → Usuarios (filtrado por nombre)
   *  - DOCUMENT_UPLOADED → Solicitudes de Certificación → Documentos
   *  - cualquier otra (fichas de registro, etc.) → Solicitudes de Ficha
   */
  async handleAction(n: AppNotification, ev: Event) {
    ev.stopPropagation();
    if (!n.read) await this.markRead(n, ev);
    this.close();
    if (n.type === 'AVATAR_UPLOADED') {
      this.openUsuario.emit({
        user_id: (n.payload?.['user_id'] as string) ?? '',
        full_name: (n.payload?.['full_name'] as string) ?? null,
      });
      return;
    }
    if (n.type === 'DOCUMENT_UPLOADED') {
      this.openParticipantDocs.emit({
        participant_id: (n.payload?.['participant_id'] as string) ?? '',
        full_name: (n.payload?.['full_name'] as string) ?? null,
        user_id: (n.payload?.['user_id'] as string | null) ?? null,
      });
      return;
    }
    this.openSolicitudes.emit(n.payload?.ficha_id ?? null);
  }
}
