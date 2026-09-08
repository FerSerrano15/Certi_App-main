import { IsUUID, IsBoolean, IsOptional, IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ReactivoRespuestaDto {
  @IsUUID()
  reactivo_id: string;

  @IsOptional() @IsBoolean()
  respuesta?: boolean | null;

  @IsOptional() @IsString()
  observaciones?: string;
}

export class BulkEvaluacionDto {
  @IsUUID()
  enrollment_id: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReactivoRespuestaDto)
  records: ReactivoRespuestaDto[];
}
