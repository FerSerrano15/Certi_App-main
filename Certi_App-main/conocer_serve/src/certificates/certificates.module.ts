import { Module } from '@nestjs/common';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { CertificationProcessModule } from '../certification-process/certification-process.module';

@Module({
  imports: [SupabaseModule, AuditLogsModule, CertificationProcessModule],
  controllers: [CertificatesController],
  providers: [CertificatesService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
