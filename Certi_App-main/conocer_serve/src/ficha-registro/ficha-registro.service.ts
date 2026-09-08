import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateFichaRegistroDto } from './dto/create-ficha-registro.dto';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];

@Injectable()
export class FichaRegistroService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // CREATE — el candidato envía una nueva ficha para un estándar
  // ──────────────────────────────────────────────────────────────────────────
  async create(userId: string, dto: CreateFichaRegistroDto) {
    const client = this.supabase.admin;

    // 1. Verificar que el estándar existe (snapshot de código/nombre para el PDF)
    const { data: estandar, error: estandarErr } = await client
      .from('estandares')
      .select('id, codigo, nombre')
      .eq('id', dto.estandar_id)
      .single();

    if (estandarErr || !estandar) {
      throw new NotFoundException('Estándar no encontrado.');
    }

    // 2. Insertar la ficha
    // La tabla real no tiene UNIQUE(user_id, estandar_id) a nivel de BD, así
    // que la regla de negocio "una ficha por estándar" se valida aquí.
    const { data: existing } = await client
      .from('fichas_registro')
      .select('id')
      .eq('user_id', userId)
      .eq('estandar_id', estandar.id)
      .maybeSingle();
    if (existing) {
      throw new ConflictException('Ya tienes una ficha registrada para este estándar.');
    }

    // status real: 'borrador' | 'enviada' | 'validada' | 'rechazada' (NOT NULL,
    // sin default) — se envía directo en 'enviada' porque el candidato la
    // manda de una vez desde el formulario.
    const { data, error } = await client
      .from('fichas_registro')
      .insert({
        user_id: userId,
        estandar_id: estandar.id,
        estandar_codigo: estandar.codigo,
        estandar_nombre: estandar.nombre,
        form_data: dto.form_data,
        status: 'enviada',
        submitted_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException('No se pudo guardar la ficha de registro: ' + error.message);
    }

    // 3. Backfill best-effort del CURP en users (solo si aún no lo tenía)
    const curp = (dto.form_data as any)?.curp;
    if (curp && typeof curp === 'string') {
      await client
        .from('users')
        .update({ curp: curp.toUpperCase() })
        .eq('id', userId)
        .is('curp', null);
    }

    // 4. Notificar a los admins (best-effort, nunca rompe el submit)
    const { data: requester } = await client
      .from('users')
      .select('full_name')
      .eq('id', userId)
      .single();

    await this.notifications.notifyAdmins({
      type: 'FICHA_REGISTRO_SUBMITTED',
      title: 'Nueva ficha de registro',
      message: `${requester?.full_name ?? 'Un candidato'} envió su ficha de registro para el estándar ${estandar.codigo} - ${estandar.nombre}.`,
      payload: {
        ficha_id: data.id,
        user_id: userId,
        full_name: requester?.full_name ?? null,
        estandar_codigo: estandar.codigo,
        estandar_nombre: estandar.nombre,
      },
    });

    return data;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET mis fichas
  // ──────────────────────────────────────────────────────────────────────────
  async findMine(userId: string) {
    const { data, error } = await this.supabase.admin
      .from('fichas_registro')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new InternalServerErrorException(error.message);
    return data ?? [];
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET una ficha — dueño o admin
  // ──────────────────────────────────────────────────────────────────────────
  async findOne(id: string, requester: { id: string; role: string }) {
    const { data, error } = await this.supabase.admin
      .from('fichas_registro')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException('Ficha no encontrada.');

    const isAdmin = ADMIN_ROLES.includes(requester.role);
    if (!isAdmin && data.user_id !== requester.id) {
      throw new ForbiddenException('No tienes acceso a esta ficha.');
    }

    return data;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET todas las fichas con datos del candidato — vista admin "Solicitudes"
  // ──────────────────────────────────────────────────────────────────────────
  async findAllWithParticipant(requester: { id: string; role: string }) {
    this.requireAdmin(requester.role);

    const { data, error } = await this.supabase.admin
      .from('fichas_registro')
      .select('id, user_id, estandar_id, estandar_codigo, estandar_nombre, status, submitted_at, created_at, users!user_id ( full_name, email )')
      .order('submitted_at', { ascending: false });

    if (error) throw new InternalServerErrorException(error.message);
    return data ?? [];
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PATCH estado de una ficha — solo admin
  // ──────────────────────────────────────────────────────────────────────────
  async updateStatus(id: string, status: 'validada' | 'rechazada', requester: { id: string; role: string }) {
    this.requireAdmin(requester.role);

    const { data, error } = await this.supabase.admin
      .from('fichas_registro')
      .update({ status, validated_by: requester.id, validated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) throw new NotFoundException('Ficha no encontrada.');
    return data;
  }

  private requireAdmin(role: string) {
    if (!ADMIN_ROLES.includes(role)) {
      throw new ForbiddenException('Se requiere rol de administrador.');
    }
  }
}
