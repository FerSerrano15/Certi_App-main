import { IsBoolean, IsOptional, IsObject } from 'class-validator';

export class AcceptRightsDto {
  @IsBoolean()
  accepted: boolean;

  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;
}
