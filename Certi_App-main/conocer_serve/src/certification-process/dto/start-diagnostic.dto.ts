import { IsIn } from 'class-validator';

export class StartDiagnosticDto {
  @IsIn(['presencial', 'en_linea'])
  modality: 'presencial' | 'en_linea';
}
