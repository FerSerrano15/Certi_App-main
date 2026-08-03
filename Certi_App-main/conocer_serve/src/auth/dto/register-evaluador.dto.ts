import { IsArray, IsEmail, IsString, MinLength, IsNotEmpty } from 'class-validator';

export class RegisterEvaluadorDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es requerido.' })
  nombre: string;

  @IsEmail({}, { message: 'El correo no tiene un formato válido.' })
  correo: string;

  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres.' })
  password: string;

  @IsString()
  @IsNotEmpty({ message: 'El teléfono es requerido.' })
  telefono: string;

  @IsArray({ message: 'Los estándares deben ser un arreglo.' })
  @IsString({ each: true })
  estandares: string[];
}
