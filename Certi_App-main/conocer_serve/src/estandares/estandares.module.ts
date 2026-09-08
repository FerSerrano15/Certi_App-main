import { Module } from '@nestjs/common';
import { EstandaresController } from './estandares.controller';
import { EstandaresService } from './estandares.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [EstandaresController],
  providers: [EstandaresService],
  exports: [EstandaresService],
})
export class EstandaresModule {}
