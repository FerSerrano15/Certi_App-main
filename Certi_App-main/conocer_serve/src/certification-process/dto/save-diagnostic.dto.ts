import { IsOptional, IsString, IsObject } from 'class-validator';

export class SaveDiagnosticDto {
  @IsOptional()
  @IsString()
  result?: string;

  @IsOptional()
  @IsString()
  observations?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
