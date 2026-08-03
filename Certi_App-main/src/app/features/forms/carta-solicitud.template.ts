// ============================================================
// features/forms/carta-solicitud.template.ts
// Template pdfmake: Carta de Solicitud de Interés de Certificación
// ============================================================

import { CartaSolicitudData } from '../../core/interfaces/pdf-data.interface';

const val = (v: string | undefined | null): string => v || '';

function makeHeader(): any {
  return {
    columns: [
      {
        stack: [
          { text: 'red', bold: true, color: '#CC0000', fontSize: 12 },
          { text: 'conocer', bold: true, color: '#333333', fontSize: 12 },
          { text: 'de prestadores de servicios', fontSize: 5, color: '#555' },
          { text: 'Entidad de Certificación y Evaluación', fontSize: 5, color: '#555' }
        ],
        width: '*'
      },
      {
        stack: [
          {
            table: {
              widths: [30, '*'],
              body: [[
                {
                  canvas: [
                    { type: 'ellipse', x: 15, y: 15, r1: 15, r2: 15, color: '#FF6600' },
                    { type: 'ellipse', x: 15, y: 15, r1: 10, r2: 10, color: '#FFCC00' }
                  ],
                  border: [false, false, false, false]
                },
                {
                  stack: [
                    { text: 'UNIPOLL', bold: true, color: '#FF6600', fontSize: 11 },
                    { text: 'Universidad Politécnica de Durango', fontSize: 5, color: '#555' }
                  ],
                  border: [false, false, false, false],
                  margin: [4, 6, 0, 0]
                }
              ]]
            },
            layout: 'noBorders'
          }
        ],
        width: 'auto'
      }
    ],
    margin: [0, 0, 0, 10]
  };
}

export function cartaSolicitudTemplate(data: Partial<CartaSolicitudData>): any {
  const d = data as CartaSolicitudData;

  const firmaContent: any = d.firma && d.firma.startsWith('data:')
    ? { image: d.firma, width: 300, height: 120, margin: [0, 4, 0, 4], alignment: 'center' }
    : {
        table: {
          widths: [300],
          heights: [120],
          body: [[{ text: '', margin: [0, 60, 0, 0] }]]
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => '#333333',
          vLineColor: () => '#333333'
        },
        alignment: 'center'
      };

  return {
    pageSize: 'LETTER',
    pageMargins: [60, 60, 60, 60],
    defaultStyle: { fontSize: 10, font: 'Roboto', lineHeight: 1.4 },

    content: [
      makeHeader(),

      { text: '\n' },

      // Título
      {
        text: 'Carta de Solicitud de Interés de Certificación',
        fontSize: 13,
        bold: true,
        alignment: 'center',
        margin: [0, 0, 0, 20]
      },

      // Fecha
      {
        columns: [
          { text: '', width: '*' },
          {
            text: [
              { text: 'Fecha: ', bold: false },
              { text: '_________________', decoration: 'underline', color: val(d.fecha) ? '#000' : '#AAAAAA' }
            ],
            width: 'auto'
          }
        ],
        margin: [0, 0, 0, 16]
      },

      // Destinatario
      { text: 'A quien Corresponda', bold: true, fontSize: 10, margin: [0, 0, 0, 0] },
      { text: 'P  R  E  S  E  N  T  E.-', bold: true, fontSize: 10, margin: [0, 0, 0, 14] },

      // Párrafo 1
      {
        text: [
          'Por medio de la presente y considerando el resultado obtenido en la evaluación diagnostica, manifiesto mi interés y compromiso para realizar el proceso de evaluación con fines de certificación en el Estándar de Competencia ',
          { text: `${val(d.estandarCodigo)}.- ${val(d.estandarNombre)}.`, bold: true }
        ],
        alignment: 'justify',
        fontSize: 10,
        margin: [0, 0, 0, 12]
      },

      // Párrafo 2
      {
        text: 'Con la intención de validar el proceso de evaluación y el Portafolio de Evidencias en el Estándar de Competencia en cuestión, mismo que se genera a través de un sistema digital, autorizo que mi firma autógrafa que plasmo en esta carta respalde   los siguientes documentos:',
        alignment: 'justify',
        fontSize: 10,
        margin: [0, 0, 0, 8]
      },

      // Lista
      {
        ul: [
          'Plan de evaluación',
          'Instrumento de evaluación',
          'Cédula de juicio'
        ],
        fontSize: 10,
        margin: [20, 0, 0, 12]
      },

      // Párrafo 3
      {
        text: 'De igual manera manifiesto que  recibí  el tríptico de los Derechos y Obligaciones  de los Usuarios del Sistema   Nacional  de Competencias como parte de la información   y orientación previa a mi decisión de iniciar el proceso de evaluación.',
        alignment: 'justify',
        fontSize: 10,
        margin: [0, 0, 0, 12]
      },

      // Párrafo 4
      {
        text: 'Se extiende la presente para hacer constar mi conformidad.',
        fontSize: 10,
        margin: [0, 0, 0, 20]
      },

      // Nombre
      {
        text: [
          { text: 'Nombre Completo: ', bold: true },
          {
            text: val(d.nombreCompleto) || '________________________________________',
            decoration: 'underline'
          }
        ],
        fontSize: 10,
        alignment: 'center',
        margin: [0, 0, 0, 12]
      },

      // Firma box
      {
        columns: [
          { text: '', width: '*' },
          {
            stack: [firmaContent],
            width: 'auto'
          },
          { text: '', width: '*' }
        ],
        margin: [0, 0, 0, 6]
      },

      // Leyenda firma
      {
        text: [
          { text: 'Firma ', bold: true },
          { text: '(Sin salir del recuadro)', italics: true, fontSize: 9 }
        ],
        alignment: 'center',
        fontSize: 10
      }
    ]
  };
}
