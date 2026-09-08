import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsIn,
} from 'class-validator';

export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'EVALUADOR'
  | 'CANDIDATO';

export class RegisterDto {
  @IsString({ message: 'El nombre completo es requerido.' })
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres.' })
  full_name: string;

  @IsEmail({}, { message: 'El email no tiene un formato válido.' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsIn(['SUPER_ADMIN', 'ADMIN', 'EVALUADOR', 'CANDIDATO'], {
    message: 'Rol inválido.',
  })
  role?: UserRole;

  @IsOptional()
  @IsString()
  institution_name?: string;
}
