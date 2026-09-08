import { IsIn, IsOptional, IsString, IsNumber } from 'class-validator';

export class EmitJudgmentDto {
  @IsIn(['competente', 'aun_no_competente'])
  result: 'competente' | 'aun_no_competente';

  @IsOptional()
  @IsNumber()
  final_score?: number;

  @IsOptional()
  @IsString()
  observations?: string;
}
