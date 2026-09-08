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
      .select('user_id, estandar_codigo, estandar_nombre, form_data, submitted_at, users ( full_name )')
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
}
