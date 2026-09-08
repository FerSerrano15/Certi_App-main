import { IsUUID, IsOptional } from 'class-validator';

export class PrepareSolicitudDto {
  @IsUUID()
  course_id: string;

  @IsOptional()
  @IsUUID()
  group_id?: string;
}
