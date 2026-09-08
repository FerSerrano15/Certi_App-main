import {
  Controller, Get, Post, Patch,
  Body, Param, Query, Request, UseGuards,
  HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { SolicitudesService } from './solicitudes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateSolicitudDto } from './dto/create-solicitud.dto';
import { ReviewSolicitudDto } from './dto/review-solicitud.dto';
import { PrepareSolicitudDto } from './dto/prepare-solicitud.dto';

interface Req extends Request {
  user: { id: string; role: string; email: string };
}

@Controller('solicitudes')
@UseGuards(JwtAuthGuard)
export class SolicitudesController {
  constructor(private readonly svc: SolicitudesService) {}

  @Get('mine')
  listMine(@Request() req: Req) {
    return this.svc.listMine(req.user);
  }

  @Get()
  listAll(@Query('status') status: string, @Request() req: Req) {
    return this.svc.listAll(req.user, status);
  }

  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.getOne(id, req.user);
  }

  @Get(':id/history')
  getHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getHistory(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSolicitudDto, @Request() req: Req) {
    return this.svc.create(dto, req.user);
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.cancel(id, req.user);
  }

  @Patch(':id/review')
  review(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewSolicitudDto, @Request() req: Req) {
    return this.svc.review(id, dto, req.user);
  }

  @Patch(':id/prepare')
  prepare(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PrepareSolicitudDto, @Request() req: Req) {
    return this.svc.prepare(id, dto, req.user);
  }
}
