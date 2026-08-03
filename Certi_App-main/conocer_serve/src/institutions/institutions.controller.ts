import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Request, UseGuards,
  HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { InstitutionsService } from './institutions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateInstitutionDto } from './dto/create-institution.dto';

interface Req extends Request {
  user: { id: string; role: string; institution_id: string | null };
}

@Controller('institutions')
@UseGuards(JwtAuthGuard)
export class InstitutionsController {
  constructor(private readonly svc: InstitutionsService) {}

  @Get()
  list(@Request() req: Req) { return this.svc.listInstitutions(req.user); }

  @Get('stats')
  stats(@Request() req: Req) { return this.svc.getStats(req.user); }

  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string) { return this.svc.getInstitution(id); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateInstitutionDto, @Request() req: Req) {
    return this.svc.createInstitution(dto, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateInstitutionDto>,
    @Request() req: Req,
  ) { return this.svc.updateInstitution(id, dto, req.user); }

  @Patch(':id/toggle-active')
  toggle(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.toggleInstitution(id, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.deleteInstitution(id, req.user);
  }
}
