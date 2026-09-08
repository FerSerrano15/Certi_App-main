import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, Request, UseGuards,
  HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { EstandaresService } from './estandares.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateEstandarDto } from './dto/create-estandar.dto';
import { CreateGuiaDto } from './dto/create-guia.dto';
import { CreateReactivoDto } from './dto/create-reactivo.dto';

interface Req extends Request {
  user: { id: string; role: string };
}

@Controller()
@UseGuards(JwtAuthGuard)
export class EstandaresController {
  constructor(private readonly svc: EstandaresService) {}

  // ────────────────── ESTÁNDARES ─────────────────────────────────────────────
  @Get('estandares')
  list(@Query('search') search: string) { return this.svc.list(search); }

  @Get('estandares/:id')
  getOne(@Param('id', ParseUUIDPipe) id: string) { return this.svc.getOne(id); }

  @Post('estandares')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateEstandarDto, @Request() req: Req) {
    return this.svc.create(dto, req.user);
  }

  @Patch('estandares/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateEstandarDto>,
    @Request() req: Req,
  ) { return this.svc.update(id, dto, req.user); }

  @Delete('estandares/:id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.remove(id, req.user);
  }

  // ────────────────── GUÍAS DE OBSERVACIÓN ────────────────────────────────────
  @Post('estandares/:id/guias')
  @HttpCode(HttpStatus.CREATED)
  createGuia(
    @Param('id', ParseUUIDPipe) estandarId: string,
    @Body() dto: CreateGuiaDto,
    @Request() req: Req,
  ) { return this.svc.createGuia(estandarId, dto, req.user); }

  @Patch('guias/:id')
  updateGuia(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateGuiaDto>,
    @Request() req: Req,
  ) { return this.svc.updateGuia(id, dto, req.user); }

  @Delete('guias/:id')
  removeGuia(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.removeGuia(id, req.user);
  }

  // ────────────────── REACTIVOS ────────────────────────────────────────────────
  @Post('guias/:id/reactivos')
  @HttpCode(HttpStatus.CREATED)
  createReactivo(
    @Param('id', ParseUUIDPipe) guiaId: string,
    @Body() dto: CreateReactivoDto,
    @Request() req: Req,
  ) { return this.svc.createReactivo(guiaId, dto, req.user); }

  @Patch('reactivos/:id')
  updateReactivo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateReactivoDto>,
    @Request() req: Req,
  ) { return this.svc.updateReactivo(id, dto, req.user); }

  @Delete('reactivos/:id')
  removeReactivo(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.removeReactivo(id, req.user);
  }
}
