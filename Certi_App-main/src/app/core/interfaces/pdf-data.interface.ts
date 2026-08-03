// ============================================================
// core/interfaces/pdf-data.interface.ts
// Interfaces para los datos de los templates pdfmake
// ============================================================

export interface CartaSolicitudData {
  fecha: string;
  estandarCodigo: string;
  estandarNombre: string;
  nombreCompleto: string;
  firma: string; // base64 de la imagen del canvas de firma
}

export interface FichaRegistroData {
  // Estándar
  estandarCompetencia: string;
  estandarCodigo: string;
  fechaRegistro: string;

  // Datos personales
  nombreCompleto: string;
  lugarNacimiento: string;
  nacionalidad: string;
  curp: string;
  genero: string;
  fechaNacimiento: string;

  // Domicilio
  calle: string;
  numero: string;
  cp: string;
  colonia: string;
  ciudad: string;
  entidadFederativa: string;

  // Contacto
  email: string;
  telefono: string;
  telefonoCelular?: string;

  // RENAP
  consentimientoRenap: string;

  // Info confidencial
  sabeLeerEscribir: string;
  cuentaEstudios: string;
  cualesEstudios?: string;
  tieneDiscapacidad: string;
  discapacidadMotriz?: boolean;
  discapacidadVisual?: boolean;
  discapacidadAuditiva?: boolean;
  discapacidadLenguaje?: boolean;
  discapacidadIntelectual?: boolean;
  discapacidadOtras?: boolean;
  idiomas?: string;
  trabajaActualmente: string;
  puestoTrabajo?: string;
  experienciaLaboral?: string;
  observaciones?: string;
  cuentaCertificacion: string;
  cualesCertificaciones?: string;

  // Firma
  firma: string; // base64
}
