import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  /** Título del paso 1 (p.ej. "¿Eliminar este curso?"). */
  title: string;
  /** Mensaje del paso 1 — el mismo texto que antes iba en confirm(). */
  message: string;
  /**
   * Mensaje del paso 2 (segunda confirmación). Si no se especifica, se usa
   * una advertencia genérica de "esta acción no se puede deshacer".
   */
  detail?: string;
  /** Texto del botón que ejecuta la acción (paso 2). Por defecto "Eliminar". */
  confirmText?: string;
  cancelText?: string;
}

interface ConfirmState extends ConfirmOptions {
  step: 1 | 2;
}

/**
 * Reemplazo de window.confirm() para acciones potencialmente dañinas
 * (eliminar, cancelar, rechazar, etc.) en cualquier CRUD de la app.
 *
 * En vez de un solo diálogo nativo (fácil de confirmar por accidente con un
 * doble clic o Enter apresurado), pide DOS confirmaciones explícitas en
 * pasos separados antes de resolver `true`:
 *   1) Un modal con el mensaje de la acción — "Cancelar" / "Continuar".
 *   2) Un segundo modal, ya en tono de advertencia final — "Cancelar" /
 *      el texto de confirmación (p.ej. "Sí, eliminar").
 *
 * Uso:
 *   const ok = await this.confirmSvc.ask({
 *     title: 'Eliminar curso',
 *     message: `¿Eliminar "${course.name}"?`,
 *   });
 *   if (!ok) return;
 *   // ... proceder con la acción destructiva
 */
@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  readonly state = signal<ConfirmState | null>(null);
  private resolver: ((value: boolean) => void) | null = null;

  ask(options: ConfirmOptions): Promise<boolean> {
    // Si ya había una confirmación pendiente sin resolver, la cancelamos
    // para no dejar promesas colgadas.
    this.resolver?.(false);
    return new Promise<boolean>((resolve) => {
      this.resolver = resolve;
      this.state.set({ ...options, step: 1 });
    });
  }

  advance() {
    this.state.update((s) => (s ? { ...s, step: 2 } : s));
  }

  confirm() {
    this.resolver?.(true);
    this.resolver = null;
    this.state.set(null);
  }

  cancel() {
    this.resolver?.(false);
    this.resolver = null;
    this.state.set(null);
  }
}
