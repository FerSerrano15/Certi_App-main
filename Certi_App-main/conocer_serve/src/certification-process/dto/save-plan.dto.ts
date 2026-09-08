import { IsOptional, IsString, IsObject, IsDateString } from 'class-validator';

export class SavePlanDto {
  @IsOptional() @IsDateString()
  planned_start?: string;

  @IsOptional() @IsDateString()
  planned_end?: string;

  @IsOptional() @IsString()
  location?: string;

  @IsOptional() @IsString()
  modality?: string;

  @IsOptional() @IsObject()
  criteria?: Record<string, unknown>;

  @IsOptional() @IsString()
  observations?: string;

  // El evaluador guarda en 'borrador'; al enviarlo con submit=true pasa a
  // 'propuesto' y queda a la espera de que ADMIN lo apruebe/rechace (los
  // límites del plan los define ADMIN, por eso requiere su aprobación).
  @IsOptional()
  submit?: boolean;
}
