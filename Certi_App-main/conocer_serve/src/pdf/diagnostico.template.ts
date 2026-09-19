// ============================================================
// pdf/diagnostico.template.ts (backend Node.js)
// Reproduce el formato del documento "Evaluación Diagnóstica" (ej. EC1268):
// encabezado con logos, candidato/lugar/fecha, reactivos con la respuesta
// del candidato, resultado, decisión del candidato y firmas (con nombre y
// rol debajo de cada una).
// ============================================================

import * as fs from 'fs';
import * as path from 'path';

const GRAY = '#CCCCCC';

// Mismos logos que ya usa la Ficha de Registro — así todos los PDF del
// sistema comparten membrete.
const ASSETS_DIR = path.join(__dirname, 'assets');
const LOGO_LEFT_PATH = path.join(ASSETS_DIR, 'logo-redconocer.png');
const LOGO_RIGHT_PATH = path.join(ASSETS_DIR, 'logo-unipoli.png');

const styles: Record<string, any> = {
  title: { fontSize: 14, bold: true, alignment: 'center', margin: [0, 0, 0, 10] },
  estandar: { fontSize: 10, bold: true, margin: [0, 0, 0, 10] },
  fieldLabel: { fontSize: 9, bold: true },
  instrucciones: { fontSize: 9, italics: true, margin: [0, 0, 0, 8] },
  reactivoTerm: { fontSize: 8.5, margin: [0, 2, 0, 0] },
  reactivoDef: { fontSize: 8.5, margin: [0, 1, 0, 6] },
  reactivoOk: { fontSize: 8, bold: true, color: '#047857', margin: [0, 0, 0, 6] },
  reactivoBad: { fontSize: 8, bold: true, color: '#b91c1c', margin: [0, 0, 0, 6] },
  sectionHeader: { fontSize: 10, bold: true, margin: [0, 12, 0, 4] },
  resultadoText: { fontSize: 9, margin: [0, 1, 0, 1] },
  firmaNombre: { fontSize: 8, bold: true, alignment: 'center', margin: [0, 3, 0, 0] },
  firmaRol: { fontSize: 7, alignment: 'center', color: '#666' },
};

/** Devuelve la imagen del logo si existe en disco; si no, reserva el espacio en blanco. */
function logoSpace(imagePath: string, width: number, height: number): any {
  if (fs.existsSync(imagePath)) return { image: imagePath, width, height };
  return { canvas: [{ type: 'rect', x: 0, y: 0, w: width, h: height, lineWidth: 0 }] };
}

function makeHeader(): any {
  return {
    columns: [
      { stack: [logoSpace(LOGO_LEFT_PATH, 58, 34)], width: 'auto' },
      { text: '', width: '*' },
      { stack: [logoSpace(LOGO_RIGHT_PATH, 75, 24)], width: 'auto', alignment: 'right' },
    ],
    columnGap: 8,
    margin: [0, 0, 0, 6],
  };
}

interface DiagnosticQuestion {
  id: string;
  type: 'opcion_multiple' | 'abierta' | 'unir_reactivos';
  prompt: string;
  options: Array<{ id: string; text?: string; left?: string; right?: string }>;
  order_index: number;
  points: number;
}

interface DiagnosticAnswer {
  question_id: string;
  selected_option_id?: string;
  text?: string;
  matches?: { right_id: string; selected_left_id: string }[];
  correct?: boolean | null;
}

function makeSignature(dataUrl: string | undefined | null, width: number, height: number): any {
  return dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:')
    ? { image: dataUrl, width, height, margin: [0, 1, 0, 1] }
    : { canvas: [{ type: 'rect', x: 0, y: 0, w: width, h: height, lineWidth: 0.5, lineColor: '#999' }], margin: [0, 1, 0, 1] };
}

function renderUnirReactivos(q: DiagnosticQuestion, answer: DiagnosticAnswer | undefined): any[] {
  const options = q.options ?? [];
  const orderById = new Map(options.map((o, i) => [o.id, i + 1]));
  const matchByRight = new Map((answer?.matches ?? []).map((m) => [m.right_id, m.selected_left_id]));

  const content: any[] = [{ text: q.prompt, style: 'instrucciones' }];

  // Columna de términos numerados (orden original).
  content.push({
    text: options.map((o, i) => `${i + 1}.- ${o.left ?? ''}`).join('\n'),
    style: 'reactivoTerm',
    margin: [0, 0, 0, 6],
  });

  // Definiciones con la respuesta del candidato entre paréntesis.
  for (const o of options) {
    const selected = matchByRight.get(o.id);
    const num = selected ? (orderById.get(selected) ?? '') : '';
    content.push({ text: `(  ${num}  )  ${o.right ?? ''}`, style: 'reactivoDef' });
  }
  return content;
}

function renderOpcionMultiple(q: DiagnosticQuestion, answer: DiagnosticAnswer | undefined): any[] {
  const options = q.options ?? [];
  return [
    { text: q.prompt, style: 'fieldLabel', margin: [0, 4, 0, 2] },
    ...options.map((o) => ({
      text: `${answer?.selected_option_id === o.id ? '(X)' : '(  )'} ${o.text ?? ''}`,
      style: 'reactivoDef',
    })),
  ];
}

