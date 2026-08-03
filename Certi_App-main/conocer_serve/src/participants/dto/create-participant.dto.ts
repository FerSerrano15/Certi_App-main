import { IsString, IsEmail, IsOptional, IsUUID, MinLength } from 'class-validator';

export class CreateParticipantDto {
  @IsOptional() @IsUUID()
  institution_id?: string;

  @IsOptional() @IsUUID()
  user_id?: string;

  @IsString() @MinLength(3)
  full_name: string;

  @IsEmail()
  email: string;

  @IsOptional() @IsString()
  phone?: string;

  @IsOptional() @IsString()
  national_id?: string;
}
