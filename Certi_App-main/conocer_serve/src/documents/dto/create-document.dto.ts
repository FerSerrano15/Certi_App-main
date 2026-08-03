import { IsString, IsOptional, IsUUID, MinLength } from 'class-validator';

export class CreateDocumentDto {
  @IsString()
  @MinLength(2)
  type: string;

  // Solo lo usa el flujo de admin (POST /documents); en el autoservicio
  // (POST /documents/self) el participante se resuelve del usuario autenticado.
  @IsOptional()
  @IsUUID()
  participant_id?: string;
}
