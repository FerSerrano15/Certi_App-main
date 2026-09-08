import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class SignCommitmentDto {
  @IsOptional()
  @IsString()
  content?: string;

  @IsBoolean()
  signed: boolean;

  @IsOptional()
  @IsString()
  signature_path?: string;
}
