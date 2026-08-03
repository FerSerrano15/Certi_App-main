import { IsUUID, IsBoolean, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AttendanceRecordDto {
  @IsUUID()
  enrollment_id: string;

  @IsBoolean()
  present: boolean;
}

export class BulkAttendanceDto {
  @IsUUID()
  session_id: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordDto)
  records: AttendanceRecordDto[];
}

export class CreateAttendanceDto {
  @IsUUID()
  session_id: string;

  @IsUUID()
  enrollment_id: string;

  @IsOptional() @IsBoolean()
  present?: boolean;
}
