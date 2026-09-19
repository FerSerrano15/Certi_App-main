// ============================================================
// pdf/pdf.controller.ts
// GET  /api/pdf/ficha-registro/:fichaId → PDF de una ficha de registro
//   (dueño de la ficha o admin)
// ============================================================

import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  UseGuards,
  HttpStatus,
  NotFoundException,
  ForbiddenException,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PdfService } from './pdf.service';
import { SupabaseService } from '../supabase/supabase.service';

interface AuthReq extends Request {
  user: { id: string; role: string };
}

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];

@Controller('pdf')
export class PdfController {
  constructor(
    private readonly pdfSvc: PdfService,
    private readonly supabase: SupabaseService,
  ) {}

  // ── PDF de una ficha de registro (dueño o admin) ──────────────
  @Get('ficha-registro/:fichaId')
  @UseGuards(JwtAuthGuard)
  async getFichaPdf(
    @Param('fichaId', ParseUUIDPipe) fichaId: string,
    @Req() req: AuthReq,
    @Res() res: Response,
  ) {
    const { data: ficha, error } = await this.supabase.admin
      .from('fichas_registro')
      .select('user_id, estandar_codigo, estandar_nombre, form_data, submitted_at, users!user_id ( full_name )')
      .eq('id', fichaId)
      .single<{
        user_id: string;
        estandar_codigo: string;
        estandar_nombre: string;
        form_data: Record<string, any> | null;
        submitted_at: string | null;
        users: { full_name: string } | null;
      }>();

    if (error || !ficha) {
      throw new NotFoundException('Ficha de registro no encontrada.');
    }

    if (ficha.user_id !== req.user.id && !ADMIN_ROLES.includes(req.user.role)) {
      throw new ForbiddenException('No tienes permisos para acceder a esta ficha.');
    }

    const fechaRegistro = ficha.submitted_at
      ? new Date(ficha.submitted_at).toLocaleDateString('es-MX', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
      : '';

    const fullName = ficha.form_data?.['nombreCompleto'] || ficha.users?.full_name || 'ficha-registro';

    const pdfBuffer = await this.pdfSvc.generateFichaRegistroPdf({
      ...ficha.form_data,
      nombreCompleto: ficha.form_data?.['nombreCompleto'] || ficha.users?.full_name,
      estandarCodigo: ficha.estandar_codigo,
      estandarCompetencia: ficha.estandar_nombre,
      fechaRegistro,
    });

    const safeName = fullName
      .normalize('NFD')
      .replace(/[^\x00-\x7F]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase();

    res.status(HttpStatus.OK)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${safeName}.pdf"`,
        'Content-Length': pdfBuffer.length,
      })
      .end(pdfBuffer);
  }

  // ── PDF de la Evaluación Diagnóstica de un proceso (dueño, evaluador asignado, o admin) ──
  @Get('diagnostico/:processId')
  @UseGuards(JwtAuthGuard)
  async getDiagnosticoPdf(
    @Param('processId', ParseUUIDPipe) processId: string,
    @Req() req: AuthReq,
    @Res() res: Response,
  ) {
    const { data: process, error } = await this.supabase.admin
      .from('certification_processes')
      .select('participant_id, estandar_id, evaluator_id, estandares ( codigo, nombre ), participants ( full_name, user_id ), users:evaluator_id ( full_name )')
      .eq('id', processId)
      .single<{
        participant_id: string;
        estandar_id: string;
        evaluator_id: string;
        estandares: { codigo: string; nombre: string } | null;
        participants: { full_name: string; user_id: string } | null;
        users: { full_name: string } | null;
      }>();
    if (error || !process) throw new NotFoundException('Proceso de certificación no encontrado.');

    const isOwner = process.participants?.user_id === req.user.id;
    const isEvaluador = process.evaluator_id === req.user.id;
    if (!isOwner && !isEvaluador && !ADMIN_ROLES.includes(req.user.role)) {
      throw new ForbiddenException('No tienes permisos para acceder a este diagnóstico.');
    }

    const { data: diagnostic } = await this.supabase.admin
      .from('diagnostics').select('*').eq('process_id', processId).maybeSingle<{
        result: string | null;
        observations: string | null;
        data: Record<string, any> | null;
      }>();
    if (!diagnostic) throw new NotFoundException('Este proceso todavía no tiene un diagnóstico registrado.');

    const modality = diagnostic.data?.['modality'] as 'presencial' | 'en_linea' | undefined;

    let questions: any[] = [];
    if (modality === 'en_linea') {
      const { data: q } = await this.supabase.admin
        .from('diagnostic_questions').select('*').eq('estandar_id', process.estandar_id).order('order_index');
      questions = q ?? [];
    }

    let photoUrl: string | null = null;
    if (modality === 'presencial') {
      const { data: evidence } = await this.supabase.admin
        .from('evidences')
        .select('file_path, mime_type')
        .eq('process_id', processId)
        .eq('evidence_type', 'diagnostico')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle<{ file_path: string; mime_type: string | null }>();

      if (evidence) {
        const { data: fileBlob } = await this.supabase.admin.storage.from('evidences').download(evidence.file_path);
        if (fileBlob) {
          const buffer = Buffer.from(await fileBlob.arrayBuffer());
          const mime = evidence.mime_type || 'image/jpeg';
          photoUrl = `data:${mime};base64,${buffer.toString('base64')}`;
        }
      }
    }

    const pdfBuffer = await this.pdfSvc.generateDiagnosticoPdf({
      estandarCodigo: process.estandares?.codigo ?? '',
      estandarNombre: process.estandares?.nombre ?? '',
      nombreCandidato: process.participants?.full_name ?? '',
      evaluatorName: process.users?.full_name ?? '',
      lugar: diagnostic.data?.['lugar'] ?? '',
      fechaAplicacion: diagnostic.data?.['submitted_at']
        ? new Date(diagnostic.data['submitted_at']).toLocaleDateString('es-MX')
        : new Date().toLocaleDateString('es-MX'),
      modality: modality ?? 'presencial',
      questions,
      answers: diagnostic.data?.['answers'] ?? [],
      calificacion: diagnostic.data?.['calificacion'],
      abiertaGrades: diagnostic.data?.['abierta_grades'] ?? [],
      result: diagnostic.result,
      observations: diagnostic.observations,
      decision: diagnostic.data?.['decision'],
      candidateSignature: diagnostic.data?.['candidate_signature'],
      evaluatorSignature: diagnostic.data?.['evaluator_signature'],
      photoUrl,
    });

    const safeName = (process.participants?.full_name ?? 'diagnostico')
      .normalize('NFD')
      .replace(/[^\x00-\x7F]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase();

    res.status(HttpStatus.OK)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="diagnostico-${safeName}.pdf"`,
        'Content-Length': pdfBuffer.length,
      })
      .end(pdfBuffer);
  }
}
