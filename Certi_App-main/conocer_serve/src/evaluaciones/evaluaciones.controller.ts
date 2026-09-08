import {
  Controller, Get, Post,
  Body, Param, Query, Request, UseGuards,
  HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { EvaluacionesService } from './evaluaciones.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BulkEvaluacionDto } from './dto/bulk-evaluacion.dto';

interface Req extends Request {
  user: { id: string; role: string };
}

@Controller('evaluaciones')
@UseGuards(JwtAuthGuard)
export class EvaluacionesController {
  constructor(private readonly svc: EvaluacionesService) {}

  /** GET /evaluaciones?enrollment_id=xxx — respuestas de una inscripción */
  @Get()
  getByEnrollment(@Query('enrollment_id') enrollmentId: string, @Request() req: Req) {
    return this.svc.getByEnrollment(enrollmentId, req.user);
  }

  /** POST /evaluaciones/init/:enrollmentId — crea filas vacías para cada reactivo */
  @Post('init/:enrollmentId')
  @HttpCode(HttpStatus.CREATED)
  init(@Param('enrollmentId', ParseUUIDPipe) enrollmentId: string, @Request() req: Req) {
    return this.svc.init(enrollmentId, req.user);
  }

  /** POST /evaluaciones/bulk — guarda respuestas en lote */
  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  bulk(@Body() dto: BulkEvaluacionDto, @Request() req: Req) {
    return this.svc.bulkUpsert(dto, req.user);
  }

  /** POST /evaluaciones/recalculate/:enrollmentId — calcula el resultado final */
  @Post('recalculate/:enrollmentId')
  recalculate(@Param('enrollmentId', ParseUUIDPipe) enrollmentId: string, @Request() req: Req) {
    return this.svc.recalculate(enrollmentId, req.user);
  }
}
