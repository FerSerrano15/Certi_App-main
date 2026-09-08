import { IsUUID, IsObject } from 'class-validator';

export class CreateFichaRegistroDto {
  @IsUUID()
  estandar_id: string;

  @IsObject()
  form_data: Record<string, any>;
}
