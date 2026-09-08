import { IsString, IsOptional, IsBoolean, IsInt, IsNumber, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateReactivoDto {
  @IsString() @MinLength(1)
  codigo_reactivo: string;

  @IsString() @MinLength(1)
  descripcion: string;

  @Type(() => Number) @IsNumber() @Min(0)
  peso: number;

  @IsOptional() @IsBoolean()
  es_actitud_valor?: boolean;

  @IsOptional() @IsInt() @Min(1)
  orden?: number;
}
