import { IsUUID } from 'class-validator';

export class CreateSolicitudDto {
  @IsUUID()
  estandar_id: string;
}
