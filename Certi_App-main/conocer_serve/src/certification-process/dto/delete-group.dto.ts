import { IsUUID, IsOptional, IsArray, ArrayMinSize } from 'class-validator';

export class DeleteGroupDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  process_ids: string[];

  @IsOptional()
  @IsUUID()
  group_id?: string;
}
