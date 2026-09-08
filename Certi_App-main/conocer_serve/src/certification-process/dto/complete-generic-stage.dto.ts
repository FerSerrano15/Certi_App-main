import { IsOptional, IsString, IsObject } from 'class-validator';

export class CompleteGenericStageDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
