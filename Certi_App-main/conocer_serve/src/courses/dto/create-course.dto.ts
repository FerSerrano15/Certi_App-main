import {
  IsString, IsOptional, IsUUID, IsNumber, IsInt,
  Min, Max, MinLength,
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

  @IsOptional() @IsUUID()
  estandar_id?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  duration_hours?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100)
  passing_grade?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100)
  min_attendance?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  validity_months?: number;
}
