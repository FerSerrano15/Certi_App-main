import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export type SolicitudReviewAction = 'approve' | 'reject' | 'request_correction';

export class ReviewSolicitudDto {
  @IsIn(['approve', 'reject', 'request_correction'])
  action: SolicitudReviewAction;

  // Obligatorio para 'reject' y 'request_correction' — se valida en el
  // servicio porque depende de `action`.
  @IsOptional()
  @IsString()
  @MinLength(3)
  reason?: string;
}
