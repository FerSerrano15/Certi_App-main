import { Global, Module } from '@nestjs/common';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';
import { SupabaseModule } from '../supabase/supabase.module';

/**
 * Global: cualquier módulo puede inyectar AuditLogsService sin
 * necesidad de importar AuditLogsModule explícitamente (igual que
 * SupabaseModule).
 */
@Global()
@Module({
  imports: [SupabaseModule],
  controllers: [AuditLogsController],
  providers: [AuditLogsService],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}
