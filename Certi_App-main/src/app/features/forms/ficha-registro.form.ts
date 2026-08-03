// ============================================================
// features/forms/ficha-registro.form.ts
// Definición de campos del formulario: Ficha de Registro
// ============================================================

import { FormField } from '../../core/models/form-field.model';

export const ESTANDARES_CONOCER = [
  { value: 'EC0001', label: 'EC0001 — Impartición de cursos de formación del capital humano' },
  { value: 'EC0076', label: 'EC0076 — Evaluación de la competencia de candidatos' },
  { value: 'EC0217', label: 'EC0217 — Diseño e impartición de cursos de formación' },
  { value: 'EC0217-1', label: 'EC0217-1 — Diseño curricular de cursos de formación del capital humano' },
  { value: 'EC0301', label: 'EC0301 — Coordinación de grupos de mejora continua' },
  { value: 'EC1268', label: 'EC1268 — Atención al usuario basada en la cultura del buen trato' },
  { value: 'EC1393', label: 'EC1393 — Desarrollo de cursos de capacitación en línea' },
  { value: 'Otro', label: 'Otro (especificar)' },
];

export const ENTIDADES_FEDERATIVAS = [
  'Aguascalientes','Baja California','Baja California Sur','Campeche',
  'Chiapas','Chihuahua','Ciudad de México','Coahuila','Colima','Durango',
  'Estado de México','Guanajuato','Guerrero','Hidalgo','Jalisco',
  'Michoacán','Morelos','Nayarit','Nuevo León','Oaxaca','Puebla',
  'Querétaro','Quintana Roo','San Luis Potosí','Sinaloa','Sonora',
  'Tabasco','Tamaulipas','Tlaxcala','Veracruz','Yucatán','Zacatecas'
];

const SI_NO_OPTIONS = [
  { value: 'Sí', label: 'Sí' },
  { value: 'No', label: 'No' }
];

