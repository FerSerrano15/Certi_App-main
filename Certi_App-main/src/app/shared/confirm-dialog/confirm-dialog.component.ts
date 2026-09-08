import { Component, inject } from '@angular/core';
import { ConfirmDialogService } from './confirm-dialog.service';

/**
 * Modal global de doble confirmación. Se monta UNA sola vez en el root
 * (app.ts) y reacciona a ConfirmDialogService.state — cualquier componente
 * de la app dispara la confirmación inyectando el servicio, sin tener que
 * repetir un modal propio por cada CRUD.
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.css',
})
export class ConfirmDialogComponent {
  readonly svc = inject(ConfirmDialogService);
}
