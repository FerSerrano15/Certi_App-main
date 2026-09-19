import { IsUUID, IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class MatchAnswerDto {
  @IsUUID()
  right_id: string;

  @IsUUID()
  selected_left_id: string;
}

export class DiagnosticAnswerDto {
  @IsUUID()
  question_id: string;

  @IsOptional() @IsUUID()
  selected_option_id?: string;

  @IsOptional() @IsString()
  text?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MatchAnswerDto)
  matches?: MatchAnswerDto[];
}

export class SubmitDiagnosticAnswersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiagnosticAnswerDto)
  answers: DiagnosticAnswerDto[];

  @IsOptional() @IsString()
  candidate_signature?: string;
}
