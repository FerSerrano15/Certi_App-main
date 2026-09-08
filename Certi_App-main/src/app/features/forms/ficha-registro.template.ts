// ============================================================
// features/forms/ficha-registro.template.ts
// Template pdfmake: Ficha de Registro del Candidato CONOCER
// Replica fielmente el documento oficial de 2 páginas
// ============================================================

import { FichaRegistroData } from '../../core/interfaces/pdf-data.interface';

// ── Helpers ──────────────────────────────────────────────────

// Nota: se evitan glíficos Unicode (☑☐●○) porque la fuente Roboto embebida
// en pdfmake no los incluye — al faltar el glifo, pdfmake calcula mal el
// ancho del carácter y la fila se estira a decenas de líneas fantasma.
const ch = (val: boolean): string => val ? 'X' : '';
const radio = (current: string, target: string): string => current === target ? '(X)' : '(  )';
const val = (v: string | undefined | null): string => v || '';
const GRAY = '#CCCCCC';
const DARK_GRAY = '#808080';

// ── Textos legales ────────────────────────────────────────────

const PRIVACIDAD_INTRO = `El Consejo Nacional de Normalización y Certificación de Competencias Laborales (CONOCER) solicita al candidato la autorización para la publicación de los datos personales a fin de dar cumplimiento a lo dispuesto en el capítulo séptimo de las Reglas Generales y criterios para la integración del Sistema Nacional de Competencias, referente al "Registro Nacional de Personas Con Competencias Certificadas" (RENAP)¹ por medio del cual las personas con competencias certificadas, pueden voluntariamente dar a conocer sus datos personales, para facilitar su localización, en caso de que organizaciones sindicales, empresas, sector académico, sector social o público, o alguna otra institución pública o privada, requieran personal con competencias certificadas en determinada función individual;`;

const PRIVACIDAD_CONSENTIMIENTO_PREFIX = 'SI (   ) NO (   ) doy mi consentimiento al CONOCER para que, en términos del artículo 21° de la Ley Federal de Transparencia y Acceso a la Información Pública Gubernamental, difunda, distribuya y publique la información contenida en el documento que se inscribe para los propósitos del RENAP. Lo anterior, sin perjuicio de que estoy enterado de que en términos del artículo 22, fracción III° de la misma Ley, no es necesario mi consentimiento respecto de información que se transmita entre sujetos obligados o entre dependencias y entidades, cuando los datos respectivos se utilicen para el ejercicio de facultades propias de los mismos.';

const PRIVACIDAD_PIE = `Los datos personales recabados serán protegidos y serán incorporados y tratados en el Sistema de datos personales RENAP con fundamento en las reglas generales y criterios para integración y operación del Sistema Nacional de Competencias y cuya finalidad es integrar una base de datos con información sobre las personas que han obtenido uno o más Certificados de Competencia, con base en Estándares de Competencia inscritos en el Registro Nacional de Estándares de Competencia. el cual fue registrado en el Listado de sistemas de Datos Personales ante el Instituto Federal de Acceso a la información Pública (www.ifai.org.mx) y podrán ser transmitidos a sujetos obligados o dependencias y entidades con la finalidad del uso en facultades propias de las mismas. Además de otras trasmisiones previstas en Ley. La Unidad Administrativa responsable del Sistema es el Consejo Nacional de Normalización y Certificación de Competencias Laborales y la dirección donde el usuario podrá ejercer los derechos de acceso y corrección ante la misma es Av. Barranca del Muerto 275 Col. San José Insurgentes CP  03900, México D.F. Lo anterior se informa en cumplimiento del Decimoséptimo de los lineamientos de protección de Datos Personales, publicados en el Diario Oficial de la Federación el 30 de septiembre de 2005.`;

