import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CertificationProcessService, JwtUser } from '../certification-process/certification-process.service';
import { StagesService } from '../certification-process/stages.service';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];
const BUCKET = 'evidences';

/**
 * `evidences` es la entidad principal para las evidencias del proceso (paso
 * "Recopilación de evidencias"). Solo guarda metadatos + ruta en la BD; el
 * archivo vive en el bucket privado de Storage. Un candidato nunca puede ver
 * evidencias de otro (se filtra siempre por el process_id, cuya propiedad ya
 * valida CertificationProcessService.getProcessForActor).
 */
@Injectable()
export class EvidencesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly auditLogs: AuditLogsService,
    private readonly processes: CertificationProcessService,
    private readonly stages: StagesService,
  ) {}

  async upload(
    processId: string,
    file: Express.Multer.File | undefined,
    dto: { evidence_type: string; description?: string },
    user: JwtUser,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Archivo inválido, faltante o de un tipo no soportado (PDF, JPG, PNG, WEBP, MP4 — máx. 20 MB).',
      );
    }
    const process = await this.processes.getProcessForActor(processId, user);
    if (user.role === 'EVALUADOR' && process.evaluator_id !== user.id) {
      throw new ForbiddenException('No puedes subir evidencias a un proceso que no tienes asignado.');
    }
    if (user.role === 'CANDIDATO') {
      const { data: participant } = await this.supabase.admin
        .from('participants').select('user_id').eq('id', process.participant_id).single();
      if (!participant || participant.user_id !== user.id) {
        throw new ForbiddenException('No puedes subir evidencias al expediente de otro candidato.');
      }
    }

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${processId}/${Date.now()}-${safeName}`;

    const { error: uploadErr } = await this.supabase.admin.storage
      .from(BUCKET)
      .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });
    if (uploadErr) {
      throw new ConflictException(
        `No se pudo subir el archivo: ${uploadErr.message}. Verifica que el bucket "${BUCKET}" exista en Supabase Storage.`,
      );
    }

    const { data, error } = await this.supabase.admin
      .from('evidences')
      .insert({
        process_id: processId,
        evidence_type: dto.evidence_type,
        description: dto.description ?? null,
        file_path: storagePath,
        file_name: file.originalname,
        mime_type: file.mimetype,
        size_bytes: file.size,
        captured_at: new Date().toISOString(),
        uploaded_by: user.id,
        status: 'pendiente',
      })
      .select('*')
      .single();

    if (error) {
      await this.supabase.admin.storage.from(BUCKET).remove([storagePath]);
      throw new ConflictException(error.message);
    }

    await this.stages.touchEvidenceStage(processId, user);

    await this.auditLogs.log({
      user_id: user.id,
      action: 'EVIDENCE_UPLOADED',
      entity: 'evidences',
      entityid: data.id,
      metadata: { process_id: processId, evidence_type: dto.evidence_type },
    });

    return data;
  }

  async list(processId: string, user: JwtUser) {
    await this.processes.getProcessForActor(processId, user);
    const { data, error } = await this.supabase.admin
      .from('evidences').select('*').eq('process_id', processId).order('created_at', { ascending: false });
    if (error) throw new NotFoundException(error.message);
    return data ?? [];
  }

  async getSignedUrl(id: string, user: JwtUser) {
    const { data: evidence, error } = await this.supabase.admin
      .from('evidences').select('id, file_path, process_id').eq('id', id).single();
    if (error || !evidence) throw new NotFoundException('Evidencia no encontrada.');
    await this.processes.getProcessForActor(evidence.process_id, user);

    const { data, error: signErr } = await this.supabase.admin.storage
      .from(BUCKET).createSignedUrl(evidence.file_path, 60 * 10);
    if (signErr || !data) throw new NotFoundException('No se pudo generar el enlace del archivo.');
    return { url: data.signedUrl };
  }

  async review(id: string, dto: { status: 'validada' | 'rechazada' | 'requiere_correccion'; notes?: string }, user: JwtUser) {
    const { data: evidence, error } = await this.supabase.admin
      .from('evidences').select('*').eq('id', id).single();
    if (error || !evidence) throw new NotFoundException('Evidencia no encontrada.');

    const process = await this.processes.getProcessForActor(evidence.process_id, user);
    if (!ADMIN_ROLES.includes(user.role) && !(user.role === 'EVALUADOR' && process.evaluator_id === user.id)) {
      throw new ForbiddenException('Solo el evaluador asignado o un administrador puede validar evidencias.');
    }

    const { data: updated, error: updErr } = await this.supabase.admin
      .from('evidences')
      .update({ status: dto.status, notes: dto.notes ?? evidence.notes })
      .eq('id', id)
      .select('*')
      .single();
    if (updErr || !updated) throw new ConflictException('No se pudo actualizar la evidencia.');

    await this.auditLogs.log({
      user_id: user.id,
      action: 'EVIDENCE_REVIEWED',
      entity: 'evidences',
      entityid: id,
      old_data: { status: evidence.status },
      metadata: { status: dto.status, notes: dto.notes },
    });

    return updated;
  }
}
