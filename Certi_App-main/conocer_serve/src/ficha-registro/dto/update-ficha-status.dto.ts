import { IsIn } from 'class-validator';

export class UpdateFichaStatusDto {
  @IsIn(['validada', 'rechazada'])
  status: 'validada' | 'rechazada';
}
