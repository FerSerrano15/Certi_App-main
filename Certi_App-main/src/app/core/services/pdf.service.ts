import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { cartaSolicitudTemplate } from '../../features/forms/carta-solicitud.template';
import { fichaRegistroTemplate } from '../../features/forms/ficha-registro.template';
import { CartaSolicitudData, FichaRegistroData } from '../interfaces/pdf-data.interface';

/**
 * PdfService — Frontend
 *
 * La Ficha de Registro de usuario (ficha_registro_data) se genera en el
 * BACKEND (NestJS + pdfmake Node.js), evitando problemas de Web Workers,
 * VFS de fuentes y SSR de Angular.
 *
 * Los formularios de inscripción (EnrollmentForms: carta solicitud, ficha de
 * inscripción) se generan en el frontend con pdfmake porque no están ligados
 * al perfil del usuario — se pasan los datos directamente.
 *
 * Endpoint del backend:
 *   GET /api/pdf/ficha-registro/:fichaId    → PDF de una ficha de registro
 *                                              (dueño de la ficha o admin)
 *
 * Todos los métodos devuelven una blob URL para previsualizar en
 * PdfPreviewDialogService — ningún método descarga el archivo directamente,
 * la descarga la dispara el usuario desde el modal de vista previa.
 */
@Injectable({ providedIn: 'root' })
export class PdfService {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly baseUrl = environment.apiUrl;

  // ──────────────────────────────────────────────────────────────────────────
  // Formularios de inscripción (pdfmake en el frontend)
  // ──────────────────────────────────────────────────────────────────────────

  /** Genera el PDF de la Carta de Solicitud de Interés como blob URL. */
  async getCartaSolicitudBlobUrl(data: Partial<CartaSolicitudData>): Promise<string> {
    if (!this.isBrowser) throw new Error('PDF preview only available in browser.');
    const docDefinition = cartaSolicitudTemplate(data);
    return this.pdfMakeBlobUrl(docDefinition);
  }

  /**
   * Genera el PDF de la Ficha de Registro de un formulario de inscripción
   * (EnrollmentForm — datos locales, no una ficha por estándar en BD) como
   * blob URL. Para una ficha por estándar usa getFichaRegistroBlobUrlByFichaId().
   */
  async getFichaRegistroFormBlobUrl(data: Partial<FichaRegistroData> | null): Promise<string> {
    if (!this.isBrowser || !data) throw new Error('PDF preview only available in browser.');
    const docDefinition = fichaRegistroTemplate(data);
    return this.pdfMakeBlobUrl(docDefinition);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Ficha de Registro por estándar (generada en el BACKEND)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Obtiene una ficha de registro (por su id) como blob URL para usar en un
   * <iframe>. El PDF se genera en el backend a partir de `fichas_registro`.
   */
  async getFichaRegistroBlobUrlByFichaId(fichaId: string, token?: string | null): Promise<string> {
    if (!this.isBrowser) throw new Error('PDF preview only available in browser.');
    if (!token) throw new Error('Se requiere autenticación para generar el PDF.');

    const blob = await this.fetchRawBlob(`${this.baseUrl}/pdf/ficha-registro/${fichaId}`, token);
    return URL.createObjectURL(blob);
  }

  /** Obtiene el PDF de la Evaluación Diagnóstica de un proceso como blob URL para previsualizar/descargar. */
  async getDiagnosticoBlobUrl(processId: string, token?: string | null): Promise<string> {
    if (!this.isBrowser) throw new Error('PDF preview only available in browser.');
    if (!token) throw new Error('Se requiere autenticación para generar el PDF.');

    const blob = await this.fetchRawBlob(`${this.baseUrl}/pdf/diagnostico/${processId}`, token);
    return URL.createObjectURL(blob);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers privados
  // ──────────────────────────────────────────────────────────────────────────

  /** Genera un PDF con pdfmake en el browser y devuelve su blob URL. */
  private async pdfMakeBlobUrl(docDefinition: any): Promise<string> {
    // Importación dinámica para no bloquear el bundle inicial
    const pdfMakeModule = await import('pdfmake/build/pdfmake');
    const pdfFontsModule = await import('pdfmake/build/vfs_fonts');
    const pdfMake = (pdfMakeModule as any).default ?? pdfMakeModule;
    const pdfFonts = (pdfFontsModule as any).default ?? pdfFontsModule;
    pdfMake.vfs = pdfFonts?.pdfMake?.vfs ?? pdfFonts?.vfs ?? pdfFonts?.default?.pdfMake?.vfs;
    const blob = await new Promise<Blob>((resolve) => pdfMake.createPdf(docDefinition).getBlob(resolve));
    return URL.createObjectURL(blob);
  }

  /** Obtiene el PDF del backend como Blob. */
  private async fetchRawBlob(url: string, token: string): Promise<Blob> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return firstValueFrom(this.http.get(url, { headers, responseType: 'blob' }));
  }
}
