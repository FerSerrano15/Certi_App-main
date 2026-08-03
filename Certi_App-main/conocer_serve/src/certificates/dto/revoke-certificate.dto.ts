import { IsOptional, IsString } from 'class-validator';

export class RevokeCertificateDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
