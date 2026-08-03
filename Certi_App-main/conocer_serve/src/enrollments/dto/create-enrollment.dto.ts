import { IsUUID, IsOptional, IsNumber, IsBoolean, IsString, Min, Max } from 'class-validator';

export class CreateEnrollmentDto {
  @IsUUID()
  group_id: string;

  @IsUUID()
  participant_id: string;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  final_grade?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  attendance_percentage?: number;

  @IsOptional() @IsBoolean()
  documents_validated?: boolean;

  @IsOptional() @IsString()
  status?: 'enrolled' | 'completed' | 'dropped';
}
