import { IsUUID, IsIn, IsOptional, IsString, IsDateString } from 'class-validator';

export class CreateCertificationDto {
  @IsUUID()
  user_id: string;

  @IsIn(['EVALUATOR_CREDENTIAL', 'STANDARD'])
  type: 'EVALUATOR_CREDENTIAL' | 'STANDARD';

  // Obligatorio cuando type = 'STANDARD'. Referencia al catálogo de estándares
  // (paso previo a validar evaluadores calificados para ese estándar).
  @IsOptional()
  @IsUUID()
  estandar_id?: string;

  // Snapshot legible del estándar (ej. 'EC0217'); se autocompleta si no se manda
  // pero se puede sobreescribir para credenciales sin estándar (EVALUATOR_CREDENTIAL).
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  // NOTA: la tabla real usa 'vencida'/'revocada'/'cancelada' (femenino, concuerda
  // con "certificación"), no 'vencido'/'revocado'.
  @IsOptional()
  @IsIn(['vigente', 'vencida', 'revocada', 'cancelada'])
  status?: string;

  @IsOptional()
  @IsDateString()
  issued_at?: string;

  @IsOptional()
  @IsDateString()
  expires_at?: string;

  @IsOptional()
  @IsString()
  certificate_url?: string;
}
