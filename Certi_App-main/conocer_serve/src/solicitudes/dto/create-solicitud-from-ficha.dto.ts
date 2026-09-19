import { IsUUID, IsOptional } from 'class-validator';

export class CreateSolicitudFromFichaDto {
  @IsUUID()
  ficha_id: string;

  @IsUUID()
  course_id: string;

  @IsOptional()
  @IsUUID()
  group_id?: string;
}
