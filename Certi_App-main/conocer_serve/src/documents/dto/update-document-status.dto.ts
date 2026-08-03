import { IsIn } from 'class-validator';

export class UpdateDocumentStatusDto {
  @IsIn(['validated', 'rejected'])
  status: 'validated' | 'rejected';
}
