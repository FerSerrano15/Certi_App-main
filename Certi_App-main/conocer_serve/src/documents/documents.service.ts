import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ParticipantsService } from '../participants/participants.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

type JwtUser = { id: string; role: string; institution_id: string | null; email: string };
type ParticipantRow = { id: string; institution_id: string | null; user_id: string | null };

const BUCKET = 'documents';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly participants: ParticipantsService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  private requireAdmin(user: JwtUser) {
    if (!['SUPER_ADMIN', 'ADMIN_INSTITUCION', 'COORDINADOR'].includes(user.role)) {
      throw new ForbiddenException('No tienes permisos para esta acción.');
    }
  }

  private requireAtLeastCoordinator(user: JwtUser) {
    if (!['SUPER_ADMIN', 'ADMIN_INSTITUCION', 'COORDINADOR', 'INSTRUCTOR'].includes(user.role)) {
      throw new ForbiddenException('No tienes permisos para esta acción.');
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  UPLOAD
  // ════════════════════════════════════════════════════════════════════════════

  /** El propio candidato (OPERADOR) sube un documento suyo. */
  async uploadSelf(file: Express.Multer.File | undefined, type: string, user: JwtUser) {
    if (user.role !== 'OPERADOR') {
      throw new ForbiddenException('Esta acción es solo para candidatos.');
    }
    const participant = await this.participants.resolveOrCreateSelfParticipant(user);
    return this.storeDocument(file, type, participant, user);
  }

  /** Un admin sube un documento en nombre de un candidato. */
  async uploadForParticipant(
    file: Express.Multer.File | undefined,
    dto: { type: string; participant_id: string },
    user: JwtUser,
  ) {
    this.requireAdmin(user);
    const { data: participant, error } = await this.supabase.admin
      .from('participants')
      .select('id, institution_id, user_id')
      .eq('id', dto.participant_id)
      .single<ParticipantRow>();
    if (error || !participant) throw new NotFoundException('Participante no encontrado.');
    return this.storeDocument(file, dto.type, participant, user);
  }

  private async storeDocument(
    file: Express.Multer.File | undefined,
    type: string,
    participant: ParticipantRow,
    user: JwtUser,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Archivo inválido, faltante o de un tipo no soportado (solo PDF, JPG, PNG — máx. 10 MB).',
      );
    }

    const institutionId = participant.institution_id ?? user.institution_id;
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${institutionId ?? 'sin-institucion'}/${participant.id}/${Date.now()}-${safeName}`;

    const { error: uploadErr } = await this.supabase.admin.storage
      .from(BUCKET)
      .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });
    if (uploadErr) {
      throw new ConflictException(
        `No se pudo subir el archivo: ${uploadErr.message}. Verifica que el bucket "${BUCKET}" exista en Supabase Storage.`,
      );
    }

    const { data, error } = await this.supabase.admin
      .from('documents')
      .insert({
        institution_id: institutionId,
        participant_id: participant.id,
        type,
        file_path: storagePath,
        file_name: file.originalname,
        mime_type: file.mimetype,
        size_bytes: file.size,
        status: 'pending',
      })
      .select('*')
      .single();

    if (error) {
      // Limpieza best-effort si falla el insert después de subir el archivo
      await this.supabase.admin.storage.from(BUCKET).remove([storagePath]);
      throw new ConflictException(error.message);
    }

    await this.auditLogs.log({
      user_id: user.id,
      institution_id: institutionId,
      action: 'DOCUMENT_UPLOADED',
      entity: 'documents',
      entityid: data.id,
      metadata: { type, participant_id: participant.id },
    });

    return data;
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  LIST / GET
  // ════════════════════════════════════════════════════════════════════════════

  async list(user: JwtUser, participantId?: string) {
    let q = this.supabase.admin
      .from('documents')
      .select('*, participants ( id, full_name, email )')
      .order('uploaded_at', { ascending: false });

    if (user.role === 'OPERADOR') {
      // Un candidato solo puede ver sus propios documentos, sin importar el query param.
      const own = await this.participants.resolveOrCreateSelfParticipant(user);
      q = q.eq('participant_id', own.id);
    } else {
      this.requireAtLeastCoordinator(user);
      if (participantId) q = q.eq('participant_id', participantId);
      if (user.role !== 'SUPER_ADMIN' && user.institution_id) {
        q = q.eq('institution_id', user.institution_id);
      }
    }

    const { data, error } = await q;
    if (error) throw new NotFoundException(error.message);
    return data ?? [];
  }

  async getSignedUrl(id: string, user: JwtUser) {
    const { data: doc, error } = await this.supabase.admin
      .from('documents')
      .select('id, file_path, participant_id')
      .eq('id', id)
      .single<{ id: string; file_path: string; participant_id: string | null }>();
    if (error || !doc) throw new NotFoundException('Documento no encontrado.');

    if (user.role === 'OPERADOR') {
      const own = await this.participants.resolveOrCreateSelfParticipant(user);
      if (doc.participant_id !== own.id) {
        throw new ForbiddenException('No puedes ver este documento.');
      }
    } else {
      this.requireAtLeastCoordinator(user);
    }

    const { data, error: signErr } = await this.supabase.admin.storage
      .from(BUCKET)
      .createSignedUrl(doc.file_path, 60 * 10); // 10 minutos
    if (signErr || !data) throw new NotFoundException('No se pudo generar el enlace del archivo.');
    return { url: data.signedUrl };
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  VALIDAR / RECHAZAR
  // ════════════════════════════════════════════════════════════════════════════

  async updateStatus(id: string, status: 'validated' | 'rejected', user: JwtUser) {
    this.requireAdmin(user);
    const { data, error } = await this.supabase.admin
      .from('documents')
      .update({ status, reviewed_by: user.id })
      .eq('id', id)
      .select('*')
      .single();
    if (error || !data) throw new NotFoundException('Documento no encontrado.');

    await this.auditLogs.log({
      user_id: user.id,
      institution_id: user.institution_id,
      action: status === 'validated' ? 'DOCUMENT_VALIDATED' : 'DOCUMENT_REJECTED',
      entity: 'documents',
      entityid: id,
    });

    return data;
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  DELETE
  // ════════════════════════════════════════════════════════════════════════════

  async remove(id: string, user: JwtUser) {
    this.requireAdmin(user);
    const { data: doc } = await this.supabase.admin
      .from('documents')
      .select('file_path')
      .eq('id', id)
      .single<{ file_path: string }>();
    if (!doc) throw new NotFoundException('Documento no encontrado.');

    await this.supabase.admin.storage.from(BUCKET).remove([doc.file_path]);
    const { error } = await this.supabase.admin.from('documents').delete().eq('id', id);
    if (error) throw new NotFoundException(error.message);

    await this.auditLogs.log({
      user_id: user.id, institution_id: user.institution_id,
      action: 'DOCUMENT_DELETED', entity: 'documents', entityid: id,
    });

    return { message: 'Documento eliminado.' };
  }
}
