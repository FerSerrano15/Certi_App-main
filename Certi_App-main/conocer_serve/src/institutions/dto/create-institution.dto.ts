import { IsString, IsOptional, IsEmail, IsBoolean, MinLength, Matches } from 'class-validator';

export class CreateInstitutionDto {
  @IsString() @MinLength(3)
  name: string;

  /** Slug único para URL (ej: "unam-fca"). Si no se envía, se genera del nombre. */
  @IsOptional() @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'El slug solo puede contener letras minúsculas, números y guiones.',
  })
  slug?: string;

  @IsOptional() @IsString()
  tax_id?: string;

  @IsOptional() @IsString()
  logo_url?: string;

  @IsOptional() @IsEmail()
  contact_email?: string;

  @IsOptional() @IsString()
  phone?: string;

  @IsOptional() @IsBoolean()
  is_active?: boolean;
}
