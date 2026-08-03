import { IsUUID, IsString, IsIn, IsObject } from 'class-validator';

export class CreateEnrollmentFormDto {
  @IsUUID()
  enrollment_id: string;

  @IsString()
  @IsIn(['carta_solicitud', 'ficha_registro'])
  form_type: 'carta_solicitud' | 'ficha_registro';

  @IsObject()
  form_data: Record<string, any>;
}
