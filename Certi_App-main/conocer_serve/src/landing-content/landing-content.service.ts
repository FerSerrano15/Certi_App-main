import {
  Injectable,
  ForbiddenException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

type JwtUser = { id: string; role: string; institution_id: string | null };

// Fila única (singleton) — coincide con el DEFAULT del id en la tabla.
const LANDING_ID = '00000000-0000-0000-0000-000000000001';

@Injectable()
export class LandingContentService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  /** Público — usado por el home para renderizar el sitio. */
  async getContent() {
    const { data, error } = await this.supabase.admin
      .from('landing_content')
      .select('data, updated_at')
      .eq('id', LANDING_ID)
      .maybeSingle<{ data: Record<string, unknown>; updated_at: string }>();
    if (error) throw new NotFoundException(error.message);
    return { data: data?.data ?? null, updated_at: data?.updated_at ?? null };
  }

  /** Solo SUPER_ADMIN puede editar el contenido del landing page. */
  async updateContent(content: Record<string, unknown>, user: JwtUser) {
    if (user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Solo el Super Admin puede editar el landing page.');
    }
    const { data, error } = await this.supabase.admin
      .from('landing_content')
      .upsert(
        { id: LANDING_ID, data: content, updated_at: new Date().toISOString(), updated_by: user.id },
        { onConflict: 'id' },
      )
      .select('data, updated_at')
      .single();
    if (error) throw new ConflictException(error.message);

    await this.auditLogs.log({
      user_id: user.id,
      institution_id: user.institution_id,
      action: 'LANDING_CONTENT_UPDATED',
      entity: 'landing_content',
      entityid: LANDING_ID,
    });

    return data;
  }
}
