import { Injectable, signal } from '@angular/core';

export interface PdfPreviewOptions {
  /** Título mostrado en la cabecera del modal (ej. "Ficha de Registro"). */
  title: string;
  /** Blob URL (object URL) del PDF ya generado, lista para el <iframe>. */
  blobUrl: string;
  /** Nombre de archivo (sin extensión) que se usará al descargar. */
  fileName: string;
}

/**
 * Modal global de previsualización de PDF. Se monta UNA sola vez en el root
 * (app.ts). Reemplaza la descarga/apertura directa de un PDF: cualquier
 * botón "Ver PDF" / "Descargar PDF" de la app debe generar el blob y abrir
 * este modal — el usuario ve la vista previa y decide si descarga o cierra.
 */
@Injectable({ providedIn: 'root' })
export class PdfPreviewDialogService {
  readonly state = signal<PdfPreviewOptions | null>(null);

  open(options: PdfPreviewOptions) {
    // Si había un preview abierto, liberamos su blob URL antes de reemplazarlo.
    this.revokeCurrent();
    this.state.set(options);
  }

  close() {
    this.revokeCurrent();
    this.state.set(null);
  }

  private revokeCurrent() {
    const current = this.state();
    if (current) URL.revokeObjectURL(current.blobUrl);
  }
}
