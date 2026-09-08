import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FichaRegistroService } from './ficha-registro.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateFichaRegistroDto } from './dto/create-ficha-registro.dto';
import { UpdateFichaStatusDto } from './dto/update-ficha-status.dto';

interface Req extends Request {
  user: { id: string; role: string };
}

@UseGuards(JwtAuthGuard)
@Controller('ficha-registro')
export class FichaRegistroController {
  constructor(private readonly svc: FichaRegistroService) {}

  // POST /ficha-registro — crear una nueva ficha para un estándar
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateFichaRegistroDto, @Request() req: Req) {
    return this.svc.create(req.user.id, dto);
  }

  // GET /ficha-registro/mine — todas mis fichas
  @Get('mine')
  findMine(@Request() req: Req) {
    return this.svc.findMine(req.user.id);
  }

  // GET /ficha-registro/all — vista admin "Solicitudes" (todas las fichas + candidato)
  @Get('all')
  findAllWithParticipant(@Request() req: Req) {
    return this.svc.findAllWithParticipant(req.user);
  }

  // GET /ficha-registro/:id — dueño o admin
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.findOne(id, req.user);
  }

  // PATCH /ficha-registro/:id/status — solo admin
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFichaStatusDto,
    @Request() req: Req,
  ) {
    return this.svc.updateStatus(id, dto.status, req.user);
  }
}
