import { IsUUID, IsOptional, IsBoolean } from 'class-validator';

export class IssueCertificateDto {
  @IsUUID()
  enrollment_id: string;

  // Si es true, emite el certificado aunque la calificación o asistencia
  // no alcancen los mínimos del curso (uso excepcional, requiere admin).
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
