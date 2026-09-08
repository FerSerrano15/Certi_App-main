import { IsUUID } from 'class-validator';

export class CreateProcessDto {
  // id de la solicitud (course_applications) ya APROBADA y con course_id asignado.
  @IsUUID()
  application_id: string;

  @IsUUID()
  evaluator_id: string;
}
