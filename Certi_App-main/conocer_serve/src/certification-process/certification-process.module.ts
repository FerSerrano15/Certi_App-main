import { Module } from '@nestjs/common';
import { CertificationProcessController } from './certification-process.controller';
import { CertificationProcessService } from './certification-process.service';
import { StagesController } from './stages.controller';
import { StagesService } from './stages.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ParticipantsModule } from '../participants/participants.module';
import { CertificationsModule } from '../certifications/certifications.module';
import { SolicitudesModule } from '../solicitudes/solicitudes.module';

@Module({
  imports: [SupabaseModule, AuditLogsModule, ParticipantsModule, CertificationsModule, SolicitudesModule],
  controllers: [CertificationProcessController, StagesController],
  providers: [CertificationProcessService, StagesService],
  exports: [CertificationProcessService, StagesService],
})
export class CertificationProcessModule {}
