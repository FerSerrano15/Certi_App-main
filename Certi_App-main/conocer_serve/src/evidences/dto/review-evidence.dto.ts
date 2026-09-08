import { IsIn, IsOptional, IsString } from 'class-validator';

export class ReviewEvidenceDto {
  @IsIn(['validada', 'rechazada', 'requiere_correccion'])
  status: 'validada' | 'rechazada' | 'requiere_correccion';

  @IsOptional()
  @IsString()
  notes?: string;
}
