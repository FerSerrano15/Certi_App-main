// ============================================================
// pdf/ficha-registro.template.ts  (backend Node.js)
// Copia del template frontend, sin imports de Angular.
// pdfmake en Node.js es sincrónico y robusto.
// ============================================================

import * as fs from 'fs';
import * as path from 'path';

// ── Logos del encabezado ────────────────────────────────────────
// Coloca aquí los archivos de imagen para que aparezcan en el PDF:
//   conocer_serve/src/pdf/assets/logo-redconocer.png  (logo izquierdo)
//   conocer_serve/src/pdf/assets/logo-unipoli.png     (logo derecho)
// Mientras no existan los archivos, se reserva el espacio en blanco
// con el mismo tamaño para no romper el layout.
const ASSETS_DIR = path.join(__dirname, 'assets');
const LOGO_LEFT_PATH = path.join(ASSETS_DIR, 'logo-redconocer.png');
const LOGO_RIGHT_PATH = path.join(ASSETS_DIR, 'logo-unipoli.png');

// ── Helpers ──────────────────────────────────────────────────

// Nota: se evitan glíficos Unicode (☑☐●○) porque la fuente Roboto embebida
// en pdfmake no los incluye — al faltar el glifo, pdfmake calcula mal el
// ancho del carácter y la fila se estira a decenas de líneas fantasma.
const ch = (val: boolean): string => val ? 'X' : '';
const radio = (current: string, target: string): string => current === target ? '(X)' : '(  )';
const safeVal = (v: string | undefined | null): string => v || '';
const GRAY = '#CCCCCC';

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

const styles: Record<string, any> = {
  header: { fontSize: 7, color: '#333' },
  title: { fontSize: 12, bold: true, alignment: 'center' },
  sectionHeader: { fontSize: 9, bold: true, margin: [0, 3, 0, 2] },
  fieldLabel: { fontSize: 7, bold: true, fillColor: GRAY, margin: [2, 0.5, 2, 0.5] },
  fieldLabelSm: { fontSize: 6, bold: true, fillColor: GRAY, margin: [2, 0.5, 2, 0.5] },
  fieldValue: { fontSize: 7, margin: [2, 0.5, 2, 0.5] },
  privacidadText: { fontSize: 5, margin: [3, 1, 3, 1] },
  footNote: { fontSize: 4.5, margin: [0, 0, 0, 0.5] },
  nota: { fontSize: 6, margin: [0, 2, 0, 1] },
  confHeader: { fontSize: 8.5, bold: true, margin: [0, 3, 0, 2] },
  declaracion: { fontSize: 6.5, margin: [0, 3, 0, 1] },
};

// ── Líneas de tabla ───────────────────────────────────────────

const thinLines = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => '#AAAAAA',
  vLineColor: () => '#AAAAAA',
};

// ── Componentes compartidos ───────────────────────────────────

/**
 * Devuelve la imagen del logo si el archivo existe en disco; si no,
 * reserva un espacio en blanco del mismo tamaño para que el layout
 * no se mueva cuando el logo se agregue más tarde.
 */
function logoSpace(imagePath: string, width: number, height: number): any {
  if (fs.existsSync(imagePath)) {
    return { image: imagePath, width, height };
  }
  return { canvas: [{ type: 'rect', x: 0, y: 0, w: width, h: height, lineWidth: 0 }] };
}

function makeHeader(): any {
  return {
    columns: [
      { stack: [logoSpace(LOGO_LEFT_PATH, 58, 34)], width: 'auto' },
      { text: '', width: '*' },
      { stack: [logoSpace(LOGO_RIGHT_PATH, 75, 24)], width: 'auto', alignment: 'right' }
    ],
    columnGap: 8,
    margin: [0, 0, 0, 2]
  };
}

const CONTENT_WIDTH = 756; // ancho útil en horizontal (LETTER landscape 792pt - márgenes 18+18)

function makeDivider(): any {
  return { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 1, lineColor: '#000' }], margin: [0, 0, 0, 2] };
}

// ── Función principal ─────────────────────────────────────────

