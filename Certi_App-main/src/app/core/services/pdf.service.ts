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
 */
@Injectable({ providedIn: 'root' })
export class PdfService {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly baseUrl = environment.apiUrl;

  // ──────────────────────────────────────────────────────────────────────────
  // Formularios de inscripción (pdfmake en el frontend)
  // ──────────────────────────────────────────────────────────────────────────

  /** Descarga la Carta de Solicitud de Interés (formulario de inscripción). */
  async downloadCartaSolicitud(data: Partial<CartaSolicitudData>, fileName = 'carta-solicitud'): Promise<void> {
    if (!this.isBrowser) return;
    const docDefinition = cartaSolicitudTemplate(data);
    await this.pdfMakeDownload(docDefinition, fileName);
  }

  /**
   * Descarga la Ficha de Registro de un formulario de inscripción
   * (EnrollmentForm — datos locales, no una ficha por estándar en BD).
   * Para una ficha por estándar usa downloadFichaRegistroByFichaId().
   */
  async downloadFichaRegistro(data: Partial<FichaRegistroData> | null, fileName = 'ficha-registro'): Promise<void> {
    if (!this.isBrowser || !data) return;
    const docDefinition = fichaRegistroTemplate(data);
    await this.pdfMakeDownload(docDefinition, fileName);
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

  /** Descarga directamente el PDF de una ficha de registro (por su id). */
  async downloadFichaRegistroByFichaId(fichaId: string, fileName: string, token?: string | null): Promise<void> {
    if (!this.isBrowser) return;
    if (!token) throw new Error('Se requiere autenticación para generar el PDF.');

    const blob = await this.fetchRawBlob(`${this.baseUrl}/pdf/ficha-registro/${fichaId}`, token);
    this.triggerDownload(blob, fileName);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers privados
  // ──────────────────────────────────────────────────────────────────────────

  /** Descarga un PDF usando pdfmake en el browser (para formularios de inscripción). */
  private async pdfMakeDownload(docDefinition: any, fileName: string): Promise<void> {
    // Importación dinámica para no bloquear el bundle inicial
    const pdfMakeModule = await import('pdfmake/build/pdfmake');
    const pdfFontsModule = await import('pdfmake/build/vfs_fonts');
    const pdfMake = (pdfMakeModule as any).default ?? pdfMakeModule;
    const pdfFonts = (pdfFontsModule as any).default ?? pdfFontsModule;
    pdfMake.vfs = pdfFonts?.pdfMake?.vfs ?? pdfFonts?.vfs ?? pdfFonts?.default?.pdfMake?.vfs;
    pdfMake.createPdf(docDefinition).download(`${fileName}.pdf`);
  }

  /** Obtiene el PDF del backend como Blob. */
  private async fetchRawBlob(url: string, token: string): Promise<Blob> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return firstValueFrom(this.http.get(url, { headers, responseType: 'blob' }));
  }

  /** Dispara la descarga de un Blob en el browser. */
  private triggerDownload(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
