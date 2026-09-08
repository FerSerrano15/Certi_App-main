import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class PresentResultsDto {
  @IsBoolean()
  participant_accepted: boolean;

  @IsOptional()
  @IsString()
  observations?: string;
}
