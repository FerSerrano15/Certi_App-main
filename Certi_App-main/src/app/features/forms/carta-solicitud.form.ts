// ============================================================
// features/forms/carta-solicitud.form.ts
// Campos del formulario: Carta de Solicitud de Interés
// ============================================================

import { FormField } from '../../core/models/form-field.model';

export const CARTA_SOLICITUD_FORM: FormField[] = [
  {
    id: 'fecha',
    type: 'date',
    label: 'Fecha',
    controlName: 'fecha',
    required: true,
    group: 'encabezado'
  },
  {
    id: 'estandarCodigo',
    type: 'text',
    label: 'Código del Estándar de Competencia',
    controlName: 'estandarCodigo',
    placeholder: 'Ej. EC1268',
    required: true,
    group: 'estandar'
  },
  {
    id: 'estandarNombre',
    type: 'text',
    label: 'Nombre del Estándar de Competencia',
    controlName: 'estandarNombre',
    placeholder: 'Ej. Atención al usuario basada en la cultura del buen trato',
    required: true,
    group: 'estandar'
  },
  {
    id: 'nombreCompleto',
    type: 'text',
    label: 'Nombre Completo (como aparecerá en la carta)',
    controlName: 'nombreCompleto',
    placeholder: 'Nombre(s) y apellidos completos',
    required: true,
    group: 'firma'
  },
  {
    id: 'firma',
    type: 'signature',
    label: 'Firma',
    controlName: 'firma',
    required: true,
    group: 'firma'
  }
];
