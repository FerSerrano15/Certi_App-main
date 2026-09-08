import { IsString, MinLength } from 'class-validator';

export class DeleteUserDto {
  @IsString()
  @MinLength(1, { message: 'Debes ingresar tu contraseña para confirmar.' })
  password: string;
}
