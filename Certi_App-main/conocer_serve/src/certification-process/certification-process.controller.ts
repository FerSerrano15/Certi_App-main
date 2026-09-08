import {
  Controller, Get, Post,
  Body, Param, Query, Request, UseGuards,
  HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { CertificationProcessService } from './certification-process.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateProcessDto } from './dto/create-process.dto';

interface Req extends Request {
  user: { id: string; role: string; email: string };
}

@Controller('certification-process')
@UseGuards(JwtAuthGuard)
export class CertificationProcessController {
  constructor(private readonly svc: CertificationProcessService) {}

  @Get('qualified-evaluators')
  getQualifiedEvaluators(@Query('estandar_id', ParseUUIDPipe) estandarId: string, @Request() req: Req) {
    return this.svc.getQualifiedEvaluators(estandarId, req.user);
  }

  @Get('mine')
  listMine(@Query('status') status: string, @Request() req: Req) {
    return this.svc.listMine(req.user, status);
  }

  @Get()
  listAll(@Query('status') status: string, @Request() req: Req) {
    return this.svc.listAll(req.user, status);
  }

  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.getOne(id, req.user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateProcessDto, @Request() req: Req) {
    return this.svc.create(dto, req.user);
  }
}
