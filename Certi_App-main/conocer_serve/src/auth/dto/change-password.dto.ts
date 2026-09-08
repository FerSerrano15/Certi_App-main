import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString({ message: 'La contraseña actual es requerida.' })
  current_password: string;

  @IsString()
  @MinLength(8, { message: 'La nueva contraseña debe tener al menos 8 caracteres.' })
  new_password: string;

  @IsString({ message: 'La confirmación de contraseña es requerida.' })
  confirm_password: string;
}
