import { IsUUID } from 'class-validator';

export class CreateCertificateRequestDto {
  @IsUUID()
  process_id: string;
}
