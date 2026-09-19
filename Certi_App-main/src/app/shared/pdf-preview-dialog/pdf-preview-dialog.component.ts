import { Component, inject, computed } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { PdfPreviewDialogService } from './pdf-preview-dialog.service';

/**
 * Modal global de previsualización de PDF. Se monta UNA sola vez en el root
 * (app.ts) y reacciona a PdfPreviewDialogService.state — cualquier
 * componente de la app abre esta vista previa inyectando el servicio, en
 * vez de descargar el PDF directamente o abrirlo en una pestaña nueva.
 */
@Component({
  selector: 'app-pdf-preview-dialog',
  standalone: true,
  templateUrl: './pdf-preview-dialog.component.html',
  styleUrl: './pdf-preview-dialog.component.css',
})
export class PdfPreviewDialogComponent {
  readonly svc = inject(PdfPreviewDialogService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly safeUrl = computed(() => {
    const s = this.svc.state();
    return s ? this.sanitizer.bypassSecurityTrustResourceUrl(s.blobUrl) : null;
  });

  download() {
    const s = this.svc.state();
    if (!s) return;
    const a = document.createElement('a');
    a.href = s.blobUrl;
    a.download = `${s.fileName}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    this.svc.close();
  }
}
