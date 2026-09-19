import { IsBoolean } from 'class-validator';

export class StageCandidateAccessDto {
  @IsBoolean()
  enabled: boolean;
}
