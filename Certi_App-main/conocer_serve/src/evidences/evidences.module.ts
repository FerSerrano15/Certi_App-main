import { Module } from '@nestjs/common';
import { EvidencesController } from './evidences.controller';
import { EvidencesService } from './evidences.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { CertificationProcessModule } from '../certification-process/certification-process.module';

@Module({
  imports: [SupabaseModule, AuditLogsModule, CertificationProcessModule],
  controllers: [EvidencesController],
  providers: [EvidencesService],
  exports: [EvidencesService],
})
export class EvidencesModule {}
