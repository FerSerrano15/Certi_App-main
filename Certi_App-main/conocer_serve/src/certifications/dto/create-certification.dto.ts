import { IsUUID, IsIn, IsOptional, IsString, IsDateString } from 'class-validator';

export class CreateCertificationDto {
  @IsUUID()
  user_id: string;

  @IsIn(['INSTRUCTOR_CREDENTIAL', 'STANDARD'])
  type: 'INSTRUCTOR_CREDENTIAL' | 'STANDARD';

  // Obligatorio cuando type = 'STANDARD'. Debe coincidir con courses.code (ej: 'EC0217').
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['vigente', 'vencido', 'revocado'])
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
