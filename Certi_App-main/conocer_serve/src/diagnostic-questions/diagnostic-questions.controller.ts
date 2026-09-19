import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, Request, UseGuards,
  HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { DiagnosticQuestionsService } from './diagnostic-questions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateDiagnosticQuestionDto } from './dto/create-diagnostic-question.dto';

interface Req extends Request {
  user: { id: string; role: string };
}

@Controller('diagnostic-questions')
@UseGuards(JwtAuthGuard)
export class DiagnosticQuestionsController {
  constructor(private readonly svc: DiagnosticQuestionsService) {}

  /** Banco completo (con respuestas correctas) — evaluador/admin armando el examen. */
  @Get()
  list(@Query('estandar_id', ParseUUIDPipe) estandarId: string) {
    return this.svc.listByEstandar(estandarId);
  }

  /** Versión segura para el candidato que va a contestar (sin respuestas correctas). */
  @Get('exam')
  listForExam(@Query('estandar_id', ParseUUIDPipe) estandarId: string) {
    return this.svc.listForExam(estandarId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateDiagnosticQuestionDto, @Request() req: Req) {
    return this.svc.create(dto, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateDiagnosticQuestionDto>,
    @Request() req: Req,
  ) {
    return this.svc.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.remove(id, req.user);
  }
}
