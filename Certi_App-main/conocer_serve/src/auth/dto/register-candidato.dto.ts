import { IsEmail, IsString, MinLength, IsNotEmpty } from 'class-validator';

export class RegisterCandidatoDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es requerido.' })
  nombre: string;

  @IsEmail({}, { message: 'El correo no tiene un formato válido.' })
  correo: string;

  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres.' })
  password: string;

  @IsString()
  @IsNotEmpty({ message: 'La CURP es requerida.' })
  curp: string;

  @IsString()
  @IsNotEmpty({ message: 'El teléfono es requerido.' })
  telefono: string;

  @IsString()
  @IsNotEmpty({ message: 'El domicilio es requerido.' })
  domicilio: string;

  @IsString()
  @IsNotEmpty({ message: 'El grado de estudios es requerido.' })
  gradoEstudios: string;

  @IsString()
  @IsNotEmpty({ message: 'El sector productivo es requerido.' })
  sectorProductivo: string;
}