const FOOTNOTES = [
  '¹EL RENAP, tiene como objetivo fundamental integrar una base de datos con información sobre las personas que han obtenido uno o más Certificados de Competencia, con base en Estándares de Competencia inscritos en el Registro Nacional de Estándares de Competencia.',
  '²Los sujetos obligados no podrán difundir, distribuir o comercializar los datos personales contenidos en los sistemas de información, desarrollados en el ejercicio de sus funciones, salvo que haya mediado el consentimiento expreso, por escrito o por un medio de autenticación similar, de los individuos a que haga referencia la información.',
  '³No se requerirá el consentimiento de los individuos para proporcionar los datos personales en los siguientes casos: III. Cuando se transmitan entre sujetos obligados o entre dependencias y entidades, siempre y cuando los datos se utilicen para el ejercicio de facultades propias de los mismos.'
];

// ── Estilos ───────────────────────────────────────────────────

const styles: any = {
  header: { fontSize: 7, color: '#333' },
  logoLeft: { fontSize: 8, bold: true, color: '#CC0000' },
  logoRight: { fontSize: 9, bold: true, color: '#FF6600' },
  title: { fontSize: 13, bold: true, alignment: 'center' },
  sectionHeader: { fontSize: 10, bold: true, margin: [0, 6, 0, 3] },
  fieldLabel: { fontSize: 7.5, bold: true, fillColor: GRAY, margin: [2, 2, 2, 2] },
  fieldLabelSm: { fontSize: 6.5, bold: true, fillColor: GRAY, margin: [2, 2, 2, 2] },
  fieldValue: { fontSize: 7.5, margin: [2, 2, 2, 2] },
  privacidadText: { fontSize: 5.5, margin: [3, 3, 3, 3] },
  footNote: { fontSize: 5.5, margin: [0, 1, 0, 1] },
  nota: { fontSize: 6.5, bold: false, italics: false, margin: [0, 4, 0, 2] },
  confHeader: { fontSize: 9, bold: true, margin: [0, 6, 0, 4] },
  declaracion: { fontSize: 7, margin: [0, 6, 0, 2] }
};

// ── Componentes compartidos ────────────────────────────────────

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
    margin: [0, 0, 0, 6]
  };
}

