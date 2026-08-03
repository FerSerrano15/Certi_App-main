import { Module } from '@nestjs/common';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { ParticipantsModule } from '../participants/participants.module';

@Module({
  imports: [SupabaseModule, ParticipantsModule],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService],
  exports: [EnrollmentsService],
})
export class EnrollmentsModule {}