export function fichaRegistroTemplate(data: Record<string, any>): any {
  const d = data as any;

  const consYes = d.consentimientoRenap === 'Sí' ? 'X' : '   ';
  const consNo  = d.consentimientoRenap === 'No'  ? 'X' : '   ';
  const PRIVACIDAD_CONSENTIMIENTO = PRIVACIDAD_CONSENTIMIENTO_PREFIX
    .replace('SI (   )', `SI ( ${consYes} )`)
    .replace('NO (   )', `NO ( ${consNo} )`);

  // En Node.js, la imagen base64 se soporta directamente.
  // IMPORTANTE: pdfmake no admite reusar el mismo objeto de nodo dos veces
  // en el árbol de contenido (muta estado de layout sobre el propio objeto),
  // así que la firma se usa dos veces en el documento y cada uso necesita
  // su propia instancia — por eso es una función, no una constante.
  const makeFirmaContent = (width: number, height: number): any =>
    d.firma && typeof d.firma === 'string' && d.firma.startsWith('data:')
      ? { image: d.firma, width, height, margin: [0, 1, 0, 1] }
      : { canvas: [{ type: 'rect', x: 0, y: 0, w: width, h: height, lineWidth: 0.5, lineColor: '#999' }], margin: [0, 1, 0, 1] };

  return {
    pageSize: 'LETTER',
    pageOrientation: 'landscape',
    pageMargins: [18, 10, 18, 10],
    defaultStyle: { fontSize: 8, font: 'Roboto' },
    styles,

    content: [
      makeHeader(),
      makeDivider(),
      { text: 'Ficha de Registro del Candidato', style: 'title', margin: [0, 2, 0, 2] },
      makeDivider(),

      {
        table: {
          widths: [90, '*', 40, 100],
          body: [[
            { text: 'Estándar de\nCompetencia:', style: 'fieldLabel', alignment: 'right' },
            { text: `${safeVal(d.estandarCodigo)}.- ${safeVal(d.estandarCompetencia)}`, style: 'fieldValue', italics: true, bold: true },
            { text: 'Fecha:', style: 'fieldLabel', alignment: 'center' },
            { text: safeVal(d.fechaRegistro), style: 'fieldValue' }
          ]]
        },
        layout: thinLines,
        margin: [0, 3, 0, 3]
      },

      { text: 'Datos Personales:', style: 'sectionHeader' },

      {
        table: {
          widths: ['*'],
          body: [[{ text: PRIVACIDAD_INTRO, style: 'privacidadText' }]]
        },
        layout: thinLines,
        margin: [0, 0, 0, 2]
      },

      {
        table: {
          widths: [210, '*'],
          body: [
            [
              {
                rowSpan: 5,
                stack: [
                  { text: PRIVACIDAD_CONSENTIMIENTO, fontSize: 5, margin: [3, 2, 3, 2] },
                  makeFirmaContent(110, 22),
                  { canvas: [{ type: 'line', x1: 3, y1: 0, x2: 195, y2: 0, lineWidth: 0.5, lineColor: '#000' }] },
                  { text: safeVal(d.nombreCompleto), fontSize: 5.5, bold: true, margin: [3, 1, 0, 0] },
                  { text: 'Nombre y Firma', fontSize: 4.5, margin: [3, 0, 0, 1] }
                ]
              },
              {
                table: {
                  widths: [90, '*'],
                  body: [
                    [{ text: 'Nombre Completo:', style: 'fieldLabel', alignment: 'right' }, { text: safeVal(d.nombreCompleto), style: 'fieldValue' }]
                  ]
                },
                layout: thinLines
              }
            ],
            [{}, {
              table: {
                widths: [85, '*', 55, '*', 30, '*'],
                body: [[
                  { text: 'Lugar de Nacimiento:', style: 'fieldLabel', alignment: 'right' },
                  { text: safeVal(d.lugarNacimiento), style: 'fieldValue' },
                  { text: 'Nacionalidad:', style: 'fieldLabel', alignment: 'right' },
                  { text: safeVal(d.nacionalidad) || 'Mexicana', style: 'fieldValue' },
                  { text: 'CURP:', style: 'fieldLabel', alignment: 'right' },
                  { text: safeVal(d.curp).toUpperCase(), style: 'fieldValue' }
                ]]
              },
              layout: thinLines
            }],
            [{}, {
              table: {
                widths: [40, 30, 30, 70, '*'],
                body: [[
                  { text: 'Género:', style: 'fieldLabel', alignment: 'right' },
                  { text: `${radio(safeVal(d.genero), 'Hombre')} Hombre`, style: 'fieldValue', fontSize: 7 },
                  { text: `${radio(safeVal(d.genero), 'Mujer')} Mujer`, style: 'fieldValue', fontSize: 7 },
                  { text: 'Fecha de Nacimiento:', style: 'fieldLabel', alignment: 'right' },
                  { text: safeVal(d.fechaNacimiento), style: 'fieldValue' }
                ]]
              },
              layout: thinLines
            }],
            [{}, {
              table: {
                widths: [55, '*', 35, 30, '*', '*', 65],
                body: [
                  [
                    { text: 'Domicilio:', style: 'fieldLabel', alignment: 'right' },
                    { text: 'Calle', style: 'fieldLabel', alignment: 'center' },
                    { text: 'Número', style: 'fieldLabel', alignment: 'center' },
                    { text: 'C.P', style: 'fieldLabel', alignment: 'center' },
                    { text: 'Colonia', style: 'fieldLabel', alignment: 'center' },
                    { text: 'Ciudad', style: 'fieldLabel', alignment: 'center' },
                    { text: 'Entidad Federativa', style: 'fieldLabel', alignment: 'center' }
                  ],
                  [
                    { text: '' },
                    { text: safeVal(d.calle), style: 'fieldValue' },
                    { text: safeVal(d.numero), style: 'fieldValue', alignment: 'center' },
                    { text: safeVal(d.cp), style: 'fieldValue', alignment: 'center' },
                    { text: safeVal(d.colonia), style: 'fieldValue' },
                    { text: safeVal(d.ciudad), style: 'fieldValue' },
                    { text: safeVal(d.entidadFederativa), style: 'fieldValue' }
                  ]
                ]
              },
              layout: thinLines
            }],
            [{}, {
              table: {
                widths: ['*', '*', '*'],
                body: [
                  [{ text: 'E-mail', style: 'fieldLabel', alignment: 'center' }, { text: 'Teléfono', style: 'fieldLabel', alignment: 'center' }, { text: 'Teléfono Celular', style: 'fieldLabel', alignment: 'center' }],
                  [{ text: safeVal(d.email), style: 'fieldValue' }, { text: safeVal(d.telefono), style: 'fieldValue', alignment: 'center' }, { text: safeVal(d.telefonoCelular), style: 'fieldValue', alignment: 'center' }]
                ]
              },
              layout: thinLines
            }]
          ]
        },
        layout: thinLines,
        margin: [0, 0, 0, 2]
      },

      {
        table: { widths: ['*'], body: [[{ text: PRIVACIDAD_PIE, style: 'privacidadText' }]] },
        layout: thinLines,
        margin: [0, 0, 0, 1]
      },

      { text: 'Nota: Esta información se debe mantener en una sola hoja, la firma del candidato debe ser autógrafa y se entrega en original al CONOCER', style: 'nota' },
      { text: 'Información Confidencial:', style: 'confHeader' },
      { text: 'Marca con una "x" en el recuadro de la respuesta elegida.', fontSize: 6.5, margin: [0, 0, 0, 2] },

      {
        table: {
          widths: [90, 12, 30, 12, 30, 95, 12, 30, 12, 30, 45, '*'],
          body: [[
            { text: '¿Sabe Leer y Escribir?', style: 'fieldLabel', alignment: 'center' },
            { text: 'Sí', style: 'fieldLabelSm', alignment: 'center' },
            { text: ch(d.sabeLeerEscribir === 'Sí'), style: 'fieldValue', alignment: 'center', border: [true, true, true, true] },
            { text: 'No', style: 'fieldLabelSm', alignment: 'center' },
            { text: ch(d.sabeLeerEscribir === 'No'), style: 'fieldValue', alignment: 'center', border: [true, true, true, true] },
            { text: '¿Cuenta con Estudios?', style: 'fieldLabel', alignment: 'center' },
            { text: 'Sí', style: 'fieldLabelSm', alignment: 'center' },
            { text: ch(d.cuentaEstudios === 'Sí'), style: 'fieldValue', alignment: 'center', border: [true, true, true, true] },
            { text: 'No', style: 'fieldLabelSm', alignment: 'center' },
            { text: ch(d.cuentaEstudios === 'No'), style: 'fieldValue', alignment: 'center', border: [true, true, true, true] },
            { text: 'Cuales:', style: 'fieldLabel' },
            { text: safeVal(d.cualesEstudios), style: 'fieldValue' }
          ]]
        },
        layout: thinLines,
        margin: [0, 0, 0, 2]
      },

      {
        table: {
          widths: [110, 12, 30, 12, 30],
          body: [[
            { text: '¿Tiene algún tipo de\nDiscapacidad?', style: 'fieldLabel', alignment: 'center' },
            { text: 'Sí', style: 'fieldLabelSm', alignment: 'center' },
            { text: ch(d.tieneDiscapacidad === 'Sí'), style: 'fieldValue', alignment: 'center', border: [true, true, true, true] },
            { text: 'No', style: 'fieldLabelSm', alignment: 'center' },
            { text: ch(d.tieneDiscapacidad === 'No'), style: 'fieldValue', alignment: 'center', border: [true, true, true, true] }
          ]]
        },
        layout: thinLines,
        margin: [0, 0, 0, 2]
      },

      {
        table: {
          widths: [35, 40, 35, 40, 40, 40, 45, 40, 45, 40, 30, 30, 30],
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
        layout: thinLines,
        margin: [0, 0, 0, 2]
      },

      { text: 'En caso de contar con alguna o algunas discapacidades márcalas con una "x", en el recuadro correspondiente.', fontSize: 5.5, margin: [0, 0, 0, 2] },

      {
        table: {
          widths: [110, '*'],
          body: [[{ text: '¿Qué Idioma(s) o lengua(s)\nhabla?', style: 'fieldLabel' }, { text: safeVal(d.idiomas) || 'Español', style: 'fieldValue' }]]
        },
        layout: thinLines,
        margin: [0, 0, 0, 2]
      },

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
            { text: safeVal(d.puestoTrabajo), style: 'fieldValue' }
          ]]
        },
        layout: thinLines,
        margin: [0, 0, 0, 2]
      },

      {
        table: {
          widths: [110, '*'],
          body: [
            [{ text: 'Experiencia\nLaboral:', style: 'fieldLabel' }, { text: safeVal(d.experienciaLaboral), style: 'fieldValue', minHeight: 10 }],
            [{ text: 'Observaciones:', style: 'fieldLabel' }, { text: safeVal(d.observaciones), style: 'fieldValue', minHeight: 8 }]
          ]
        },
        layout: thinLines,
        margin: [0, 0, 0, 2]
      },

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
            { text: safeVal(d.cualesCertificaciones), style: 'fieldValue' }
          ]]
        },
        layout: thinLines,
        margin: [0, 0, 0, 2]
      },

      { text: 'DECLARO BAJO PROTESTA DE DECIR VERDAD QUE LOS DATOS ASENTADOS EN ESTE DOCUMENTO SON CORRECTOS Y VERDADEROS.', style: 'declaracion', decoration: 'underline', bold: true, fontSize: 6.5, margin: [0, 1, 0, 1] },
      { text: 'Atentamente', fontSize: 6.5, margin: [0, 0, 0, 1] },

      {
        columns: [{
          stack: [
            makeFirmaContent(110, 22),
            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 180, y2: 0, lineWidth: 0.5, lineColor: '#000' }] },
            { text: `( ${safeVal(d.nombreCompleto)} )`, fontSize: 6.5, margin: [0, 1, 0, 0] },
            { text: '( Nombre y firma del Candidato)', fontSize: 6 },
            { text: 'Nota: Esta información se debe mantener en el portafolio de evidencias del candidato', bold: true, fontSize: 5, margin: [0, 1, 0, 0] }
          ],
          width: 250
        }]
      },

      ...FOOTNOTES.map(fn => ({ text: fn, style: 'footNote' }))
    ]
  };
}
