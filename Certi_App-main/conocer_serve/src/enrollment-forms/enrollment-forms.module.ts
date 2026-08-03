import { Module } from '@nestjs/common';
import { EnrollmentFormsController } from './enrollment-forms.controller';
import { EnrollmentFormsService } from './enrollment-forms.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [EnrollmentFormsController],
  providers: [EnrollmentFormsService],
  exports: [EnrollmentFormsService],
})
export class EnrollmentFormsModule {}
