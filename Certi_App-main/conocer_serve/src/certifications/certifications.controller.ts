import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, Request, UseGuards,
  HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { CertificationsService } from './certifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateCertificationDto } from './dto/create-certification.dto';

interface Req extends Request {
  user: { id: string; role: string };
}

@Controller('certifications')
@UseGuards(JwtAuthGuard)
export class CertificationsController {
  constructor(private readonly svc: CertificationsService) {}

  @Get()
  list(@Query('user_id') userId: string, @Request() req: Req) {
    return this.svc.list(req.user, userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCertificationDto, @Request() req: Req) {
    return this.svc.create(dto, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateCertificationDto>,
    @Request() req: Req,
  ) {
    return this.svc.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.remove(id, req.user);
  }
}
