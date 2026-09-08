import {
  IsString, IsOptional, IsUUID, IsNumber,
  Min, MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCourseDto {
  @IsString() @MinLength(3)
  name: string;

  @IsString() @MinLength(2)
  code: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsUUID()
  program_id?: string;

  @IsUUID()
  estandar_id: string;

  // `courses_duration_hours_check` en la base de datos exige una duración
  // positiva (0 no es válido para un curso real).
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1)
  duration_hours?: number;

  @IsOptional() @IsString()
  modality?: string;
}