function renderAbierta(q: DiagnosticQuestion, answer: DiagnosticAnswer | undefined, graded: boolean | undefined): any[] {
  const content: any[] = [
    { text: q.prompt, style: 'fieldLabel', margin: [0, 4, 0, 2] },
    { text: answer?.text || '(sin respuesta)', style: 'reactivoDef' },
  ];
  if (graded !== undefined) {
    content.push({ text: graded ? '✓ Correcta' : '✗ Incorrecta', style: graded ? 'reactivoOk' : 'reactivoBad' });
  }
  return content;
}

export function diagnosticoTemplate(data: Record<string, any>): any {
  const d = data as {
    estandarCodigo: string;
    estandarNombre: string;
    nombreCandidato: string;
    evaluatorName?: string;
    lugar?: string;
    fechaAplicacion?: string;
    modality: 'presencial' | 'en_linea';
    questions: DiagnosticQuestion[];
    answers: DiagnosticAnswer[];
    calificacion?: number;
    abiertaGrades?: { question_id: string; correct: boolean }[];
    result?: string;
    observations?: string;
    decision?: 'participar' | 'curso_taller';
    candidateSignature?: string | null;
    evaluatorSignature?: string | null;
    photoUrl?: string | null;
  };

  const answerByQuestion = new Map((d.answers ?? []).map((a) => [a.question_id, a]));
  const sortedQuestions = [...(d.questions ?? [])].sort((a, b) => a.order_index - b.order_index);

  const body: any[] = [
    makeHeader(),
    { text: 'Evaluación Diagnóstica', style: 'title' },
    { text: `${d.estandarCodigo ?? ''}.- ${d.estandarNombre ?? ''}`, style: 'estandar' },

    {
      columns: [
        { text: [{ text: 'Nombre del candidato: ', style: 'fieldLabel' }, d.nombreCandidato ?? ''] },
      ],
      margin: [0, 0, 0, 4],
    },
    {
      columns: [
        { text: [{ text: 'Lugar: ', style: 'fieldLabel' }, d.lugar ?? ''], width: '60%' },
        { text: [{ text: 'Fecha de aplicación: ', style: 'fieldLabel' }, d.fechaAplicacion ?? ''], width: '40%' },
      ],
      margin: [0, 0, 0, 10],
    },
  ];

  if (d.modality === 'presencial') {
    body.push({ text: 'Modalidad: Presencial (examen físico escaneado)', style: 'fieldLabel', margin: [0, 0, 0, 6] });
    if (d.photoUrl) {
      body.push({ image: d.photoUrl, width: 480, margin: [0, 0, 0, 10] });
    } else {
      body.push({ text: '(No se adjuntó fotografía del examen)', style: 'instrucciones' });
    }
  } else {
    const gradeByQuestion = new Map((d.abiertaGrades ?? []).map((g) => [g.question_id, g.correct]));
    body.push({ text: 'Modalidad: En línea', style: 'fieldLabel', margin: [0, 0, 0, 6] });
    for (const q of sortedQuestions) {
      const answer = answerByQuestion.get(q.id);
      if (q.type === 'unir_reactivos') body.push(...renderUnirReactivos(q, answer));
      else if (q.type === 'opcion_multiple') body.push(...renderOpcionMultiple(q, answer));
      else body.push(...renderAbierta(q, answer, gradeByQuestion.get(q.id)));
    }
    if (d.calificacion !== undefined && d.calificacion !== null) {
      body.push({
        text: `Calificación: ${d.calificacion} / 10`,
        style: 'sectionHeader',
        margin: [0, 6, 0, 0],
      });
    }
  }

  body.push(
    { text: 'Resultado', style: 'sectionHeader' },
    { text: d.result || '(pendiente)', style: 'resultadoText' },
    { text: 'Observaciones', style: 'sectionHeader' },
    { text: d.observations || '—', style: 'resultadoText' },

    { text: 'Decisión del Candidato', style: 'sectionHeader' },
    { text: `${d.decision === 'participar' ? '(X)' : '(  )'} Solicito participar en el proceso de evaluación`, style: 'resultadoText' },
    { text: `${d.decision === 'curso_taller' ? '(X)' : '(  )'} Solicito tomar un curso-taller`, style: 'resultadoText' },

    {
      columns: [
        {
          stack: [
            makeSignature(d.evaluatorSignature, 140, 45),
            { text: d.evaluatorName || '________________________', style: 'firmaNombre' },
            { text: 'Evaluador', style: 'firmaRol' },
          ],
          width: '50%',
        },
        {
          stack: [
            makeSignature(d.candidateSignature, 140, 45),
            { text: d.nombreCandidato || '________________________', style: 'firmaNombre' },
            { text: 'Candidato', style: 'firmaRol' },
          ],
          width: '50%',
        },
      ],
      margin: [0, 20, 0, 0],
    },
  );

  return {
    pageSize: 'LETTER',
    pageMargins: [40, 30, 40, 30],
    defaultStyle: { fontSize: 9, font: 'Roboto' },
    styles,
    content: body,
  };
}
