import { Module } from '@nestjs/common';
import { SolicitudesController } from './solicitudes.controller';
import { SolicitudesService } from './solicitudes.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ParticipantsModule } from '../participants/participants.module';

@Module({
  imports: [SupabaseModule, AuditLogsModule, ParticipantsModule],
  controllers: [SolicitudesController],
  providers: [SolicitudesService],
  exports: [SolicitudesService],
})
export class SolicitudesModule {}
