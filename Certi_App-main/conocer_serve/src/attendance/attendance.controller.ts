import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, Request, UseGuards,
  HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BulkAttendanceDto } from './dto/create-attendance.dto';

interface Req extends Request {
  user: { id: string; role: string };
}

@Controller('attendance')
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(private readonly svc: AttendanceService) {}

  /** GET /attendance?session_id=xxx — Lista asistencia de una sesión */
  @Get()
  listBySession(@Query('session_id') sessionId: string, @Request() req: Req) {
    return this.svc.listBySession(sessionId, req.user);
  }

  /** POST /attendance/init/:sessionId — Crea registros vacíos para todos los inscritos */
  @Post('init/:sessionId')
  @HttpCode(HttpStatus.CREATED)
  initSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Request() req: Req,
  ) {
    return this.svc.initSessionAttendance(sessionId, req.user);
  }

  /** POST /attendance/bulk — Guarda asistencia en lote */
  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  bulk(@Body() dto: BulkAttendanceDto, @Request() req: Req) {
    return this.svc.bulkUpsert(dto, req.user);
  }

  /** PATCH /attendance/toggle/:sessionId/:enrollmentId — Cambia presente/ausente */
  @Patch('toggle/:sessionId/:enrollmentId')
  toggle(
    @Param('sessionId', ParseUUIDPipe)    sessionId: string,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Request() req: Req,
  ) {
    return this.svc.toggle(sessionId, enrollmentId, req.user);
  }

  /** POST /attendance/recalculate/:groupId — Recalcula % asistencia de todos los inscritos */
  @Post('recalculate/:groupId')
  recalculate(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Request() req: Req,
  ) {
    return this.svc.recalculateAttendance(groupId, req.user);
  }
}
