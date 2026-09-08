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

  /** Emite cuando el admin quiere ver el detalle de una solicitud (navega a la vista de Solicitudes). */
  openSolicitudes = output<void>();

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

  /** Lleva al admin a la vista de "Solicitudes" (lista de fichas con su estado) en vez de abrir el PDF aquí. */
  async verSolicitud(n: AppNotification, ev: Event) {
    ev.stopPropagation();
    if (!n.read) await this.markRead(n, ev);
    this.close();
    this.openSolicitudes.emit();
  }
}
