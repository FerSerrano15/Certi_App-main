import { IsOptional, IsString } from 'class-validator';

export class CloseCedulaDto {
  @IsOptional()
  @IsString()
  observations?: string;
}
