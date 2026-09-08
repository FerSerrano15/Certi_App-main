// ============================================================
// pdf/pdf.service.ts (backend)
// Genera PDFs con pdfmake 0.3.x — API nativa de Node.js.
// Usa addFonts() + pdfDocumentPromise (API correcta de v0.3.x).
// ============================================================

import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { fichaRegistroTemplate } from './ficha-registro.template';

// Ruta a las fuentes Roboto incluidas en pdfmake
const pdfmakePath = path.dirname(require.resolve('pdfmake/package.json'));
const FONTS_PATH = path.join(pdfmakePath, 'build', 'fonts', 'Roboto');

// Instancia única de pdfmake configurada con fuentes
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pm: any = require('pdfmake');
pm.setLocalAccessPolicy(() => true);
pm.setUrlAccessPolicy(() => false);
pm.addFonts({
  Roboto: {
    normal:      path.join(FONTS_PATH, 'Roboto-Regular.ttf'),
    bold:        path.join(FONTS_PATH, 'Roboto-Medium.ttf'),
    italics:     path.join(FONTS_PATH, 'Roboto-Italic.ttf'),
    bolditalics: path.join(FONTS_PATH, 'Roboto-MediumItalic.ttf'),
  },
});

@Injectable()
export class PdfService {
  /**
   * Genera el PDF de la Ficha de Registro como Buffer de Node.js.
   *
   * pdfmake 0.3.x expone `pm.createPdf()` que devuelve un objeto con
   * `pdfDocumentPromise` (un PDFKit ReadableStream).
   * Se lee con eventos .on('data') y .on('end') para concatenar el buffer.
   */
  generateFichaRegistroPdf(data: Record<string, any>): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const docDefinition = fichaRegistroTemplate(data);
        const result = pm.createPdf(docDefinition);

        result.pdfDocumentPromise.then((pdfDoc: any) => {
          const chunks: Buffer[] = [];
          pdfDoc.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
          pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
          pdfDoc.on('error', (err: Error) => reject(err));
          pdfDoc.end();
        }).catch((err: Error) => reject(err));
      } catch (err) {
        reject(err);
      }
    });
  }
}
