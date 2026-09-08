import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { BulkEvaluacionDto } from './dto/bulk-evaluacion.dto';

type JwtUser = { id: string; role: string };

@Injectable()
export class EvaluacionesService {
  constructor(private readonly supabase: SupabaseService) {}

  private requireEvaluator(user: JwtUser) {
    if (!['SUPER_ADMIN', 'ADMIN', 'EVALUADOR'].includes(user.role)) {
      throw new ForbiddenException('No tienes permisos para esta acción.');
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  LIST — Respuestas de evaluación de una inscripción, agrupadas por guía
  // ════════════════════════════════════════════════════════════════════════════

  async getByEnrollment(enrollmentId: string, user: JwtUser) {
    this.requireEvaluator(user);
    const { data, error } = await this.supabase.admin
      .from('evaluacion_reactivos')
      .select(`
        *,
        reactivos (
          id, codigo_reactivo, descripcion, peso, es_actitud_valor, orden,
          guias_observacion ( id, titulo, orden, instrucciones )
        )
      `)
      .eq('enrollment_id', enrollmentId);

    if (error) throw new NotFoundException(error.message);

    const rows = data ?? [];
    rows.sort((a: any, b: any) => {
      const gOrdA = a.reactivos?.guias_observacion?.orden ?? 0;
      const gOrdB = b.reactivos?.guias_observacion?.orden ?? 0;
      if (gOrdA !== gOrdB) return gOrdA - gOrdB;
      return (a.reactivos?.orden ?? 0) - (b.reactivos?.orden ?? 0);
    });
    return rows;
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  INIT — Crea una fila vacía por cada reactivo del estándar ligado al curso
  // ════════════════════════════════════════════════════════════════════════════

  async init(enrollmentId: string, user: JwtUser) {
    this.requireEvaluator(user);

    const { data: enrollment, error: enrErr } = await this.supabase.admin
      .from('enrollments')
      .select('id, group_id, groups ( course_id, courses ( id, estandar_id ) )')
      .eq('id', enrollmentId)
      .single<{
        id: string; group_id: string;
        groups: { course_id: string; courses: { id: string; estandar_id: string | null } | null } | null;
      }>();
    if (enrErr || !enrollment) throw new NotFoundException('Inscripción no encontrada.');

    const estandarId = enrollment.groups?.courses?.estandar_id;
    if (!estandarId) {
      throw new NotFoundException(
        'El curso de esta inscripción no tiene un estándar de competencia vinculado. Vincúlalo desde Cursos antes de evaluar.',
      );
    }

    const { data: guias } = await this.supabase.admin
      .from('guias_observacion')
      .select('id, reactivos ( id )')
      .eq('estandar_id', estandarId);

    const reactivoIds = (guias ?? []).flatMap((g: any) => (g.reactivos ?? []).map((r: any) => r.id));
    if (!reactivoIds.length) return { created: 0 };

    const { data: existing } = await this.supabase.admin
      .from('evaluacion_reactivos')
      .select('reactivo_id')
      .eq('enrollment_id', enrollmentId);

    const existingIds = new Set((existing ?? []).map((e: { reactivo_id: string }) => e.reactivo_id));
    const toInsert = reactivoIds
      .filter((id: string) => !existingIds.has(id))
      .map((id: string) => ({ enrollment_id: enrollmentId, reactivo_id: id, respuesta: null }));

    if (!toInsert.length) return { created: 0 };

    const { error } = await this.supabase.admin.from('evaluacion_reactivos').insert(toInsert);
    if (error) throw new NotFoundException(error.message);
    return { created: toInsert.length };
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  BULK UPSERT — Guardar respuestas Sí/No + observaciones en lote
  // ════════════════════════════════════════════════════════════════════════════

  async bulkUpsert(dto: BulkEvaluacionDto, user: JwtUser) {
    this.requireEvaluator(user);

    const rows = dto.records.map(r => ({
      enrollment_id: dto.enrollment_id,
      reactivo_id: r.reactivo_id,
      respuesta: r.respuesta ?? null,
      observaciones: r.observaciones ?? null,
      evaluated_at: new Date().toISOString(),
    }));

    const { data, error } = await this.supabase.admin
      .from('evaluacion_reactivos')
      .upsert(rows, { onConflict: 'enrollment_id,reactivo_id' })
      .select('*');

    if (error) throw new NotFoundException(error.message);
    return data ?? [];
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  RECALCULATE — Suma el peso de los reactivos con respuesta = true, escribe
  //  el resultado (porcentaje, competente/aun_no_competente) en enrollments.
  // ════════════════════════════════════════════════════════════════════════════

  async recalculate(enrollmentId: string, user: JwtUser) {
    this.requireEvaluator(user);

    const { data: enrollment, error: enrErr } = await this.supabase.admin
      .from('enrollments')
      .select('id, groups ( courses ( passing_grade ) )')
      .eq('id', enrollmentId)
      .single<{ id: string; groups: { courses: { passing_grade: number } | null } | null }>();
    if (enrErr || !enrollment) throw new NotFoundException('Inscripción no encontrada.');

    const { data: respuestas } = await this.supabase.admin
      .from('evaluacion_reactivos')
      .select('respuesta, reactivos ( peso )')
      .eq('enrollment_id', enrollmentId);

    const rows = (respuestas ?? []) as unknown as { respuesta: boolean | null; reactivos: { peso: number } | { peso: number }[] | null }[];
    const pesoDe = (r: (typeof rows)[number]) => Array.isArray(r.reactivos) ? (r.reactivos[0]?.peso ?? 0) : (r.reactivos?.peso ?? 0);
    const pesoTotal = rows.reduce((sum, r) => sum + pesoDe(r), 0);
    const pesoObtenido = rows.reduce((sum, r) => sum + (r.respuesta ? pesoDe(r) : 0), 0);
    const porcentaje = pesoTotal > 0 ? Math.round((pesoObtenido / pesoTotal) * 100) : 0;
    const passingGrade = enrollment.groups?.courses?.passing_grade ?? 70;
    const competencyResult = porcentaje >= passingGrade ? 'competente' : 'aun_no_competente';

    const { error } = await this.supabase.admin
      .from('enrollments')
      .update({
        final_grade: porcentaje,
        competency_result: competencyResult,
        evaluated_by: user.id,
        evaluated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', enrollmentId);

    if (error) throw new NotFoundException(error.message);
    return { final_grade: porcentaje, competency_result: competencyResult, peso_obtenido: pesoObtenido, peso_total: pesoTotal };
  }
}
