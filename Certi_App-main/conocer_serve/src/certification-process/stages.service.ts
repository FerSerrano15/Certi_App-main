import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CertificationProcessService, JwtUser } from './certification-process.service';
import { AcceptRightsDto } from './dto/accept-rights.dto';
import { SaveDiagnosticDto } from './dto/save-diagnostic.dto';
import { SignCommitmentDto } from './dto/sign-commitment.dto';
import { SavePlanDto } from './dto/save-plan.dto';
import { ReviewPlanDto } from './dto/review-plan.dto';
import { CompleteGenericStageDto } from './dto/complete-generic-stage.dto';
import { BulkReactivosDto } from './dto/bulk-reactivos.dto';
import { CloseCedulaDto } from './dto/close-cedula.dto';
import { EmitJudgmentDto } from './dto/emit-judgment.dto';
import { PresentResultsDto } from './dto/present-results.dto';
import { SubmitSurveyDto } from './dto/submit-survey.dto';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];

@Injectable()
export class StagesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly auditLogs: AuditLogsService,
    private readonly processes: CertificationProcessService,
  ) {}

  // ════════════════════════════════════════════════════════════════════════
  //  Helper genérico de etapa — todas las acciones pasan por aquí para que
  //  el rastro (quién / cuándo / antes / después) quede siempre en
  //  certification_process_stages + audit_logs, nunca solo en un jsonb.
  // ════════════════════════════════════════════════════════════════════════

  private async getStageRow(processId: string, stageCode: string) {
    const { data, error } = await this.supabase.admin
      .from('certification_process_stages')
      .select('*')
      .eq('process_id', processId)
      .eq('stage_code', stageCode)
      .single();
    if (error || !data) throw new NotFoundException(`Etapa "${stageCode}" no encontrada para este proceso.`);
    return data;
  }

  async markStage(
    processId: string,
    stageCode: string,
    status: 'in_progress' | 'completed' | 'skipped',
    user: JwtUser,
    notes?: string,
    metadata?: Record<string, unknown>,
  ) {
    const stage = await this.getStageRow(processId, stageCode);
    if (stage.status === 'completed' && !ADMIN_ROLES.includes(user.role)) {
      throw new ConflictException('Esta etapa ya está completada. Solo un administrador puede reabrirla.');
    }
    const now = new Date().toISOString();
    const update: Record<string, unknown> = { status };
    if (!stage.started_at) update.started_at = now;
    if (status === 'completed') {
      update.completed_at = now;
      update.completed_by = user.id;
    }
    if (notes !== undefined) update.notes = notes;
    if (metadata !== undefined) update.metadata = metadata;

    const { data, error } = await this.supabase.admin
      .from('certification_process_stages')
      .update(update)
      .eq('id', stage.id)
      .select('*')
      .single();
    if (error || !data) throw new ConflictException('No se pudo actualizar la etapa.');

    await this.auditLogs.log({
      user_id: user.id,
      action: `STAGE_${status.toUpperCase()}`,
      entity: 'certification_process_stages',
      entityid: stage.id,
      old_data: { status: stage.status },
      metadata: { stage_code: stageCode, status, process_id: processId },
    });
    return data;
  }

  private requireEvaluatorOrAdmin(process: { evaluator_id: string }, user: JwtUser) {
    if (ADMIN_ROLES.includes(user.role)) return;
    if (user.role === 'EVALUADOR' && process.evaluator_id === user.id) return;
    throw new ForbiddenException('Solo el evaluador asignado (o un administrador) puede realizar esta acción.');
  }

  private async requireCandidateOwner(process: { participant_id: string }, user: JwtUser) {
    if (ADMIN_ROLES.includes(user.role)) return;
    if (user.role !== 'CANDIDATO') {
      throw new ForbiddenException('Solo el candidato dueño del expediente puede realizar esta acción.');
    }
    const { data: participant } = await this.supabase.admin
      .from('participants').select('user_id').eq('id', process.participant_id).single();
    if (!participant || participant.user_id !== user.id) {
      throw new ForbiddenException('No puedes actuar sobre el expediente de otro candidato.');
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  1) RECIBO DE DERECHOS Y OBLIGACIONES — CANDIDATO
  // ════════════════════════════════════════════════════════════════════════

  async getRights(processId: string, user: JwtUser) {
    await this.processes.getProcessForActor(processId, user);
    const { data } = await this.supabase.admin
      .from('process_rights_obligations').select('*').eq('process_id', processId).maybeSingle();
    return data ?? { process_id: processId, accepted: false, content: {} };
  }

  async acceptRights(processId: string, dto: AcceptRightsDto, user: JwtUser) {
    const process = await this.processes.getProcessForActor(processId, user);
    await this.requireCandidateOwner(process, user);

    const now = new Date().toISOString();
    const { data, error } = await this.supabase.admin
      .from('process_rights_obligations')
      .upsert({
        process_id: processId,
        accepted: dto.accepted,
        content: dto.content ?? {},
        accepted_at: dto.accepted ? now : null,
        accepted_by: dto.accepted ? user.id : null,
      }, { onConflict: 'process_id' })
      .select('*')
      .single();
    if (error) throw new ConflictException(error.message);

    await this.markStage(processId, 'DERECHOS_OBLIGACIONES', dto.accepted ? 'completed' : 'in_progress', user);
    return data;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  2) DIAGNÓSTICO — EVALUADOR
  // ════════════════════════════════════════════════════════════════════════

  async getDiagnostic(processId: string, user: JwtUser) {
    await this.processes.getProcessForActor(processId, user);
    const { data } = await this.supabase.admin
      .from('diagnostics').select('*').eq('process_id', processId).maybeSingle();
    return data ?? null;
  }

  async saveDiagnostic(processId: string, dto: SaveDiagnosticDto, user: JwtUser) {
    const process = await this.processes.getProcessForActor(processId, user);
    this.requireEvaluatorOrAdmin(process, user);

    const { data, error } = await this.supabase.admin
      .from('diagnostics')
      .upsert({
        process_id: processId,
        result: dto.result ?? null,
        observations: dto.observations ?? null,
        data: dto.data ?? {},
        applied_at: new Date().toISOString(),
        applied_by: user.id,
      }, { onConflict: 'process_id' })
      .select('*')
      .single();
    if (error) throw new ConflictException(error.message);

    await this.markStage(processId, 'DIAGNOSTICO', 'completed', user, dto.observations);
    if (process.status === 'PREPARACION') {
      await this.processes.advanceStatus(processId, 'DIAGNOSTICO', user);
    }
    return data;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  3) CARTA COMPROMISO — CANDIDATO
  // ════════════════════════════════════════════════════════════════════════

  async getCommitment(processId: string, user: JwtUser) {
    await this.processes.getProcessForActor(processId, user);
    const { data } = await this.supabase.admin
      .from('commitment_letters').select('*').eq('process_id', processId).maybeSingle();
    return data ?? null;
  }

  async signCommitment(processId: string, dto: SignCommitmentDto, user: JwtUser) {
    const process = await this.processes.getProcessForActor(processId, user);
    await this.requireCandidateOwner(process, user);

    const now = new Date().toISOString();
    const { data, error } = await this.supabase.admin
      .from('commitment_letters')
      .upsert({
        process_id: processId,
        content: dto.content ?? null,
        signed: dto.signed,
        signed_at: dto.signed ? now : null,
        signature_path: dto.signature_path ?? null,
        signed_by: dto.signed ? user.id : null,
      }, { onConflict: 'process_id' })
      .select('*')
      .single();
    if (error) throw new ConflictException(error.message);

    await this.markStage(processId, 'CARTA_COMPROMISO', dto.signed ? 'completed' : 'in_progress', user);
    return data;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  4) PLAN DE EVALUACIÓN — EVALUADOR propone, ADMIN aprueba (límites de ADMIN)
  // ════════════════════════════════════════════════════════════════════════

  async getPlan(processId: string, user: JwtUser) {
    await this.processes.getProcessForActor(processId, user);
    const { data } = await this.supabase.admin
      .from('evaluation_plans').select('*').eq('process_id', processId).maybeSingle();
    return data ?? null;
  }

  async savePlan(processId: string, dto: SavePlanDto, user: JwtUser) {
    const process = await this.processes.getProcessForActor(processId, user);
    this.requireEvaluatorOrAdmin(process, user);

    const { data, error } = await this.supabase.admin
      .from('evaluation_plans')
      .upsert({
        process_id: processId,
        planned_start: dto.planned_start ?? null,
        planned_end: dto.planned_end ?? null,
        location: dto.location ?? null,
        modality: dto.modality ?? null,
        criteria: dto.criteria ?? {},
        evaluator_id: process.evaluator_id,
        status: dto.submit ? 'propuesto' : 'borrador',
        observations: dto.observations ?? null,
      }, { onConflict: 'process_id' })
      .select('*')
      .single();
    if (error) throw new ConflictException(error.message);

    await this.markStage(processId, 'PLAN_EVALUACION', 'in_progress', user, dto.submit ? 'Plan enviado a revisión de ADMIN.' : undefined);
    return data;
  }

  async reviewPlan(processId: string, dto: ReviewPlanDto, user: JwtUser) {
    this.processes.getProcessRaw(processId); // valida que exista
    if (!ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('Solo un administrador puede aprobar o rechazar el plan de evaluación.');
    }
    const { data: current } = await this.supabase.admin
      .from('evaluation_plans').select('*').eq('process_id', processId).maybeSingle();
    if (!current) throw new NotFoundException('El evaluador aún no ha propuesto un plan de evaluación.');

    const now = new Date().toISOString();
    const { data, error } = await this.supabase.admin
      .from('evaluation_plans')
      .update({
        status: dto.approve ? 'aprobado' : 'rechazado',
        approved_at: dto.approve ? now : null,
        approved_by: dto.approve ? user.id : null,
        observations: dto.observations ?? current.observations,
      })
      .eq('process_id', processId)
      .select('*')
      .single();
    if (error) throw new ConflictException(error.message);

    await this.markStage(processId, 'PLAN_EVALUACION', dto.approve ? 'completed' : 'in_progress', user, dto.observations);

    if (dto.approve) {
      const process = await this.processes.getProcessRaw(processId);
      if (['PREPARACION', 'DIAGNOSTICO'].includes(process.status)) {
        await this.processes.advanceStatus(processId, 'EVALUACION', user);
      }
    }
    return data;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  5) PREPARACIÓN DE LA EVALUACIÓN — etapa operativa sin tabla propia
  // ════════════════════════════════════════════════════════════════════════

  async completePreparacion(processId: string, dto: CompleteGenericStageDto, user: JwtUser) {
    const process = await this.processes.getProcessForActor(processId, user);
    this.requireEvaluatorOrAdmin(process, user);
    return this.markStage(processId, 'PREPARACION_EVALUACION', 'completed', user, dto.notes, dto.metadata);
  }

  /** Usado por EvidencesService al recibir la primera evidencia de un proceso. */
  async touchEvidenceStage(processId: string, user: JwtUser) {
    const stage = await this.getStageRow(processId, 'RECOPILACION_EVIDENCIAS');
    if (stage.status === 'pending') {
      await this.markStage(processId, 'RECOPILACION_EVIDENCIAS', 'in_progress', user);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  6) RECOPILACIÓN DE EVIDENCIAS — cierre de la etapa (la carga vive en
  //     EvidencesService/EvidencesController, tabla `evidences`)
  // ════════════════════════════════════════════════════════════════════════

  async completeEvidenceStage(processId: string, user: JwtUser) {
    const process = await this.processes.getProcessForActor(processId, user);
    this.requireEvaluatorOrAdmin(process, user);

    const { data: evidences } = await this.supabase.admin
      .from('evidences').select('status').eq('process_id', processId);
    const rows = evidences ?? [];
    if (!rows.length) {
      throw new ConflictException('No se han registrado evidencias para este proceso.');
    }
    if (rows.some((e: { status: string }) => e.status === 'pendiente')) {
      throw new ConflictException('Hay evidencias pendientes de validar.');
    }
    if (!rows.some((e: { status: string }) => e.status === 'validada')) {
      throw new ConflictException('Debe existir al menos una evidencia validada.');
    }
    return this.markStage(processId, 'RECOPILACION_EVIDENCIAS', 'completed', user);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  7) INSTRUMENTO DE EVALUACIÓN — evaluation_reactivos (sin UNIQUE en BD,
  //     así que el upsert se hace a mano: SELECT existentes, split insert/update)
  // ════════════════════════════════════════════════════════════════════════

  private async vigentReactivoIds(estandarId: string): Promise<string[]> {
    const { data: guias } = await this.supabase.admin
      .from('guias_observacion')
      .select('id, reactivos ( id )')
      .eq('estandar_id', estandarId)
      .eq('vigente', true);
    return (guias ?? []).flatMap((g: any) => (g.reactivos ?? []).map((r: any) => r.id));
  }

  async getInstrument(processId: string, user: JwtUser) {
    const process = await this.processes.getProcessForActor(processId, user);
    const { data, error } = await this.supabase.admin
      .from('evaluation_reactivos')
      .select(`
        *,
        reactivos (
          id, codigo_reactivo, descripcion, peso, es_actitud_valor, orden,
          guias_observacion ( id, titulo, orden, instrucciones, vigente )
        )
      `)
      .eq('process_id', processId);
    if (error) throw new ConflictException(error.message);

    const rows = (data ?? []) as any[];
    rows.sort((a, b) => {
      const gOrdA = a.reactivos?.guias_observacion?.orden ?? 0;
      const gOrdB = b.reactivos?.guias_observacion?.orden ?? 0;
      if (gOrdA !== gOrdB) return gOrdA - gOrdB;
      return (a.reactivos?.orden ?? 0) - (b.reactivos?.orden ?? 0);
    });
    return rows;
  }

  async initInstrument(processId: string, user: JwtUser) {
    const process = await this.processes.getProcessForActor(processId, user);
    this.requireEvaluatorOrAdmin(process, user);

    const reactivoIds = await this.vigentReactivoIds(process.estandar_id);
    if (!reactivoIds.length) {
      throw new ConflictException('El estándar no tiene reactivos configurados en una guía vigente.');
    }

    const { data: existing } = await this.supabase.admin
      .from('evaluation_reactivos').select('reactivo_id').eq('process_id', processId);
    const existingIds = new Set((existing ?? []).map((e: { reactivo_id: string }) => e.reactivo_id));
    const toInsert = reactivoIds
      .filter((id) => !existingIds.has(id))
      .map((id) => ({ process_id: processId, reactivo_id: id, respuesta: null }));

    if (toInsert.length) {
      const { error } = await this.supabase.admin.from('evaluation_reactivos').insert(toInsert);
      if (error) throw new ConflictException(error.message);
    }

    await this.markStage(processId, 'INSTRUMENTO_EVALUACION', 'in_progress', user);
    return { created: toInsert.length };
  }

  async bulkSaveReactivos(processId: string, dto: BulkReactivosDto, user: JwtUser) {
    const process = await this.processes.getProcessForActor(processId, user);
    this.requireEvaluatorOrAdmin(process, user);

    const reactivoIds = dto.records.map((r) => r.reactivo_id);
    const { data: existing } = await this.supabase.admin
      .from('evaluation_reactivos')
      .select('id, reactivo_id')
      .eq('process_id', processId)
      .in('reactivo_id', reactivoIds);
    const existingMap = new Map((existing ?? []).map((e: { id: string; reactivo_id: string }) => [e.reactivo_id, e.id]));

    const now = new Date().toISOString();
    const toInsert = dto.records
      .filter((r) => !existingMap.has(r.reactivo_id))
      .map((r) => ({
        process_id: processId,
        reactivo_id: r.reactivo_id,
        respuesta: r.respuesta ?? null,
        observaciones: r.observaciones ?? null,
        evaluated_by: user.id,
        evaluated_at: now,
      }));
    const toUpdate = dto.records.filter((r) => existingMap.has(r.reactivo_id));

    if (toInsert.length) {
      const { error } = await this.supabase.admin.from('evaluation_reactivos').insert(toInsert);
      if (error) throw new ConflictException(error.message);
    }
    for (const r of toUpdate) {
      await this.supabase.admin
        .from('evaluation_reactivos')
        .update({ respuesta: r.respuesta ?? null, observaciones: r.observaciones ?? null, evaluated_by: user.id, evaluated_at: now })
        .eq('id', existingMap.get(r.reactivo_id));
    }

    const allReactivoIds = await this.vigentReactivoIds(process.estandar_id);
    const { data: allRows } = await this.supabase.admin
      .from('evaluation_reactivos').select('reactivo_id, respuesta').eq('process_id', processId);
    const answered = new Set((allRows ?? []).filter((r: any) => r.respuesta !== null).map((r: any) => r.reactivo_id));
    const complete = allReactivoIds.length > 0 && allReactivoIds.every((id) => answered.has(id));

    await this.markStage(processId, 'INSTRUMENTO_EVALUACION', complete ? 'completed' : 'in_progress', user);
    return this.getInstrument(processId, user);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  8) CÉDULA DE EVALUACIÓN — cierre formal, un solo registro por proceso
  // ════════════════════════════════════════════════════════════════════════

  async getCedula(processId: string, user: JwtUser) {
    await this.processes.getProcessForActor(processId, user);
    const { data } = await this.supabase.admin
      .from('evaluation_cedulas').select('*').eq('process_id', processId).maybeSingle();
    return data ?? null;
  }

  async closeCedula(processId: string, dto: CloseCedulaDto, user: JwtUser) {
    const process = await this.processes.getProcessForActor(processId, user);
    this.requireEvaluatorOrAdmin(process, user);

    const { data: rows, error } = await this.supabase.admin
      .from('evaluation_reactivos')
      .select('respuesta, reactivos ( peso )')
      .eq('process_id', processId);
    if (error) throw new ConflictException(error.message);

    const list = (rows ?? []) as unknown as { respuesta: boolean | null; reactivos: { peso: number } | { peso: number }[] | null }[];
    if (!list.length || list.some((r) => r.respuesta === null)) {
      throw new ConflictException('No se puede cerrar la cédula: faltan reactivos por responder en el instrumento de evaluación.');
    }
    const pesoDe = (r: (typeof list)[number]) => Array.isArray(r.reactivos) ? (r.reactivos[0]?.peso ?? 0) : (r.reactivos?.peso ?? 0);
    const pesoTotal = list.reduce((sum, r) => sum + pesoDe(r), 0);
    const pesoObtenido = list.reduce((sum, r) => sum + (r.respuesta ? pesoDe(r) : 0), 0);
    const porcentaje = pesoTotal > 0 ? Math.round((pesoObtenido / pesoTotal) * 10000) / 100 : 0;

    const { data, error: upsertErr } = await this.supabase.admin
      .from('evaluation_cedulas')
      .upsert({
        process_id: processId,
        total_score: porcentaje,
        observations: dto.observations ?? null,
        generated_at: new Date().toISOString(),
        generated_by: user.id,
        data: { peso_obtenido: pesoObtenido, peso_total: pesoTotal },
      }, { onConflict: 'process_id' })
      .select('*')
      .single();
    if (upsertErr) throw new ConflictException(upsertErr.message);

    await this.markStage(processId, 'CEDULA_EVALUACION', 'completed', user, dto.observations);
    return data;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Requisitos obligatorios antes de permitir dictamen COMPETENTE
  // ════════════════════════════════════════════════════════════════════════

  async checkReadinessForCompetente(processId: string): Promise<{ ready: boolean; missing: string[] }> {
    const process = await this.processes.getProcessRaw(processId);
    const missing: string[] = [];

    const reactivoIds = await this.vigentReactivoIds(process.estandar_id);
    if (!reactivoIds.length) missing.push('El estándar no tiene reactivos configurados en una guía vigente.');

    const { data: answered } = await this.supabase.admin
      .from('evaluation_reactivos').select('reactivo_id, respuesta').eq('process_id', processId);
    const answeredIds = new Set((answered ?? []).filter((r: any) => r.respuesta !== null).map((r: any) => r.reactivo_id));
    if (reactivoIds.length && !reactivoIds.every((id) => answeredIds.has(id))) {
      missing.push('Faltan reactivos por responder en el instrumento de evaluación.');
    }

    const { data: cedula } = await this.supabase.admin
      .from('evaluation_cedulas').select('generated_at').eq('process_id', processId).maybeSingle();
    if (!cedula || !cedula.generated_at) missing.push('La cédula de evaluación no ha sido cerrada.');

    const { data: evidences } = await this.supabase.admin
      .from('evidences').select('status').eq('process_id', processId);
    const evRows = evidences ?? [];
    if (!evRows.length) missing.push('No se han registrado evidencias.');
    if (evRows.some((e: { status: string }) => e.status === 'pendiente')) missing.push('Hay evidencias pendientes de validar.');
    if (evRows.length && !evRows.some((e: { status: string }) => e.status === 'validada')) missing.push('No hay evidencias validadas.');

    const { data: plan } = await this.supabase.admin
      .from('evaluation_plans').select('status').eq('process_id', processId).maybeSingle();
    if (!plan || plan.status !== 'aprobado') missing.push('El plan de evaluación no ha sido aprobado por el administrador.');

    const { data: rights } = await this.supabase.admin
      .from('process_rights_obligations').select('accepted').eq('process_id', processId).maybeSingle();
    if (!rights || !rights.accepted) missing.push('El candidato no ha aceptado el recibo de derechos y obligaciones (bloqueo administrativo).');

    const { data: commitment } = await this.supabase.admin
      .from('commitment_letters').select('signed').eq('process_id', processId).maybeSingle();
    if (!commitment || !commitment.signed) missing.push('La carta compromiso no ha sido firmada (bloqueo administrativo).');

    return { ready: missing.length === 0, missing };
  }

  // ════════════════════════════════════════════════════════════════════════
  //  9) EMISIÓN DE JUICIO — solo el EVALUADOR asignado (ni siquiera ADMIN)
  // ════════════════════════════════════════════════════════════════════════

  async emitJudgment(processId: string, dto: EmitJudgmentDto, user: JwtUser) {
    const process = await this.processes.getProcessForActor(processId, user);
    if (user.role !== 'EVALUADOR' || process.evaluator_id !== user.id) {
      throw new ForbiddenException('Solo el evaluador asignado puede emitir el juicio de este proceso.');
    }

    if (dto.result === 'competente') {
      const { ready, missing } = await this.checkReadinessForCompetente(processId);
      if (!ready) {
        throw new ConflictException(
          `No se puede emitir COMPETENTE: faltan requisitos obligatorios — ${missing.join(' | ')}`,
        );
      }
    }

    const { data, error } = await this.supabase.admin
      .from('process_judgments')
      .upsert({
        process_id: processId,
        result: dto.result,
        final_score: dto.final_score ?? null,
        observations: dto.observations ?? null,
        issued_at: new Date().toISOString(),
        issued_by: user.id,
      }, { onConflict: 'process_id' })
      .select('*')
      .single();
    if (error) throw new ConflictException(error.message);

    await this.markStage(processId, 'EMISION_JUICIO', 'completed', user, dto.observations);
    await this.processes.advanceStatus(processId, dto.result === 'competente' ? 'DICTAMEN' : 'AUN_NO_COMPETENTE', user, {
      completed_at: dto.result === 'aun_no_competente' ? new Date().toISOString() : null,
    });

    return data;
  }

  async getJudgment(processId: string, user: JwtUser) {
    await this.processes.getProcessForActor(processId, user);
    const { data } = await this.supabase.admin
      .from('process_judgments').select('*').eq('process_id', processId).maybeSingle();
    return data ?? null;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  10) PRESENTACIÓN DE RESULTADOS — EVALUADOR
  // ════════════════════════════════════════════════════════════════════════

  async presentResults(processId: string, dto: PresentResultsDto, user: JwtUser) {
    const process = await this.processes.getProcessForActor(processId, user);
    this.requireEvaluatorOrAdmin(process, user);

    const { data: judgment } = await this.supabase.admin
      .from('process_judgments').select('result').eq('process_id', processId).maybeSingle();
    if (!judgment) {
      throw new ConflictException('No se pueden presentar resultados: el juicio aún no ha sido emitido.');
    }

    const { data, error } = await this.supabase.admin
      .from('results_presentations')
      .upsert({
        process_id: processId,
        presented_at: new Date().toISOString(),
        presented_by: user.id,
        participant_accepted: dto.participant_accepted,
        observations: dto.observations ?? null,
      }, { onConflict: 'process_id' })
      .select('*')
      .single();
    if (error) throw new ConflictException(error.message);

    await this.markStage(processId, 'PRESENTACION_RESULTADOS', 'completed', user, dto.observations);
    if (process.status === 'DICTAMEN') {
      await this.processes.advanceStatus(processId, 'RESULTADOS', user);
    }
    return data;
  }

  async getResultsPresentation(processId: string, user: JwtUser) {
    await this.processes.getProcessForActor(processId, user);
    const { data } = await this.supabase.admin
      .from('results_presentations').select('*').eq('process_id', processId).maybeSingle();
    return data ?? null;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  12/13) ENCUESTAS — CANDIDATO
  // ════════════════════════════════════════════════════════════════════════

  async submitSurvey(processId: string, dto: SubmitSurveyDto, user: JwtUser) {
    const process = await this.processes.getProcessForActor(processId, user);
    await this.requireCandidateOwner(process, user);

    const { data: survey, error: surveyErr } = await this.supabase.admin
      .from('survey_definitions').select('id').eq('code', dto.survey_code).eq('is_active', true).single();
    if (surveyErr || !survey) throw new NotFoundException('Encuesta no encontrada o inactiva.');

    const { data, error } = await this.supabase.admin
      .from('survey_responses')
      .insert({
        process_id: processId,
        survey_definition_id: survey.id,
        respondent_user_id: user.id,
        responses: dto.responses,
      })
      .select('*')
      .single();
    if (error) throw new ConflictException(error.message);

    await this.markStage(processId, dto.survey_code, 'completed', user);
    return data;
  }

  async getSurveyResponses(processId: string, user: JwtUser) {
    await this.processes.getProcessForActor(processId, user);
    const { data } = await this.supabase.admin
      .from('survey_responses').select('*, survey_definitions ( code, name )').eq('process_id', processId);
    return data ?? [];
  }
}
