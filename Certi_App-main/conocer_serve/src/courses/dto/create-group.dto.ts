import {
  IsString, IsOptional, IsUUID, IsInt, IsDateString, IsIn, Min, MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateGroupDto {
  @IsUUID()
  course_id: string;

  @IsString() @MinLength(3)
  name: string;

  @IsOptional() @IsUUID()
  evaluator_id?: string;

  @IsOptional() @IsDateString()
  start_date?: string;

  @IsOptional() @IsDateString()
  end_date?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  capacity?: number;

  @IsOptional()
  @IsIn(['PLANEADO', 'EN_CURSO', 'FINALIZADO', 'CANCELADO'])
  status?: string;
}
