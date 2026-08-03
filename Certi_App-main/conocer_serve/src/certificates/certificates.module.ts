import { Module } from '@nestjs/common';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { ParticipantsModule } from '../participants/participants.module';

@Module({
  imports: [SupabaseModule, ParticipantsModule],
  controllers: [CertificatesController],
  providers: [CertificatesService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
