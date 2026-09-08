import { IsIn } from 'class-validator';

export class UpdateFichaStatusDto {
  @IsIn(['pendiente', 'aprobada', 'rechazada'])
  status: 'pendiente' | 'aprobada' | 'rechazada';
}
