/**
 * Utilidades para decodificar la CURP mexicana.
 * Formato (18 caracteres): AAAA YYMMDD S EE CCC H D
 *   0-3   4 letras (iniciales de apellidos y nombre)
 *   4-9   YYMMDD  fecha de nacimiento
 *   10    H/M     sexo
 *   11-12 EE      entidad federativa de nacimiento (o NE = extranjero)
 *   13-15 CCC     consonantes internas
 *   16    H/D     diferenciador de siglo: dígito si nació antes del 2000,
 *                 letra si nació en el 2000 o después
 *   17    D       dígito verificador
 */

const CURP_REGEX = /^[A-Z]{4}(\d{2})(\d{2})(\d{2})([HM])([A-Z]{2})[A-Z]{3}[A-Z0-9]\d$/;

/** Código de entidad federativa (según CURP) → nombre completo. */
export const CURP_STATE_MAP: Record<string, string> = {
  AS: 'Aguascalientes',
  BC: 'Baja California',
  BS: 'Baja California Sur',
  CC: 'Campeche',
  CL: 'Coahuila',
  CM: 'Colima',
  CS: 'Chiapas',
  CH: 'Chihuahua',
  DF: 'Ciudad de México',
  DG: 'Durango',
  GT: 'Guanajuato',
  GR: 'Guerrero',
  HG: 'Hidalgo',
  JC: 'Jalisco',
  MC: 'México',
  MN: 'Michoacán',
  MS: 'Morelos',
  NT: 'Nayarit',
  NL: 'Nuevo León',
  OC: 'Oaxaca',
  PL: 'Puebla',
  QO: 'Querétaro',
  QR: 'Quintana Roo',
  SP: 'San Luis Potosí',
  SL: 'Sinaloa',
  SR: 'Sonora',
  TC: 'Tabasco',
  TS: 'Tamaulipas',
  TL: 'Tlaxcala',
  VZ: 'Veracruz',
  YN: 'Yucatán',
  ZS: 'Zacatecas',
  NE: 'Nacido en el Extranjero',
};

/** Los 32 estados de México (sin "Nacido en el Extranjero"), para selects de domicilio. */
export const MEXICAN_STATES: string[] = Object.values(CURP_STATE_MAP)
  .filter(name => name !== 'Nacido en el Extranjero')
  .sort((a, b) => a.localeCompare(b, 'es'));

export interface ParsedCurp {
  /** 'YYYY-MM-DD', compatible con <input type="date">. Null si la fecha no es válida. */
  birthDate: string | null;
  birthStateCode: string | null;
  birthStateName: string | null;
  sex: 'H' | 'M' | null;
}

/** Decodifica una CURP. Devuelve null si el formato no es válido. */
export function parseCurp(curpRaw: string): ParsedCurp | null {
  const curp = (curpRaw ?? '').trim().toUpperCase();
  const match = CURP_REGEX.exec(curp);
  if (!match) return null;

  const [, yy, mm, dd, sex, stateCode] = match;

  // El carácter 17 (índice 16) distingue el siglo: dígito = 1900s, letra = 2000+
  const centuryChar = curp.charAt(16);
  const century = /[0-9]/.test(centuryChar) ? 1900 : 2000;

  const year = century + Number(yy);
  const month = Number(mm);
  const day = Number(dd);

  const date = new Date(year, month - 1, day);
  const isRealDate =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;

  return {
    birthDate: isRealDate
      ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      : null,
    birthStateCode: stateCode,
    birthStateName: CURP_STATE_MAP[stateCode] ?? null,
    sex: sex === 'H' || sex === 'M' ? sex : null,
  };
}
