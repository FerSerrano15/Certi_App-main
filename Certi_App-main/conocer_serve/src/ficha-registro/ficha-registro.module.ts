import { Module } from '@nestjs/common';
import { FichaRegistroController } from './ficha-registro.controller';
import { FichaRegistroService } from './ficha-registro.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [FichaRegistroController],
  providers: [FichaRegistroService],
  exports: [FichaRegistroService],
})
export class FichaRegistroModule {}
