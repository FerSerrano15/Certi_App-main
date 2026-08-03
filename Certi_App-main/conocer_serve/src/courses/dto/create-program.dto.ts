import { IsString, IsOptional, IsUUID, MinLength } from 'class-validator';

export class CreateProgramDto {
  @IsString() @MinLength(3)
  name: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsUUID()
  institution_id?: string;
}
