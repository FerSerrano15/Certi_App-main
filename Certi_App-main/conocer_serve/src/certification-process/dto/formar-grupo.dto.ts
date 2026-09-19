import { IsUUID, IsOptional, IsArray, ArrayMinSize } from 'class-validator';

export class FormarGrupoDto {
  @IsUUID()
  estandar_id: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ficha_ids: string[];

  @IsUUID()
  course_id: string;

  @IsOptional()
  @IsUUID()
  group_id?: string;

  @IsUUID()
  evaluator_id: string;
}
