import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ReviewPlanDto {
  @IsBoolean()
  approve: boolean;

  @IsOptional()
  @IsString()
  observations?: string;
}
