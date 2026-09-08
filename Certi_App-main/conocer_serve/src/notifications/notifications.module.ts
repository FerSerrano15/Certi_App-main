import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { SupabaseModule } from '../supabase/supabase.module';

/**
 * Global: cualquier módulo puede inyectar NotificationsService sin
 * necesidad de importar NotificationsModule explícitamente (igual que
 * AuditLogsModule).
 */
@Global()
@Module({
  imports: [SupabaseModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
