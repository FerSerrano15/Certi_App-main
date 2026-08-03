import { IsUUID } from 'class-validator';

export class SelfEnrollDto {
  @IsUUID()
  group_id: string;
}
