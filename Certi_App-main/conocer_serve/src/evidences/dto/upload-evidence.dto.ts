import { IsString, MinLength, IsOptional } from 'class-validator';

export class UploadEvidenceDto {
  @IsString()
  @MinLength(2)
  evidence_type: string;

  @IsOptional()
  @IsString()
  description?: string;
}
