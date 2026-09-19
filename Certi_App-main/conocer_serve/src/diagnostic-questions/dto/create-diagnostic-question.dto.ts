import { IsUUID, IsIn, IsString, IsOptional, IsArray, IsNumber, Min, MinLength } from 'class-validator';

export type DiagnosticQuestionType = 'opcion_multiple' | 'abierta' | 'unir_reactivos';

export class CreateDiagnosticQuestionDto {
  @IsUUID()
  estandar_id: string;

  @IsIn(['opcion_multiple', 'abierta', 'unir_reactivos'])
  type: DiagnosticQuestionType;

  @IsString() @MinLength(3)
  prompt: string;

  // opcion_multiple: [{ id, text }]
  // unir_reactivos:  [{ id, left, right }]
  // abierta: no se usa
  @IsOptional() @IsArray()
  options?: Record<string, string>[];

  // Solo aplica a opcion_multiple — el id (dentro de `options`) de la opción correcta.
  @IsOptional() @IsString()
  correct_option_id?: string;

  @IsOptional() @IsNumber()
  order_index?: number;

  @IsOptional() @IsNumber() @Min(0.01)
  points?: number;
}
