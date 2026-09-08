import { IsString, IsOptional, IsInt, Min, MinLength } from 'class-validator';

export class CreateGuiaDto {
  @IsString() @MinLength(1)
  titulo: string;

  @IsOptional() @IsString()
  instrucciones?: string;

  @IsOptional() @IsInt() @Min(1)
  orden?: number;
}
