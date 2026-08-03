import { Injectable } from '@angular/core';
import { cartaSolicitudTemplate } from '../../features/forms/carta-solicitud.template';
import { fichaRegistroTemplate } from '../../features/forms/ficha-registro.template';
import { CartaSolicitudData, FichaRegistroData } from '../interfaces/pdf-data.interface';

@Injectable({ providedIn: 'root' })
export class PdfService {

  /**
   * Descarga el PDF de la Carta de Solicitud de Interés.
   */
  async downloadCartaSolicitud(data: Partial<CartaSolicitudData>, fileName = 'carta-solicitud'): Promise<void> {
    const docDefinition = cartaSolicitudTemplate(data);
    await this.generateAndDownload(docDefinition, fileName);
  }

  /**
   * Descarga el PDF de la Ficha de Registro del Candidato.
   */
  async downloadFichaRegistro(data: Partial<FichaRegistroData>, fileName = 'ficha-registro'): Promise<void> {
    const docDefinition = fichaRegistroTemplate(data);
    await this.generateAndDownload(docDefinition, fileName);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Generación y descarga usando pdfmake
  // ──────────────────────────────────────────────────────────────────────────
  private async generateAndDownload(docDefinition: any, fileName: string): Promise<void> {
    // Importación dinámica para no bloquear el bundle principal
    const pdfMakeModule = await import('pdfmake/build/pdfmake');
    const pdfFontsModule = await import('pdfmake/build/vfs_fonts');

    // Compatibilidad con diferentes formatos de exportación del módulo
    const pdfMake = (pdfMakeModule as any).default ?? pdfMakeModule;
    const pdfFonts = (pdfFontsModule as any).default ?? pdfFontsModule;

    // Asignar fuentes virtuales (Roboto incluido por defecto en pdfmake)
    pdfMake.vfs = pdfFonts.vfs ?? pdfFonts.pdfMake?.vfs;

    pdfMake.createPdf(docDefinition).download(`${fileName}.pdf`);
  }
}