export const FICHA_REGISTRO_FORM: FormField[] = [
  // ── Estándar ──────────────────────────────────────────────
  {
    id: 'estandarCompetencia',
    type: 'text',
    label: 'Nombre del Estándar de Competencia',
    controlName: 'estandarCompetencia',
    placeholder: 'Ej. Atención al usuario basada en la cultura del buen trato',
    required: true,
    group: 'estandar'
  },
  {
    id: 'estandarCodigo',
    type: 'text',
    label: 'Código del Estándar',
    controlName: 'estandarCodigo',
    placeholder: 'Ej. EC1268',
    required: true,
    group: 'estandar'
  },
  {
    id: 'fechaRegistro',
    type: 'date',
    label: 'Fecha de Registro',
    controlName: 'fechaRegistro',
    required: true,
    group: 'estandar'
  },

  // ── Datos Personales ──────────────────────────────────────
  {
    id: 'nombreCompleto',
    type: 'text',
    label: 'Nombre Completo',
    controlName: 'nombreCompleto',
    placeholder: 'Nombre(s) y apellidos',
    required: true,
    group: 'personales'
  },
  {
    id: 'lugarNacimiento',
    type: 'text',
    label: 'Lugar de Nacimiento',
    controlName: 'lugarNacimiento',
    placeholder: 'Ciudad, Estado',
    required: true,
    group: 'personales'
  },
  {
    id: 'nacionalidad',
    type: 'text',
    label: 'Nacionalidad',
    controlName: 'nacionalidad',
    placeholder: 'Mexicana',
    value: 'Mexicana',
    required: true,
    group: 'personales'
  },
  {
    id: 'curp',
    type: 'text',
    label: 'CURP',
    controlName: 'curp',
    placeholder: 'XXXX000000XXXXXX00',
    required: true,
    group: 'personales'
  },
  {
    id: 'genero',
    type: 'radio',
    label: 'Género',
    controlName: 'genero',
    required: true,
    options: [
      { value: 'Hombre', label: 'Hombre' },
      { value: 'Mujer', label: 'Mujer' }
    ],
    group: 'personales'
  },
  {
    id: 'fechaNacimiento',
    type: 'date',
    label: 'Fecha de Nacimiento',
    controlName: 'fechaNacimiento',
    required: true,
    group: 'personales'
  },

  // ── Domicilio ─────────────────────────────────────────────
  {
    id: 'calle',
    type: 'text',
    label: 'Calle',
    controlName: 'calle',
    required: true,
    group: 'domicilio'
  },
  {
    id: 'numero',
    type: 'text',
    label: 'Número',
    controlName: 'numero',
    placeholder: 'Ext. / Int.',
    required: true,
    group: 'domicilio'
  },
  {
    id: 'cp',
    type: 'text',
    label: 'C.P.',
    controlName: 'cp',
    placeholder: '00000',
    required: true,
    group: 'domicilio'
  },
  {
    id: 'colonia',
    type: 'text',
    label: 'Colonia',
    controlName: 'colonia',
    required: true,
    group: 'domicilio'
  },
  {
    id: 'ciudad',
    type: 'text',
    label: 'Ciudad / Municipio',
    controlName: 'ciudad',
    required: true,
    group: 'domicilio'
  },
  {
    id: 'entidadFederativa',
    type: 'text',
    label: 'Entidad Federativa',
    controlName: 'entidadFederativa',
    required: true,
    group: 'domicilio'
  },

  // ── Contacto ──────────────────────────────────────────────
  {
    id: 'email',
    type: 'email',
    label: 'Correo Electrónico',
    controlName: 'email',
    required: true,
    group: 'contacto'
  },
  {
    id: 'telefono',
    type: 'phone',
    label: 'Teléfono',
    controlName: 'telefono',
    placeholder: '10 dígitos',
    required: true,
    group: 'contacto'
  },
  {
    id: 'telefonoCelular',
    type: 'phone',
    label: 'Teléfono Celular',
    controlName: 'telefonoCelular',
    placeholder: '10 dígitos',
    group: 'contacto'
  },

  // ── Consentimiento RENAP ──────────────────────────────────
  {
    id: 'consentimientoRenap',
    type: 'radio',
    label: 'Doy mi consentimiento al CONOCER para difundir mis datos en el RENAP',
    controlName: 'consentimientoRenap',
    required: true,
    options: SI_NO_OPTIONS,
    group: 'renap'
  },

  // ── Info Confidencial ─────────────────────────────────────
  {
    id: 'sabeLeerEscribir',
    type: 'radio',
    label: '¿Sabe Leer y Escribir?',
    controlName: 'sabeLeerEscribir',
    required: true,
    options: SI_NO_OPTIONS,
    group: 'confidencial'
  },
  {
    id: 'cuentaEstudios',
    type: 'radio',
    label: '¿Cuenta con Estudios?',
    controlName: 'cuentaEstudios',
    required: true,
    options: SI_NO_OPTIONS,
    group: 'confidencial'
  },
  {
    id: 'cualesEstudios',
    type: 'text',
    label: '¿Cuáles estudios?',
    controlName: 'cualesEstudios',
    placeholder: 'Nivel / Institución',
    group: 'confidencial'
  },
  {
    id: 'tieneDiscapacidad',
    type: 'radio',
    label: '¿Tiene algún tipo de Discapacidad?',
    controlName: 'tieneDiscapacidad',
    required: true,
    options: SI_NO_OPTIONS,
    group: 'confidencial'
  },
  {
    id: 'discapacidadMotriz',
    type: 'checkbox',
    label: 'Motriz',
    controlName: 'discapacidadMotriz',
    group: 'discapacidad'
  },
  {
    id: 'discapacidadVisual',
    type: 'checkbox',
    label: 'Visual',
    controlName: 'discapacidadVisual',
    group: 'discapacidad'
  },
  {
    id: 'discapacidadAuditiva',
    type: 'checkbox',
    label: 'Auditiva',
    controlName: 'discapacidadAuditiva',
    group: 'discapacidad'
  },
  {
    id: 'discapacidadLenguaje',
    type: 'checkbox',
    label: 'Lenguaje',
    controlName: 'discapacidadLenguaje',
    group: 'discapacidad'
  },
  {
    id: 'discapacidadIntelectual',
    type: 'checkbox',
    label: 'Intelectual',
    controlName: 'discapacidadIntelectual',
    group: 'discapacidad'
  },
  {
    id: 'discapacidadOtras',
    type: 'checkbox',
    label: 'Otras',
    controlName: 'discapacidadOtras',
    group: 'discapacidad'
  },
  {
    id: 'idiomas',
    type: 'text',
    label: '¿Qué Idioma(s) o lengua(s) habla?',
    controlName: 'idiomas',
    placeholder: 'Ej. Español, Inglés',
    value: 'Español',
    group: 'confidencial'
  },
  {
    id: 'trabajaActualmente',
    type: 'radio',
    label: '¿Trabaja Actualmente?',
    controlName: 'trabajaActualmente',
    required: true,
    options: SI_NO_OPTIONS,
    group: 'confidencial'
  },
  {
    id: 'puestoTrabajo',
    type: 'text',
    label: 'Puesto de Trabajo',
    controlName: 'puestoTrabajo',
    placeholder: 'Dejar en blanco si no trabaja',
    group: 'confidencial'
  },
  {
    id: 'experienciaLaboral',
    type: 'textarea',
    label: 'Experiencia Laboral',
    controlName: 'experienciaLaboral',
    rows: 3,
    placeholder: 'Describa brevemente su experiencia laboral relevante',
    group: 'confidencial'
  },
  {
    id: 'observaciones',
    type: 'textarea',
    label: 'Observaciones',
    controlName: 'observaciones',
    rows: 2,
    group: 'confidencial'
  },
  {
    id: 'cuentaCertificacion',
    type: 'radio',
    label: '¿Cuenta con alguna Certificación?',
    controlName: 'cuentaCertificacion',
    required: true,
    options: SI_NO_OPTIONS,
    group: 'confidencial'
  },
  {
    id: 'cualesCertificaciones',
    type: 'text',
    label: '¿Cuáles certificaciones?',
    controlName: 'cualesCertificaciones',
    group: 'confidencial'
  },

  // ── Firma ─────────────────────────────────────────────────
  {
    id: 'firma',
    type: 'signature',
    label: 'Nombre y Firma del Candidato',
    controlName: 'firma',
    required: true,
    group: 'firma'
  }
];
