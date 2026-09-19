import { Module } from '@nestjs/common';
import { DiagnosticQuestionsController } from './diagnostic-questions.controller';
import { DiagnosticQuestionsService } from './diagnostic-questions.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [DiagnosticQuestionsController],
  providers: [DiagnosticQuestionsService],
})
export class DiagnosticQuestionsModule {}
