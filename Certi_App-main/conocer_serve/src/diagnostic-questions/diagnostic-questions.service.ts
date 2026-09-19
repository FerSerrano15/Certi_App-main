import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateDiagnosticQuestionDto } from './dto/create-diagnostic-question.dto';

type JwtUser = { id: string; role: string };

const AUTHORIZED_ROLES = ['SUPER_ADMIN', 'ADMIN', 'EVALUADOR'];

/**
 * Banco de preguntas de Diagnóstico — reutilizable por estándar. A
 * diferencia de guias_observacion/reactivos (solo admin), aquí CUALQUIER
 * evaluador puede armar/editar el banco de un estándar — es su examen, no
 * un instrumento oficial centralizado.
 */
@Injectable()
export class DiagnosticQuestionsService {
  constructor(private readonly supabase: SupabaseService) {}

  private requireEvaluadorOrAdmin(user: JwtUser) {
    if (!AUTHORIZED_ROLES.includes(user.role)) {
      throw new ForbiddenException('Se requiere rol de evaluador o administrador.');
    }
  }

  async listByEstandar(estandarId: string) {
    const { data, error } = await this.supabase.admin
      .from('diagnostic_questions')
      .select('*')
      .eq('estandar_id', estandarId)
      .order('order_index', { ascending: true });
    if (error) throw new ConflictException(error.message);
    return data ?? [];
  }

  /**
   * Versión "segura" para el candidato que va a contestar — nunca se le
   * manda `correct_option_id` (evita filtrar la respuesta de opción
   * múltiple por la consola de red).
   */
  async listForExam(estandarId: string) {
    const questions = await this.listByEstandar(estandarId);
    return questions.map((q: { correct_option_id: string | null }) => {
      const { correct_option_id, ...rest } = q;
      return rest;
    });
  }

  async create(dto: CreateDiagnosticQuestionDto, user: JwtUser) {
    this.requireEvaluadorOrAdmin(user);

    let orderIndex = dto.order_index;
    if (orderIndex == null) {
      const existing = await this.listByEstandar(dto.estandar_id);
      orderIndex = existing.length
        ? Math.max(...existing.map((q: { order_index: number }) => q.order_index)) + 1
        : 1;
    }

    const { data, error } = await this.supabase.admin
      .from('diagnostic_questions')
      .insert({
        estandar_id: dto.estandar_id,
        type: dto.type,
        prompt: dto.prompt,
        options: dto.options ?? [],
        correct_option_id: dto.correct_option_id ?? null,
        order_index: orderIndex,
        points: dto.points ?? 1,
        created_by: user.id,
      })
      .select('*')
      .single();
    if (error) throw new ConflictException(error.message);
    return data;
  }

  async update(id: string, dto: Partial<CreateDiagnosticQuestionDto>, user: JwtUser) {
    this.requireEvaluadorOrAdmin(user);
    const { data, error } = await this.supabase.admin
      .from('diagnostic_questions')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error || !data) throw new NotFoundException('Pregunta no encontrada.');
    return data;
  }

  async remove(id: string, user: JwtUser) {
    this.requireEvaluadorOrAdmin(user);
    const { error } = await this.supabase.admin.from('diagnostic_questions').delete().eq('id', id);
    if (error) throw new NotFoundException(error.message);
    return { message: 'Pregunta eliminada.' };
  }
}
