import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ReviewCertificateRequestDto {
  @IsBoolean()
  approve: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
