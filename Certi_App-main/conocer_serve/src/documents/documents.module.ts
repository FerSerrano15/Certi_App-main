import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { ParticipantsModule } from '../participants/participants.module';

@Module({
  imports: [SupabaseModule, ParticipantsModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
