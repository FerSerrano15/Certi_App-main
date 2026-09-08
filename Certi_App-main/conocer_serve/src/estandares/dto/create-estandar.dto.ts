import { IsString, IsOptional, IsBoolean, IsInt, Min, MinLength } from 'class-validator';

export class CreateEstandarDto {
  @IsString() @MinLength(1)
  codigo: string;

  @IsString() @MinLength(3)
  nombre: string;

  @IsOptional() @IsString()
  categoria?: string;

  @IsOptional() @IsInt() @Min(1)
  version?: number;

  @IsOptional() @IsBoolean()
  vigente?: boolean;
}