function makeDivider(): any {
  return { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#000' }], margin: [0, 0, 0, 4] };
}

// ── Template principal ────────────────────────────────────────

export function fichaRegistroTemplate(data: Partial<FichaRegistroData>): any {
  const d = data as FichaRegistroData;

  // Consentimiento RENAP con marcador visual
  const consYes = d.consentimientoRenap === 'Sí' ? 'X' : '   ';
  const consNo  = d.consentimientoRenap === 'No'  ? 'X' : '   ';
  const PRIVACIDAD_CONSENTIMIENTO = PRIVACIDAD_CONSENTIMIENTO_PREFIX
    .replace('SI (   )', `SI ( ${consYes} )`)
    .replace('NO (   )', `NO ( ${consNo} )`);

  // Imagen de firma si existe
  const firmaContent: any = d.firma && d.firma.startsWith('data:')
    ? { image: d.firma, width: 120, height: 50, margin: [0, 2, 0, 2] }
    : { canvas: [{ type: 'rect', x: 0, y: 0, w: 130, h: 55, lineWidth: 0.5, lineColor: '#999' }], margin: [0, 2, 0, 2] };

  return {
    pageSize: 'LETTER',
    pageMargins: [40, 50, 40, 60],
    defaultStyle: { fontSize: 8, font: 'Roboto' },
    styles,

    content: [
      // ── PÁGINA 1 ──────────────────────────────────────────
      makeHeader(),
      makeDivider(),
      { text: 'Ficha de Registro del Candidato', style: 'title', margin: [0, 4, 0, 4] },
      makeDivider(),

      // Estándar + Fecha
      {
        table: {
          widths: [90, '*', 40, 100],
          body: [[
            { text: 'Estándar de\nCompetencia:', style: 'fieldLabel', alignment: 'right' },
            { text: `${val(d.estandarCodigo)}.- ${val(d.estandarCompetencia)}`, style: 'fieldValue', italics: true, bold: true },
            { text: 'Fecha:', style: 'fieldLabel', alignment: 'center' },
            { text: val(d.fechaRegistro), style: 'fieldValue' }
          ]]
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#AAAAAA',
          vLineColor: () => '#AAAAAA'
        },
        margin: [0, 4, 0, 6]
      },

      { text: 'Datos Personales:', style: 'sectionHeader' },

      // Texto de privacidad (bloque)
      {
        table: {
          widths: ['*'],
          body: [[{ text: PRIVACIDAD_INTRO, style: 'privacidadText' }]]
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#AAAAAA',
          vLineColor: () => '#AAAAAA'
        },
        margin: [0, 0, 0, 4]
      },

      // Tabla con dos columnas: consentimiento (izq) + datos (der)
      {
        table: {
          widths: [150, '*'],
          body: [
            // ── Consentimiento RENAP (izq) + Datos personales (der) ──
            [
              {
                rowSpan: 8,
                stack: [
                  { text: PRIVACIDAD_CONSENTIMIENTO, style: 'privacidadText' },
                  { text: '\n\n\n\nNombre y Firma', fontSize: 6.5, margin: [0, 20, 0, 2] },
                  {
                    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 140, y2: 0, lineWidth: 0.5, lineColor: '#000' }]
                  }
                ],
                margin: [3, 3, 3, 3]
              },
              {
                table: {
                  widths: [75, '*'],
                  body: [
                    [
                      { text: 'Nombre Completo:', style: 'fieldLabel', alignment: 'right' },
                      { text: val(d.nombreCompleto), style: 'fieldValue' }
                    ],
                    [
                      { text: 'Lugar de Nacimiento:', style: 'fieldLabel', alignment: 'right' },
                      { text: val(d.lugarNacimiento), style: 'fieldValue' }
                    ],
                    [
                      { text: 'Nacionalidad:', style: 'fieldLabel', alignment: 'right' },
                      { text: val(d.nacionalidad) || 'Mexicana', style: 'fieldValue' }
                    ],
                    [
                      { text: 'CURP:', style: 'fieldLabel', alignment: 'right' },
                      { text: val(d.curp).toUpperCase(), style: 'fieldValue' }
                    ]
                  ]
                },
                layout: {
                  hLineWidth: () => 0.5,
                  vLineWidth: () => 0.5,
                  hLineColor: () => '#AAAAAA',
                  vLineColor: () => '#AAAAAA'
                }
              }
            ],
            // Género + Fecha Nacimiento
            [
              {},
              {
                table: {
                  widths: [40, 30, 30, 70, '*'],
                  body: [[
                    { text: 'Género:', style: 'fieldLabel', alignment: 'right' },
                    { text: `${radio(val(d.genero), 'Hombre')} Hombre`, style: 'fieldValue', fontSize: 7 },
                    { text: `${radio(val(d.genero), 'Mujer')} Mujer`, style: 'fieldValue', fontSize: 7 },
                    { text: 'Fecha de Nacimiento:', style: 'fieldLabel', alignment: 'right' },
                    { text: val(d.fechaNacimiento), style: 'fieldValue' }
                  ]]
                },
                layout: {
                  hLineWidth: () => 0.5,
                  vLineWidth: () => 0.5,
                  hLineColor: () => '#AAAAAA',
                  vLineColor: () => '#AAAAAA'
                }
              }
            ],
            // Domicilio header
            [
              {},
              { text: 'Domicilio Particular', style: 'fieldLabel', alignment: 'center', margin: [2, 2, 2, 2] }
            ],
            // Calle, Número, C.P, Colonia (headers)
            [
              {},
              {
                table: {
                  widths: ['*', 35, 30, '*'],
                  body: [
                    [
                      { text: 'Calle', style: 'fieldLabel', alignment: 'center' },
                      { text: 'Número', style: 'fieldLabel', alignment: 'center' },
                      { text: 'C.P', style: 'fieldLabel', alignment: 'center' },
                      { text: 'Colonia', style: 'fieldLabel', alignment: 'center' }
                    ],
                    [
                      { text: val(d.calle), style: 'fieldValue' },
                      { text: val(d.numero), style: 'fieldValue', alignment: 'center' },
                      { text: val(d.cp), style: 'fieldValue', alignment: 'center' },
                      { text: val(d.colonia), style: 'fieldValue' }
                    ]
                  ]
                },
                layout: {
                  hLineWidth: () => 0.5,
                  vLineWidth: () => 0.5,
                  hLineColor: () => '#AAAAAA',
                  vLineColor: () => '#AAAAAA'
                }
              }
            ],
            // Ciudad + Entidad
            [
              {},
              {
                table: {
                  widths: ['*', '*'],
                  body: [
                    [
                      { text: 'Ciudad', style: 'fieldLabel', alignment: 'center' },
                      { text: 'Entidad Federativa', style: 'fieldLabel', alignment: 'center' }
                    ],
                    [
                      { text: val(d.ciudad), style: 'fieldValue' },
                      { text: val(d.entidadFederativa), style: 'fieldValue' }
                    ]
                  ]
                },
                layout: {
                  hLineWidth: () => 0.5,
                  vLineWidth: () => 0.5,
                  hLineColor: () => '#AAAAAA',
                  vLineColor: () => '#AAAAAA'
                }
              }
            ],
            // Contacto headers
            [
              {},
              {
                table: {
                  widths: ['*', '*', '*'],
                  body: [
                    [
                      { text: 'E-mail', style: 'fieldLabel', alignment: 'center' },
                      { text: 'Teléfono', style: 'fieldLabel', alignment: 'center' },
                      { text: 'Teléfono Celular', style: 'fieldLabel', alignment: 'center' }
                    ],
                    [
                      { text: val(d.email), style: 'fieldValue' },
                      { text: val(d.telefono), style: 'fieldValue', alignment: 'center' },
                      { text: val(d.telefonoCelular), style: 'fieldValue', alignment: 'center' }
                    ]
                  ]
                },
                layout: {
                  hLineWidth: () => 0.5,
                  vLineWidth: () => 0.5,
                  hLineColor: () => '#AAAAAA',
                  vLineColor: () => '#AAAAAA'
                }
              }
            ],
            // Placeholder rows for rowSpan
            [{}, {}],
            [{}, {}]
          ]
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#AAAAAA',
          vLineColor: () => '#AAAAAA'
        },
        margin: [0, 0, 0, 6]
      },

      // ── PÁGINA 2 ─────────────────────────────────────────
      { text: '', pageBreak: 'before' },
      makeHeader(),
      makeDivider(),
      { text: 'Ficha de Registro del Candidato', style: 'title', margin: [0, 4, 0, 4] },
      makeDivider(),

      // Texto pie privacidad
      {
        table: {
          widths: ['*'],
          body: [[{ text: PRIVACIDAD_PIE, style: 'privacidadText' }]]
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#AAAAAA',
          vLineColor: () => '#AAAAAA'
        },
        margin: [0, 0, 0, 4]
      },

      { text: 'Nota: Esta información se debe mantener en una sola hoja, la firma del candidato debe ser autógrafa y se entrega en original al CONOCER', style: 'nota', italics: false },

      { text: 'Información Confidencial:', style: 'confHeader' },
      { text: 'Marca con una "x" en el recuadro de la respuesta elegida.', fontSize: 7, margin: [0, 0, 0, 4] },

      // Tabla de información confidencial
      {
        table: {
          widths: [90, 12, 30, 12, 30, 95, 12, 30, 12, 30, 45, '*'],
          body: [
            // Fila 1: Sabe leer / Cuenta estudios
            [
              { text: '¿Sabe Leer y Escribir?', style: 'fieldLabel', alignment: 'center' },
              { text: 'Sí', style: 'fieldLabelSm', alignment: 'center' },
              { text: ch(d.sabeLeerEscribir === 'Sí'), style: 'fieldValue', alignment: 'center', border: [true, true, true, true] },
              { text: 'No', style: 'fieldLabelSm', alignment: 'center' },
              { text: ch(d.sabeLeerEscribir === 'No'), style: 'fieldValue', alignment: 'center', border: [true, true, true, true] },
              { text: '¿Cuenta con Estudios?', style: 'fieldLabel', alignment: 'center', colSpan: 1 },
              { text: 'Sí', style: 'fieldLabelSm', alignment: 'center' },
              { text: ch(d.cuentaEstudios === 'Sí'), style: 'fieldValue', alignment: 'center', border: [true, true, true, true] },
              { text: 'No', style: 'fieldLabelSm', alignment: 'center' },
              { text: ch(d.cuentaEstudios === 'No'), style: 'fieldValue', alignment: 'center', border: [true, true, true, true] },
              { text: 'Cuales:', style: 'fieldLabel' },
              { text: val(d.cualesEstudios), style: 'fieldValue' }
            ]
          ]
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#AAAAAA',
          vLineColor: () => '#AAAAAA'
        },
        margin: [0, 0, 0, 3]
      },

      // Tabla discapacidad
      {
        table: {
          widths: [110, 12, 30, 12, 30],
          body: [
            [
              { text: '¿Tiene algún tipo de\nDiscapacidad?', style: 'fieldLabel', alignment: 'center' },
              { text: 'Sí', style: 'fieldLabelSm', alignment: 'center' },
              { text: ch(d.tieneDiscapacidad === 'Sí'), style: 'fieldValue', alignment: 'center', border: [true, true, true, true] },
              { text: 'No', style: 'fieldLabelSm', alignment: 'center' },
              { text: ch(d.tieneDiscapacidad === 'No'), style: 'fieldValue', alignment: 'center', border: [true, true, true, true] }
            ]
          ]
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#AAAAAA',
          vLineColor: () => '#AAAAAA'
        },
        margin: [0, 0, 0, 3]
      },

      // Tipo discapacidad
      {
        table: {
          widths: [35, 40, 35, 40, 40, 40, 45, 40, 45, 40, 30, 30],
          body: [[
            { text: 'Cual:', style: 'fieldLabel' },
            { text: 'Motriz', style: 'fieldLabelSm', alignment: 'center' },
            { text: ch(!!d.discapacidadMotriz), style: 'fieldValue', alignment: 'center', border: [true, true, true, true] },
            { text: 'Visual', style: 'fieldLabelSm', alignment: 'center' },
            { text: ch(!!d.discapacidadVisual), style: 'fieldValue', alignment: 'center', border: [true, true, true, true] },
            { text: 'Auditiva', style: 'fieldLabelSm', alignment: 'center' },
            { text: ch(!!d.discapacidadAuditiva), style: 'fieldValue', alignment: 'center', border: [true, true, true, true] },
            { text: 'Lenguaje', style: 'fieldLabelSm', alignment: 'center' },
            { text: ch(!!d.discapacidadLenguaje), style: 'fieldValue', alignment: 'center', border: [true, true, true, true] },
            { text: 'Intelectual', style: 'fieldLabelSm', alignment: 'center' },
            { text: ch(!!d.discapacidadIntelectual), style: 'fieldValue', alignment: 'center', border: [true, true, true, true] },
            { text: 'Otras', style: 'fieldLabelSm', alignment: 'center' },
            { text: ch(!!d.discapacidadOtras), style: 'fieldValue', alignment: 'center', border: [true, true, true, true] }
          ]]
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#AAAAAA',
          vLineColor: () => '#AAAAAA'
        },
        margin: [0, 0, 0, 3]
      },

      { text: 'En caso de contar con alguna o algunas discapacidades márcalas con una "x", en el recuadro correspondiente.', fontSize: 6, margin: [0, 0, 0, 3] },

      // Idiomas
      {
        table: {
          widths: [110, '*'],
          body: [[
            { text: '¿Qué Idioma(s) o lengua(s)\nhabla?', style: 'fieldLabel' },
            { text: val(d.idiomas) || 'Español', style: 'fieldValue' }
          ]]
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#AAAAAA',
          vLineColor: () => '#AAAAAA'
        },
        margin: [0, 0, 0, 3]
      },

      // Trabaja
      {
        table: {
          widths: [90, 12, 30, 12, 30, 90, '*'],
          body: [[
            { text: '¿Trabaja Actualmente?', style: 'fieldLabel' },
            { text: 'Sí', style: 'fieldLabelSm', alignment: 'center' },
            { text: ch(d.trabajaActualmente === 'Sí'), style: 'fieldValue', alignment: 'center', border: [true, true, true, true] },
            { text: 'No', style: 'fieldLabelSm', alignment: 'center' },
            { text: ch(d.trabajaActualmente === 'No'), style: 'fieldValue', alignment: 'center', border: [true, true, true, true] },
            { text: 'Puesto de Trabajo:', style: 'fieldLabel' },
            { text: val(d.puestoTrabajo), style: 'fieldValue' }
          ]]
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#AAAAAA',
          vLineColor: () => '#AAAAAA'
        },
        margin: [0, 0, 0, 3]
      },

      // Experiencia + Observaciones + Certificación
      {
        table: {
          widths: [110, '*'],
          body: [
            [
              { text: 'Experiencia\nLaboral:', style: 'fieldLabel' },
              { text: val(d.experienciaLaboral), style: 'fieldValue', minHeight: 30 }
            ],
            [
              { text: 'Observaciones:', style: 'fieldLabel' },
              { text: val(d.observaciones), style: 'fieldValue', minHeight: 20 }
            ]
          ]
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#AAAAAA',
          vLineColor: () => '#AAAAAA'
        },
        margin: [0, 0, 0, 3]
      },

      // Certificación
      {
        table: {
          widths: [130, 12, 30, 12, 30, 50, '*'],
          body: [[
            { text: '¿Cuenta con alguna Certificación?', style: 'fieldLabel' },
            { text: 'Sí', style: 'fieldLabelSm', alignment: 'center' },
            { text: ch(d.cuentaCertificacion === 'Sí'), style: 'fieldValue', alignment: 'center', border: [true, true, true, true] },
            { text: 'No', style: 'fieldLabelSm', alignment: 'center' },
            { text: ch(d.cuentaCertificacion === 'No'), style: 'fieldValue', alignment: 'center', border: [true, true, true, true] },
            { text: 'Cuales:', style: 'fieldLabel' },
            { text: val(d.cualesCertificaciones), style: 'fieldValue' }
          ]]
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#AAAAAA',
          vLineColor: () => '#AAAAAA'
        },
        margin: [0, 0, 0, 10]
      },

      // Declaración + Firma
      { text: 'DECLARO BAJO PROTESTA DE DECIR VERDAD QUE LOS DATOS ASENTADOS EN ESTE DOCUMENTO SON CORRECTOS Y VERDADEROS.', style: 'declaracion', decoration: 'underline', bold: true, fontSize: 7 },
      { text: 'Atentamente', fontSize: 7, margin: [0, 2, 0, 6] },

      // Firma
      {
        columns: [
          {
            stack: [
              firmaContent,
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 180, y2: 0, lineWidth: 0.5, lineColor: '#000' }] },
              { text: `( ${val(d.nombreCompleto)} )`, fontSize: 7, margin: [0, 2, 0, 0] },
              { text: '( Nombre y firma del Candidato)', fontSize: 6.5, italics: false },
              { text: 'Nota: Esta información se debe mantener en el portafolio de evidencias del candidato', bold: true, fontSize: 6, margin: [0, 4, 0, 0] }
            ],
            width: 250
          }
        ]
      },

      // Notas al pie
      { text: '\n', margin: [0, 10, 0, 0] },
      ...FOOTNOTES.map(fn => ({ text: fn, style: 'footNote' }))
    ]
  };
}
