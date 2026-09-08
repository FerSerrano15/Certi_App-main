import { IsObject } from 'class-validator';

export class SubmitFichaRegistroDto {
  @IsObject()
  form_data: Record<string, any>;
}
