import { Module } from '@nestjs/common';
import { LandingContentController } from './landing-content.controller';
import { LandingContentService } from './landing-content.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [LandingContentController],
  providers: [LandingContentService],
  exports: [LandingContentService],
})
export class LandingContentModule {}
