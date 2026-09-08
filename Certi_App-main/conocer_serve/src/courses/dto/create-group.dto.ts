import {
  IsString, IsOptional, IsUUID, IsInt, IsDateString, Min, MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateGroupDto {
  @IsUUID()
  course_id: string;

  @IsString() @MinLength(3)
  name: string;

  @IsOptional() @IsString()
  code?: string;

  @IsOptional() @IsUUID()
  evaluator_id?: string;

  @IsOptional() @IsDateString()
  start_date?: string;

  @IsOptional() @IsDateString()
  end_date?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  capacity?: number;

  // El conjunto exacto de valores permitidos lo define el CHECK constraint de
  // la tabla `groups` en la base de datos (el valor por defecto es 'abierto').
  // No se restringe aquí con @IsIn(...) para no bloquear valores válidos que
  // aún no se han confirmado; la propia base de datos rechazará un valor
  // inválido con un error claro.
  @IsOptional() @IsString()
  status?: string;
}
